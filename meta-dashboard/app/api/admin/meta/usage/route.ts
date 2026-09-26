import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { metaConfig } from '@/lib/meta/config'
import { ensureRuntime } from '@/lib/meta/runtime'
import { clientLogos } from '@/lib/managersStore'
import { buildReport, type UsageRow } from '@/lib/metaUsage'
import { pagedAll } from '@/lib/pagedRows'

export const dynamic = 'force-dynamic'

/** Consumo da API da Meta: chamadas por tipo de consulta e por cliente, uso real informado pela Meta e o teto do app. Administrador ou dono. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })
  await ensureRuntime()
  const hours = req.nextUrl.searchParams.get('window') === '24h' ? 24 : 1
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const { data, error } = await pagedAll<UsageRow>(() => db.from('meta_api_usage').select('client_id,endpoint,calls,outcome,dry_run,app_pct,account_pct').gte('created_at', since).order('id'))
  if (error) return NextResponse.json({ setup: /relation|schema cache|does not exist/i.test(error.message) ? 'sql' : 'error' })
  const report = buildReport(data)
  const [names, logos] = await Promise.all([db.from('clients').select('id,slug,display_name'), clientLogos()])
  const bySlug = new Map(((names.data ?? []) as Array<{ id: string; slug: string; display_name: string | null }>).map(c => [c.id, c]))
  return NextResponse.json({
    setup: 'ready', hours, cap: metaConfig().maxCallsPerAppHour, ...report,
    byClient: report.byClient.slice(0, 15).map(c => { const cl = bySlug.get(c.clientId); return { ...c, name: cl?.display_name ?? cl?.slug ?? 'Cliente removido', logoUrl: cl ? logos.get(cl.slug) ?? null : null } }),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
