import { NextRequest, NextResponse, after } from 'next/server'
import { requireRole } from '@/lib/admin'
import { usageSince } from '@/lib/usage'
import { OPTIMIZATION_KINDS, cleanManagerInput, countByKind, dailyCounts } from '@/lib/managers'
import { autoLinkActors, clientNames, lastSyncAt, loadRegistry, readLog, saveManager, syncMetaActivity, tablesMissing, timeByEmail } from '@/lib/managersStore'
import { getSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Gestores de tráfego: lista com carteira e números do período. Administrador ou dono. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })
  const now = Date.now()
  const period = ['today', '7', '30'].includes(req.nextUrl.searchParams.get('period') ?? '') ? req.nextUrl.searchParams.get('period') as string : '7'
  const sinceMs = usageSince(period, now)
  const sinceIso = new Date(sinceMs).toISOString()

  if (await autoLinkActors().catch(() => 0)) await loadRegistry(true)
  const reg = await loadRegistry(true)
  if (!reg) {
    const probe = await db.from('traffic_managers').select('id').limit(1)
    return NextResponse.json({ setup: probe.error && tablesMissing(probe.error.message) ? 'tables' : 'error' })
  }
  const [rows, names, sync] = await Promise.all([readLog({ sinceIso, limit: 20000 }), clientNames(), lastSyncAt()])
  const time = await timeByEmail(reg.managers.flatMap(m => (m.email ? [m.email] : [])), sinceIso)

  const bySlug = new Map<string, string>(reg.byClient)
  const managers = reg.managers.map(m => {
    const mine = (rows ?? []).filter(r => r.manager_id === m.id)
    const slugs = [...bySlug.entries()].filter(([, id]) => id === m.id).map(([s]) => s)
    return {
      ...m, clients: slugs.map(slug => ({ slug, name: names.get(slug) ?? slug })),
      actions: mine.length, optimizations: mine.filter(r => (OPTIMIZATION_KINDS as readonly string[]).includes(r.kind)).length,
      activeSec: m.email ? time.get(m.email)?.total ?? 0 : null, lastAt: mine[0]?.at ?? null,
      byKind: countByKind(mine), daily: dailyCounts(mine, sinceMs, now).map(d => d.n),
    }
  })
  const clients = [...names.entries()].map(([slug, name]) => ({ slug, name, managerId: bySlug.get(slug) ?? null })).sort((a, b) => a.name.localeCompare(b.name))
  const nameOfManager = new Map(reg.managers.map(m => [m.id, m.name]))
  const avatarOfManager = new Map(reg.managers.map(m => [m.id, m.avatarUrl]))
  const recent = (rows ?? []).filter(r => r.manager_id).slice(0, 30).map(r => ({ at: r.at, source: r.source, kind: r.kind, summary: r.summary, clientName: names.get(r.client_slug) ?? r.client_slug, managerId: r.manager_id, managerName: nameOfManager.get(r.manager_id!) ?? r.manager_id, managerAvatar: avatarOfManager.get(r.manager_id!) ?? null, actorName: r.actor_name, objectName: r.object_name }))
  const stale = !sync || Date.now() - Date.parse(sync) > 4 * 60_000
  if (stale) after(() => { void syncMetaActivity({ budgetMs: 45_000, limit: 8 }).catch(() => { }) }) // abrir a página mantém o histórico da Meta em dia
  return NextResponse.json({
    setup: 'ready', period, managers, recent, clients, unassigned: clients.filter(c => !c.managerId), lastSync: sync,
    totals: { actions: (rows ?? []).filter(r => r.manager_id).length, optimizations: (rows ?? []).filter(r => r.manager_id && (OPTIMIZATION_KINDS as readonly string[]).includes(r.kind)).length },
  })
}

export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const input = cleanManagerInput(await req.json().catch(() => null))
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })
  const r = await saveManager(input)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  after(() => { void syncMetaActivity({ budgetMs: 45_000, limit: 8 }).catch(() => { }); void autoLinkActors(true).catch(() => { }) })
  return NextResponse.json({ ok: true, manager: r.manager })
}
