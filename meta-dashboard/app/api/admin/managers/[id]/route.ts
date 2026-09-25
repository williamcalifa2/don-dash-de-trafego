import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { usageSince } from '@/lib/usage'
import { OPTIMIZATION_KINDS, activityByClient, cleanManagerInput, countByKind, countBySource, dailyCounts, hourCounts, idleSlugs, isKind } from '@/lib/managers'
import { clientNames, deleteManager, loadRegistry, readLog, saveManager, timeByEmail } from '@/lib/managersStore'

export const dynamic = 'force-dynamic'

const IDLE_DAYS = 7

/** Perfil de um gestor: carteira, tempo em cada cliente, ações por tipo e dia, e a linha do tempo. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const { id } = await ctx.params
  const q = req.nextUrl.searchParams
  const period = ['today', '7', '30'].includes(q.get('period') ?? '') ? q.get('period') as string : '7'
  const now = Date.now()
  const sinceMs = usageSince(period, now)
  const sinceIso = new Date(sinceMs).toISOString()
  const client = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.get('client') ?? '') ? q.get('client') as string : ''
  const kind = isKind(q.get('kind')) ? q.get('kind') as string : ''
  const scope = q.get('scope') === 'actor' ? 'actor' : 'accounts'

  const reg = await loadRegistry(true)
  if (!reg) return NextResponse.json({ setup: 'tables' })
  const manager = reg.managers.find(m => m.id === id)
  if (!manager) return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 404 })
  const slugs = [...reg.byClient.entries()].filter(([, mid]) => mid === id).map(([s]) => s)
  const actorKeys = [manager.email, manager.metaActorId ? `meta:${manager.metaActorId}` : null].filter((x): x is string => !!x)

  const [inAccounts, byMe, recent, names, time] = await Promise.all([
    readLog({ managerId: id, sinceIso, limit: 10000 }),
    actorKeys.length ? readLog({ actorKeys, sinceIso, limit: 10000 }) : Promise.resolve([]),
    readLog({ clients: slugs, sinceIso: new Date(now - 90 * 86_400_000).toISOString(), limit: 10000 }),
    clientNames(),
    timeByEmail(manager.email ? [manager.email] : [], sinceIso),
  ])
  const mineTime = manager.email ? time.get(manager.email) : undefined
  const accountsRows = inAccounts ?? []
  const stats = activityByClient(slugs, accountsRows)
  const lastAny = new Map<string, string | null>()
  for (const r of recent ?? []) if (!lastAny.has(r.client_slug)) lastAny.set(r.client_slug, r.at)
  const idle = idleSlugs(lastAny, slugs, IDLE_DAYS, now)
  const listSource = (scope === 'actor' ? byMe : accountsRows) ?? []
  const timeline = listSource.filter(r => (!client || r.client_slug === client) && (!kind || r.kind === kind)).slice(0, 300)

  return NextResponse.json({
    setup: 'ready', period, scope, manager, hasEmail: !!manager.email, hasActor: !!manager.metaActorId,
    totals: {
      actions: accountsRows.length, optimizations: accountsRows.filter(r => (OPTIMIZATION_KINDS as readonly string[]).includes(r.kind)).length,
      byMe: (byMe ?? []).length, activeSec: mineTime?.total ?? null, idle: idle.length,
    },
    byKind: countByKind(accountsRows), daily: dailyCounts(accountsRows, sinceMs, now), hours: hourCounts(accountsRows), bySource: countBySource(accountsRows),
    clients: stats.map(s => ({ ...s, name: names.get(s.slug) ?? s.slug, timeSec: mineTime?.byClient.get(s.slug) ?? 0, daysIdle: idle.find(i => i.slug === s.slug)?.daysIdle ?? 0 })),
    idle: idle.map(i => ({ ...i, name: names.get(i.slug) ?? i.slug })),
    otherTime: mineTime ? [...mineTime.byClient.entries()].filter(([s]) => !slugs.includes(s)).map(([slug, sec]) => ({ slug, name: names.get(slug) ?? slug, sec })).sort((a, b) => b.sec - a.sec).slice(0, 10) : [],
    timeline: timeline.map(r => ({ ...r, clientName: names.get(r.client_slug) ?? r.client_slug })),
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const { id } = await ctx.params
  const input = cleanManagerInput(await req.json().catch(() => null))
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })
  const r = await saveManager(input, id)
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true, manager: r.manager })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const { id } = await ctx.params
  const err = await deleteManager(id)
  return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true })
}
