import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { scopeFor } from '@/lib/scope'
import { getSupabaseServer } from '@/lib/supabase'
import { logoPublicUrl } from '@/lib/logo'
import { getAllClientsConfig, hasEcommerce } from '@/lib/clientConfig'
import { platformsFor, type PlatformKey } from '@/lib/platforms'
import { legacyGet } from '@/lib/meta/legacy'
import { stores } from '@/lib/meta/stores'
import { StoreNotMigrated } from '@/lib/meta/limits'
import { loadRegistry } from '@/lib/activityLog'
import { liveOrigin } from '@/lib/meta/mode'
import { BILLING_FIELDS, billingOf, bySeverity, type Billing, type RawAccount } from '@/lib/billing'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const POOL = 4
/** Contas lidas por abertura da página: o resto vem do que ficou guardado e as demais entram nas próximas aberturas. */
const MAX_READS = 8

/** Situação financeira das contas de anúncios dos clientes que a pessoa pode ver. Somente leitura; cada conta é uma consulta (guardada por alguns minutos). */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })
  const scope = await scopeFor(req)
  let q = db.from('clients').select('id,slug,display_name,logo_url,ad_account_id').not('ad_account_id', 'is', null).order('display_name')
  if (scope.slugs) q = q.in('slug', [...scope.slugs])
  const { data } = await q
  const rows = (data ?? []) as Array<{ id: string; slug: string; display_name: string | null; logo_url: string | null; ad_account_id: string }>
  const origin = await liveOrigin()
  const reg = await loadRegistry().catch(() => null)
  const cfgs = await getAllClientsConfig(rows.map(r => r.slug))

  type Item = { platforms: PlatformKey[]; managerId: string | null; slug: string; name: string; logoUrl: string | null; active: boolean; accountId: string; billing: Billing | null; error: string | null; severity: Billing['severity']; at: number | null }
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const now = Date.now()
  // A situação financeira muda devagar: fica guardada por 1 h (5 min com "Atualizar") e só as contas mais antigas são lidas a cada abertura.
  // Ler as ~35 contas toda vez estourava o teto de chamadas por hora do app.
  const snaps = await Promise.all(rows.map(async c => { try { return await stores.snaps.get<RawAccount>(c.id, 'billing', '') } catch (e) { if (e instanceof StoreNotMigrated) return null; throw e } }))
  const ttl = refresh ? 5 * 60_000 : 60 * 60_000
  const due = rows.map((c, i) => ({ i, age: snaps[i] ? now - snaps[i]!.fetchedAt : Infinity })).filter(x => x.age >= ttl).sort((a, b) => b.age - a.age).slice(0, MAX_READS)
  const fetched = new Map<number, { raw?: RawAccount; error?: string }>()
  let next = 0
  await Promise.all(Array.from({ length: Math.min(POOL, due.length) }, async () => {
    while (next < due.length) {
      const { i } = due[next++]
      const c = rows[i]
      const r = await legacyGet<RawAccount>(`${c.ad_account_id}?fields=${BILLING_FIELDS}`, { accountId: c.ad_account_id, clientId: c.id, purpose: 'billing', origin })
      if (r.ok) {
        fetched.set(i, { raw: r.data })
        try { await stores.snaps.put(c.id, 'billing', '', r.data, now) } catch (e) { if (!(e instanceof StoreNotMigrated)) throw e }
      } else fetched.set(i, { error: r.blocked ? 'Leitura pausada para proteger o limite da Meta. Volta sozinha em alguns minutos.' : r.error?.message ?? 'Não foi possível ler esta conta agora.' })
    }
  }))
  const items: Item[] = rows.map((c, i) => {
    const base = { platforms: platformsFor({ adAccountId: c.ad_account_id, ecommerce: cfgs[c.slug] ? hasEcommerce(cfgs[c.slug]) : false, google: Boolean(cfgs[c.slug]?.googleAdsCustomerId) }), managerId: reg?.byClient.get(c.slug) ?? null, slug: c.slug, name: c.display_name ?? c.slug, logoUrl: logoPublicUrl(c.slug, c.logo_url), active: cfgs[c.slug]?.active !== false, accountId: c.ad_account_id }
    const f = fetched.get(i)
    const raw = f?.raw ?? snaps[i]?.payload
    const at = f?.raw ? now : snaps[i]?.fetchedAt ?? null
    if (raw) { const b = billingOf(raw); return { ...base, billing: b, error: null, severity: b.severity, at } }
    return { ...base, billing: null, error: f?.error ?? 'Aguardando a primeira leitura.', severity: 'attention' as const, at: null }
  })
  const pending = items.filter(i => !i.billing).length
  items.sort(bySeverity)
  const count = (s: Billing['severity']) => items.filter(i => i.severity === s).length
  return NextResponse.json({ managers: scope.slugs ? [] : (reg?.managers ?? []).map(m => ({ id: m.id, name: m.name })), items, totals: { critical: count('critical'), attention: count('attention'), ok: count('ok') }, pending, oldest: items.reduce<number | null>((m, i) => (i.at != null && (m == null || i.at < m) ? i.at : m), null), at: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
}
