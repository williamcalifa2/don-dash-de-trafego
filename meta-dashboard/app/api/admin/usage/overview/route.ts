import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { activityBreakdown, buildVisits, clientsWithoutTeamAccess, focusClient, summarizeUsage, usageSince, type LoginRow, type SessionRow, type ViewRow } from '@/lib/usage'
import { nameFromEmail } from '@/lib/adminProfile'

export const dynamic = 'force-dynamic'

/** Análise de uso: quem está online agora, quem entrou, tempo por pessoa, por cliente e por tela. Só administração. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })

  const period = ['today', '7', '30'].includes(req.nextUrl.searchParams.get('period') ?? '') ? req.nextUrl.searchParams.get('period') as string : '7'
  const user = (req.nextUrl.searchParams.get('user') ?? '').toLowerCase().slice(0, 120) || null
  const clientParam = req.nextUrl.searchParams.get('client') ?? ''
  const limit = Math.min(300, Math.max(10, Number(req.nextUrl.searchParams.get('limit')) || 60))
  const client = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(clientParam) && clientParam.length <= 40 ? clientParam : null
  const now = Date.now()
  const since = new Date(usageSince(period, now)).toISOString()

  const [sess, logins, clients] = await Promise.all([
    db.from('usage_sessions').select('sid,user_key,role,started_at,last_seen,active_sec,last_view,last_client,device,country').gte('last_seen', since).order('last_seen', { ascending: false }).limit(5000),
    db.from('usage_logins').select('at,user_key,role,client_slug,ok,country,city,device').gte('at', since).order('at', { ascending: false }).limit(300),
    db.from('clients').select('slug,display_name'),
  ])
  if (sess.error && /relation|schema cache|does not exist/i.test(sess.error.message)) return NextResponse.json({ setup: 'tables' })

  const sessions = (sess.data ?? []) as SessionRow[]
  const views: ViewRow[] = []
  for (let i = 0; i < sessions.length; i += 200) {
    const ids = sessions.slice(i, i + 200).map(s => s.sid)
    const { data } = await db.from('usage_views').select('sid,client_slug,view,seconds').in('sid', ids).limit(20000)
    views.push(...((data ?? []) as ViewRow[]))
  }

  // Sem cliente escolhido: visão geral. Com cliente: só o que aconteceu dentro dele (quem acessou, quanto tempo, em quais telas).
  const overall = summarizeUsage(sessions, views, now, user)
  const focus = client ? focusClient(sessions, views, client) : null
  const summary = focus ? summarizeUsage(focus.sessions, focus.views, now, user) : overall
  const onlineNow = focus ? summary.online.filter(o => o.client === client) : summary.online
  const kpis = focus ? { ...summary.kpis, online: onlineNow.length } : summary.kpis
  // Cada acesso (sessão): quando entrou, até quando esteve ativo, quanto tempo e em quais telas. Com cliente escolhido, conta só o tempo dentro dele.
  const visitSessions = focus ? focus.sessions : sessions
  const visitViews = focus ? focus.views : views
  const shown = user ? visitSessions.filter(s => s.user_key === user) : visitSessions
  const visits = buildVisits(shown, visitViews, limit, now)
  const breakdown = activityBreakdown(shown, usageSince(period, now), now)
  const clientName = new Map(((clients.data ?? []) as Array<{ slug: string; display_name: string | null }>).map(c => [c.slug, c.display_name || c.slug]))
  const nameOf = (userKey: string) => (userKey.startsWith('cliente:') ? `Cliente ${clientName.get(userKey.slice(8)) ?? userKey.slice(8)}` : nameFromEmail(userKey))

  // Clientes em que a equipe não passou tempo nenhum: só faz sentido na visão geral, sem filtro.
  const allClients = ((clients.data ?? []) as Array<{ slug: string; display_name: string | null }>).map(c => ({ slug: c.slug, name: c.display_name || c.slug }))
  const idleClients = client || user ? [] : clientsWithoutTeamAccess(allClients, sessions, views)

  return NextResponse.json({
    setup: 'ready', period, user, client, generatedAt: now, breakdown, idleClients,
    kpis,
    online: onlineNow.map(o => ({ ...o, name: nameOf(o.userKey), clientName: o.client ? (clientName.get(o.client) ?? o.client) : '' })),
    people: summary.people.map(p => ({ ...p, name: nameOf(p.userKey), topClientName: p.topClient ? (clientName.get(p.topClient) ?? p.topClient) : null })),
    byClient: overall.byClient.map(c => ({ ...c, name: clientName.get(c.slug) ?? c.slug })),
    visits: visits.map(v => ({ ...v, name: nameOf(v.userKey), clientName: v.lastClient ? (clientName.get(v.lastClient) ?? v.lastClient) : '' })),
    byView: summary.byView,
    logins: ((logins.data ?? []) as LoginRow[]).filter(l => !l.ok && (!client || l.client_slug === client) && (!user || l.user_key === user)).map(l => ({ ...l, name: nameOf(l.user_key), clientName: l.client_slug ? (clientName.get(l.client_slug) ?? l.client_slug) : '' })),
  })
}
