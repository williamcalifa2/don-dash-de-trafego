import { NextRequest, NextResponse, after } from 'next/server'
import { requireRole } from '@/lib/admin'
import { usageSince } from '@/lib/usage'
import { OPTIMIZATION_KINDS, cleanManagerInput, countByKind, dailyCounts, isAnswered } from '@/lib/managers'
import { autoLinkActors, clientNames, lastSyncAt, loadRegistry, loadTasks, readLog, saveManager, syncMetaActivity, tablesMissing, timeByEmail } from '@/lib/managersStore'
import { getSupabaseServer } from '@/lib/supabase'
import { listMembers } from '@/lib/team'
import { getAllClientsConfig } from '@/lib/clientConfig'
import { scoreOf } from '@/lib/scorecard'

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
  // Lê 30 dias uma vez: o período escolhido é um recorte disso e o placar (contas paradas, justificadas) precisa da janela toda.
  const [rows30, names, sync] = await Promise.all([readLog({ sinceIso: new Date(now - 30 * 86_400_000).toISOString(), limit: 30000 }), clientNames(), lastSyncAt()])
  const rows = rows30 ? rows30.filter(r => r.at >= sinceIso) : rows30
  const cfgs = await getAllClientsConfig([...reg.byClient.keys()])
  const tk = await loadTasks()
  const openTasks = 'tasks' in tk ? tk.tasks.filter(t => !isAnswered(t)) : []
  const time = await timeByEmail(reg.managers.flatMap(m => (m.email ? [m.email] : [])), sinceIso)

  const bySlug = new Map<string, string>(reg.byClient)
  const managers = reg.managers.map(m => {
    const mine = (rows ?? []).filter(r => r.manager_id === m.id)
    const slugs = [...bySlug.entries()].filter(([, id]) => id === m.id).map(([s]) => s)
    const score = scoreOf({
      manager: m, slugs: slugs.filter(s => cfgs[s]?.active !== false), rows: rows30 ?? [], sinceMs, nowMs: now, stalledDays: 3,
      tasks: 'tasks' in tk ? tk.tasks.filter(t => t.ownerId === m.id).map(t => ({ answered: isAnswered(t) })) : [],
    })
    return {
      ...m, score, clients: slugs.map(slug => ({ slug, name: names.get(slug) ?? slug })),
      actions: mine.length, optimizations: mine.filter(r => (OPTIMIZATION_KINDS as readonly string[]).includes(r.kind)).length,
      activeSec: m.email ? time.get(m.email)?.total ?? 0 : null, lastAt: mine[0]?.at ?? null,
      pending: openTasks.filter(t => t.ownerId === m.id).length,
      byKind: countByKind(mine), daily: dailyCounts(mine, sinceMs, now).map(d => d.n),
    }
  })
  const clients = [...names.entries()].map(([slug, name]) => ({ slug, name, managerId: bySlug.get(slug) ?? null })).sort((a, b) => a.name.localeCompare(b.name))
  // Pessoas da equipe (Membro/Leitor) que entram no painel mas não estão ligadas a nenhum gestor: enquanto isso, veem todos os clientes.
  const linkedEmails = new Set(reg.managers.flatMap(m => (m.email ? [m.email] : [])))
  const unlinkedMembers = ((await listMembers().catch(() => null)) ?? []).filter(m => (m.role === 'member' || m.role === 'reader') && !linkedEmails.has(m.email)).map(m => m.email)
  const nameOfManager = new Map(reg.managers.map(m => [m.id, m.name]))
  const avatarOfManager = new Map(reg.managers.map(m => [m.id, m.avatarUrl]))
  const recent = (rows ?? []).filter(r => r.manager_id).slice(0, 30).map(r => ({ at: r.at, source: r.source, kind: r.kind, summary: r.summary, clientName: names.get(r.client_slug) ?? r.client_slug, managerId: r.manager_id, managerName: nameOfManager.get(r.manager_id!) ?? r.manager_id, managerAvatar: avatarOfManager.get(r.manager_id!) ?? null, actorName: r.actor_name, objectName: r.object_name }))
  const stale = !sync || Date.now() - Date.parse(sync) > 8 * 60_000
  if (stale) after(() => { void syncMetaActivity({ budgetMs: 45_000, limit: 6 }).catch(() => { }) }) // abrir a página mantém o histórico da Meta em dia
  return NextResponse.json({
    setup: 'ready', period, managers, recent, unlinkedMembers, clients, unassigned: clients.filter(c => !c.managerId), lastSync: sync,
    totals: { pending: openTasks.filter(t => t.ownerId).length, actions: (rows ?? []).filter(r => r.manager_id).length, optimizations: (rows ?? []).filter(r => r.manager_id && (OPTIMIZATION_KINDS as readonly string[]).includes(r.kind)).length },
  })
}

export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const input = cleanManagerInput(await req.json().catch(() => null))
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })
  const r = await saveManager(input)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  after(() => { void syncMetaActivity({ budgetMs: 45_000, limit: 6 }).catch(() => { }); void autoLinkActors(true).catch(() => { }) })
  return NextResponse.json({ ok: true, manager: r.manager })
}
