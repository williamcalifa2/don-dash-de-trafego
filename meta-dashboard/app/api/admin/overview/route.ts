import { NextRequest, NextResponse, after } from 'next/server'
import { maybeSyncActivity } from '@/lib/managersStore'
import { requireAdmin } from '@/lib/admin'
import { scopeFor } from '@/lib/scope'
import { getSupabaseServer } from '@/lib/supabase'
import { dailyRowsFor } from '@/lib/adminData'
import { aggregate } from '@/lib/adminOverview'
import { ensureRuntime } from '@/lib/meta/runtime'
import { parseAdminPeriod } from '@/lib/periods'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const MAX_LIVE = 12

/** Visão geral: métricas somadas de todos os clientes. Lê do banco (ou consulta curta em cache antes do corte automático). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  after(() => { void maybeSyncActivity() })
  const db = getSupabaseServer()
  const period = parseAdminPeriod(req.nextUrl.searchParams.get('period') ?? req.nextUrl.searchParams.get('days')) ?? 7

  if (!db) {
    return NextResponse.json({
      days: 7, period: '7',
      dates: Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (7 - 1 - i) * 86_400_000).toISOString().slice(0, 10)),
      spend: [2400, 2800, 2600, 3100, 2900, 3200, 3500],
      results: [48, 55, 52, 63, 58, 65, 70],
      impressions: [35000, 39000, 37000, 42000, 40000, 44000, 47000],
      clicks: [1200, 1400, 1300, 1600, 1450, 1650, 1800],
      totals: { spend: 20500, impressions: 284000, clicks: 10400, results: 411 },
      prev: { spend: 18200, impressions: 251000, clicks: 9200, results: 365 },
      clientsWithData: 4, clientsTotal: 4, partial: false,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const slug = (req.nextUrl.searchParams.get('client') ?? '').trim().toLowerCase()
  let q = db.from('clients').select('id, slug, ad_account_id').order('slug')
  if (slug) q = q.eq('slug', slug)
  const scope = await scopeFor(req)
  if (scope.slugs) q = q.in('slug', [...scope.slugs]) // só a carteira: a visão geral soma e consulta menos clientes
  const { data, error } = await q
  if (error || !data || data.length === 0) {
    return NextResponse.json({
      days: 7, period: '7',
      dates: Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (7 - 1 - i) * 86_400_000).toISOString().slice(0, 10)),
      spend: [2400, 2800, 2600, 3100, 2900, 3200, 3500],
      results: [48, 55, 52, 63, 58, 65, 70],
      impressions: [35000, 39000, 37000, 42000, 40000, 44000, 47000],
      clicks: [1200, 1400, 1300, 1600, 1450, 1650, 1800],
      totals: { spend: 20500, impressions: 284000, clicks: 10400, results: 411 },
      prev: { spend: 18200, impressions: 251000, clicks: 9200, results: 365 },
      clientsWithData: 4, clientsTotal: 4, partial: false,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }
  await ensureRuntime()
  const budget = { live: MAX_LIVE }
  const clients = (data ?? []) as Array<{ id: string; ad_account_id: string | null }>
  const withAccount = clients.filter(c => c.ad_account_id)
  const rows = await Promise.all(withAccount.map(async c => (await dailyRowsFor(c.id, c.ad_account_id, { allowLive: true }, budget))?.rows ?? null))
  return NextResponse.json(aggregate(rows, withAccount.length, Date.now(), period), { headers: { 'Cache-Control': 'no-store' } })
}
