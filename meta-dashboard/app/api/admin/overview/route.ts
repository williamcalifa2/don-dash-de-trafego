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
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const period = parseAdminPeriod(req.nextUrl.searchParams.get('period') ?? req.nextUrl.searchParams.get('days')) ?? 7

  const slug = (req.nextUrl.searchParams.get('client') ?? '').trim().toLowerCase()
  let q = db.from('clients').select('id, slug, ad_account_id').order('slug')
  if (slug) q = q.eq('slug', slug)
  const scope = await scopeFor(req)
  if (scope.slugs) q = q.in('slug', [...scope.slugs]) // só a carteira: a visão geral soma e consulta menos clientes
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await ensureRuntime()
  const budget = { live: MAX_LIVE }
  const clients = (data ?? []) as Array<{ id: string; ad_account_id: string | null }>
  const withAccount = clients.filter(c => c.ad_account_id)
  const rows = await Promise.all(withAccount.map(async c => (await dailyRowsFor(c.id, c.ad_account_id, { allowLive: true }, budget))?.rows ?? null))
  return NextResponse.json(aggregate(rows, withAccount.length, Date.now(), period), { headers: { 'Cache-Control': 'no-store' } })
}
