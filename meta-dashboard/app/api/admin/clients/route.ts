import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole, requireServiceKey } from '@/lib/admin'
import { getSupabaseServer, serviceKeyStatus } from '@/lib/supabase'
import { clearClientCache, tenantBySlug } from '@/lib/tenant'
import { syncLeads } from '@/lib/metaLeads'
import { generateCode, codeHash } from '@/lib/accessCode'
import { RESERVED_SLUGS, SLUG_RE } from '@/lib/host'
import { STALE_HOURS, STALE_MAX_HOURS } from '@/lib/leadUtils'
import { logoPublicUrl, parseLogoInput } from '@/lib/logo'
import { periodKeys, summarizeDaily, type ResultsSummary } from '@/lib/adminResults'
import { ADMIN_PERIOD_KEYS, type AdminPeriod } from '@/lib/periods'
import { dailyRowsFor } from '@/lib/adminData'
import { applySummaries, liveSummary, loadSummaryMap, PRESET_OF, type SummaryMap } from '@/lib/adminSummary'
import { parseAdminPeriod } from '@/lib/periods'
import { stores } from '@/lib/meta/stores'
import { ensureRuntime } from '@/lib/meta/runtime'
import { liveOrigin } from '@/lib/meta/mode'

export const dynamic = 'force-dynamic'
const COLUMNS = 'id, slug, display_name, logo_url, ad_account_id, page_id, access_code_hash, locked_until'
const DAYS = 14
const BR_OFFSET = 3 * 3600 * 1000 // dias contados no horário de Brasília

// Cliente sem leads de formulário (site/conversas): o card mostra o resultado real da conta (ver lib/adminData.ts).
const MAX_LIVE_PER_REQUEST = 30

async function resultsFor(clientId: string, account: string | null, hasCrmLeads: boolean, budget: { live: number }): Promise<{ s: ResultsSummary; at: number } | null> {
  // O card mostra números da Meta para qualquer cliente: sem cópia no banco, faz a consulta curta (cache de 15 min, no máximo 8 por abertura).
  void hasCrmLeads
  const d = await dailyRowsFor(clientId, account, { allowLive: true }, budget)
  return d ? { s: summarizeDaily(d.rows, Date.now()), at: d.at } : null
}

const dayKey = (t: number) => new Date(t - BR_OFFSET).toISOString().slice(0, 10)

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })

  const { data, error } = await db.from('clients').select(COLUMNS).order('slug')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Últimos leads (para o feed de atividade): só os 8 mais recentes, de todos os clientes.
  const { data: feed } = await db.from('leads').select('client_id, nome, campanha, status, created_at').order('created_at', { ascending: false }).limit(8)

  const days = Array.from({ length: DAYS }, (_, i) => dayKey(Date.now() - (DAYS - 1 - i) * 86_400_000))
  const today = days[DAYS - 1]
  const now = Date.now()
  const since30 = new Date(now - 31 * 86_400_000).toISOString()

  await ensureRuntime()
  const budget = { live: MAX_LIVE_PER_REQUEST }
  const selected = parseAdminPeriod(req.nextUrl.searchParams.get('period')) ?? 7
  let summaries: SummaryMap = new Map()
  try { summaries = await loadSummaryMap(stores.snaps) } catch { /* sem as tabelas: os cards usam a série diária */ }
  const clients = await Promise.all((data ?? []).map(async c => {
    // Leads dos últimos 30 dias deste cliente (para todos os períodos do card).
    const q = (cols: string) => db.from('leads').select(cols)
      .eq('client_id', c.id).gte('created_at', since30).order('created_at', { ascending: false }).limit(5000)
    let r = await q('created_at, status, valor_pedido, ultimo_contato, meta_lead_id, manual')
    if (r.error) r = await q('created_at, status, valor_pedido, ultimo_contato, meta_lead_id') // banco ainda sem a coluna "manual"
    const mine = (r.data ?? []) as unknown as Array<{ created_at: string; status: string; valor_pedido: number | null; ultimo_contato: string | null; meta_lead_id?: string | null; manual?: boolean }>
    const dayOf = (l: { created_at: string }) => dayKey(new Date(l.created_at).getTime())
    const daily = days.map(d => mine.filter(l => dayOf(l) === d).length)
    const crmPeriods = Object.fromEntries(ADMIN_PERIOD_KEYS.map(p => {
      // O CRM conta até hoje; "hoje" é só hoje; "mês" vai do dia 1 até hoje.
      const win = new Set(typeof p === 'number' ? Array.from({ length: p }, (_, i) => dayKey(now - (p - 1 - i) * 86_400_000)) : periodKeys(now, p))
      const inWin = mine.filter(l => win.has(dayOf(l)))
      return [p, {
        crmLeads: inWin.length,
        manualLeads: inWin.filter(l => l.manual === undefined ? !l.meta_lead_id : l.manual).length,
        vendas: inWin.filter(l => l.status === 'Convertido').length,
        receita: inWin.reduce((sum, l) => sum + (l.status === 'Convertido' ? Number(l.valor_pedido ?? 0) : 0), 0),
      }]
    })) as Record<AdminPeriod, { crmLeads: number; manualLeads: number; vendas: number; receita: number }>
    const [{ count }, { data: last }] = await Promise.all([
      db.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', c.id),
      db.from('leads').select('created_at').eq('client_id', c.id).order('created_at', { ascending: false }).limit(1),
    ])
    const res0 = await resultsFor(c.id as string, c.ad_account_id as string | null, (count ?? 0) > 0 && mine.length > 0, budget)
    // O período escolhido usa o mesmo resumo que o painel do cliente lê; sem resumo recente, busca na Meta (cache de 4 min, com teto por abertura).
    const acct = c.ad_account_id as string | null
    const mine0 = summaries.get(c.id as string) ?? {}
    const selE = mine0[PRESET_OF[selected]]
    if (acct && (!selE || now - selE.at > 30 * 60_000) && budget.live > 0) {
      budget.live--
      try { const e = await liveSummary(stores.snaps, c.id as string, acct, PRESET_OF[selected], now); if (e) mine0[PRESET_OF[selected]] = e } catch { /* mantém o que já tinha */ }
    }
    const res = applySummaries(res0?.s ?? null, mine0, now, selected)
    const resAt = Math.max(res0?.at ?? 0, ...Object.values(mine0).map(e => e?.at ?? 0))
    const zero = { spend: 0, impressions: 0, clicks: 0, results: 0, formLeads: 0, siteLeads: 0, conversations: 0, custom: 0, purchases: 0, purchaseValue: 0, linkClicks: 0, landingViews: 0 }
    return {
      slug: c.slug as string,
      name: (c.display_name ?? c.slug) as string,
      logoUrl: logoPublicUrl(c.slug as string, c.logo_url as string | null),
      adAccountId: c.ad_account_id as string | null,
      pageId: c.page_id as string | null,
      hasCode: !!c.access_code_hash,
      locked: !!c.locked_until && new Date(c.locked_until as string).getTime() > now,
      leadCount: count ?? 0,
      lastLeadAt: (last?.[0]?.created_at as string | undefined) ?? null,
      leadsToday: daily[DAYS - 1],
      parados: mine.filter(l => { const h = (now - new Date(l.created_at).getTime()) / 3_600_000; return l.status === 'Novo' && !l.ultimo_contato && h > STALE_HOURS && h <= STALE_MAX_HOURS }).length,
      daily,
      resultKind: res?.kind ?? null,
      periods: Object.fromEntries(ADMIN_PERIOD_KEYS.map(p => [p, { ...(res?.periods[p] ?? zero), ...crmPeriods[p] }])),
      resultsSpanDays: res?.spanDays ?? 0,
      resultsDaily: res?.daily ?? null,
      resultsAt: res && resAt ? new Date(resAt).toISOString() : null,
    }
  }))

  const names = new Map((data ?? []).map(c => [c.id as string, { name: (c.display_name ?? c.slug) as string, slug: c.slug as string }]))
  const recent = (feed ?? []).map(l => ({
    client: names.get(l.client_id as string)?.name ?? '—',
    slug: names.get(l.client_id as string)?.slug ?? '',
    nome: l.nome as string | null,
    campanha: l.campanha as string | null,
    status: l.status as string,
    createdAt: l.created_at as string,
  }))

  let cardMetrics: Record<string, unknown> = {}
  try {
    const { data: m } = await db.from('meta_settings').select('value').eq('key', 'admin_card_metrics').maybeSingle()
    const v = (m as { value: unknown } | null)?.value
    if (v && typeof v === 'object') cardMetrics = v as Record<string, unknown>
  } catch { /* tabela ainda não existe: padrão */ }
  let brandLogoUrl: string | null = null
  try {
    const { data: b } = await db.from('meta_settings').select('value').eq('key', 'brand_logo').maybeSingle()
    const v = (b as { value: unknown } | null)?.value
    if (typeof v === 'string' && v.startsWith('data:')) brandLogoUrl = logoPublicUrl('brand', v)!.replace('/api/logo/brand', '/api/admin/brand')
  } catch { /* tabela ainda não existe: sem logo */ }

  return NextResponse.json({
    clients, recent, today, brandLogoUrl, cardMetrics,
    keyStatus: serviceKeyStatus(),
    baseDomain: (process.env.DASHBOARD_BASE_DOMAIN ?? '').trim().toLowerCase() || null,
  })
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const badKey = requireServiceKey()
  if (badKey) return badKey
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })

  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const name = clean(b.name), slug = clean(b.slug)?.toLowerCase() ?? null
  const adAccountId = clean(b.adAccountId), pageId = clean(b.pageId)
  const logo = parseLogoInput(b.logoUrl)
  if (!name || name.length > 80) return NextResponse.json({ error: 'Informe o nome do cliente (até 80 caracteres).' }, { status: 400 })
  if (!slug || slug.length > 40 || !SLUG_RE.test(slug)) return NextResponse.json({ error: 'O endereço deve ter só letras minúsculas, números e hífen.' }, { status: 400 })
  if (RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: 'Esse endereço é reservado. Escolha outro.' }, { status: 400 })
  if (adAccountId && !/^(act_)?\d{5,20}$/.test(adAccountId)) return NextResponse.json({ error: 'Conta de anúncios inválida (ex.: act_123456789).' }, { status: 400 })
  if (pageId && !/^\d{5,25}$/.test(pageId)) return NextResponse.json({ error: 'ID da página inválido (só números).' }, { status: 400 })
  if (!logo.ok) return NextResponse.json({ error: logo.error }, { status: 400 })

  const { data: existing } = await db.from('clients').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Já existe um cliente com esse endereço.' }, { status: 409 })

  const code = generateCode()
  const row: Record<string, unknown> = {
    slug, display_name: name, logo_url: logo.value, page_id: pageId,
    ad_account_id: adAccountId ? (adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`) : null,
    access_code_hash: codeHash(slug, code), failed_attempts: 0, locked_until: null,
  }
  let { error } = await db.from('clients').insert(row)
  // A tabela pode ter uma coluna "name" obrigatória de antes; preenche e tenta de novo.
  if (error && /null value in column "name"/i.test(error.message)) ({ error } = await db.from('clients').insert({ ...row, name }))
  clearClientCache()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Já traz do Meta os leads dos últimos 30 dias (se falhar, o cliente continua criado e o cron importa depois).
  let imported: number | null = null
  try {
    const t = await tenantBySlug(slug)
    if (t?.adAccountId) { const r = await syncLeads(t, 30, { origin: await liveOrigin() }); imported = r.error ? null : r.imported }
  } catch {}
  return NextResponse.json({ ok: true, slug, code, imported })
}
