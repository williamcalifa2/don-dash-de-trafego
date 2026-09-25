import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { scopeFor } from '@/lib/scope'
import { getSupabaseServer } from '@/lib/supabase'
import { logoPublicUrl } from '@/lib/logo'
import { getAllClientsConfig } from '@/lib/clientConfig'
import { legacyGet } from '@/lib/meta/legacy'
import { loadRegistry } from '@/lib/activityLog'
import { liveOrigin } from '@/lib/meta/mode'
import { BILLING_FIELDS, billingOf, bySeverity, type Billing, type RawAccount } from '@/lib/billing'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const POOL = 4

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

  type Item = { managerId: string | null; slug: string; name: string; logoUrl: string | null; active: boolean; accountId: string; billing: Billing | null; error: string | null; severity: Billing['severity'] }
  const items: Item[] = new Array(rows.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(POOL, rows.length) }, async () => {
    while (next < rows.length) {
      const i = next++
      const c = rows[i]
      const base = { managerId: reg?.byClient.get(c.slug) ?? null, slug: c.slug, name: c.display_name ?? c.slug, logoUrl: logoPublicUrl(c.slug, c.logo_url), active: cfgs[c.slug]?.active !== false, accountId: c.ad_account_id }
      const r = await legacyGet<RawAccount>(`${c.ad_account_id}?fields=${BILLING_FIELDS}`, { accountId: c.ad_account_id, clientId: c.id, purpose: 'billing', origin })
      if (r.ok) { const b = billingOf(r.data); items[i] = { ...base, billing: b, error: null, severity: b.severity } }
      else items[i] = { ...base, billing: null, error: r.error?.message ?? 'Não foi possível ler esta conta agora.', severity: 'attention' }
    }
  }))
  items.sort(bySeverity)
  const count = (s: Billing['severity']) => items.filter(i => i.severity === s).length
  return NextResponse.json({ managers: scope.slugs ? [] : (reg?.managers ?? []).map(m => ({ id: m.id, name: m.name })), items, totals: { critical: count('critical'), attention: count('attention'), ok: count('ok') }, at: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
}
