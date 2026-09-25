import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { heatBins, topElements, usageSince } from '@/lib/usage'
import { scrollBands, type EventRow } from '@/lib/usageQuality'

export const dynamic = 'force-dynamic'

const MODES = ['clicks', 'rage', 'dead', 'scroll'] as const
type Mode = (typeof MODES)[number]
const missingTable = (m: string) => /relation|schema cache|does not exist/i.test(m)

/**
 * Mapa de calor. Sem `view`: devolve a lista de telas com dados (para escolher qual abrir).
 * Com `view`: devolve os pontos agrupados (elemento + posição dentro dele) para desenhar sobre a própria tela.
 * `mode`: clicks (padrão) | rage (cliques de raiva) | dead (cliques mortos) | scroll (até onde rolaram).
 */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })

  const q = req.nextUrl.searchParams
  const period = ['today', '7', '30'].includes(q.get('period') ?? '') ? q.get('period') as string : '7'
  const since = new Date(usageSince(period)).toISOString()
  const view = (q.get('view') ?? '').slice(0, 40)
  const client = (q.get('client') ?? '').slice(0, 40)
  const user = (q.get('user') ?? '').toLowerCase().slice(0, 120)
  const device = ['desktop', 'tablet', 'mobile'].includes(q.get('device') ?? '') ? q.get('device') as string : ''
  const mode: Mode = (MODES as readonly string[]).includes(q.get('mode') ?? '') ? q.get('mode') as Mode : 'clicks'

  // Raiva, mortos e rolagem vêm da tabela de sinais; cliques normais, da de cliques.
  if (mode !== 'clicks') {
    const kind = mode
    const base = () => {
      let b = db.from('usage_events').select('sid,user_key,client_slug,view,kind,sel,rx,ry,n,value,label').eq('kind', kind).gte('at', since).limit(50000)
      if (view) b = b.eq('view', view)
      if (client) b = b.eq('client_slug', client)
      if (user) b = b.eq('user_key', user)
      if (device) b = b.eq('device', device)
      return b
    }
    const { data, error } = await base()
    if (error) return NextResponse.json({ setup: missingTable(error.message) ? 'events' : 'error' })
    const rows = (data ?? []) as unknown as EventRow[]

    if (!view) {
      const by = new Map<string, { count: number; users: Set<string>; sids: Set<string>; clients: Map<string, number> }>()
      for (const r of rows) {
        const e = by.get(r.view) ?? { count: 0, users: new Set<string>(), sids: new Set<string>(), clients: new Map<string, number>() }
        e.count += kind === 'rage' ? (r.n ?? 1) : 1; e.users.add(r.user_key); e.sids.add(r.sid)
        if (r.client_slug) e.clients.set(r.client_slug, (e.clients.get(r.client_slug) ?? 0) + 1)
        by.set(r.view, e)
      }
      // `clicks` = quantidade do sinal (cliques de raiva, cliques mortos ou visitas com rolagem).
      return NextResponse.json({ setup: 'ready', mode, views: [...by.entries()].map(([v, e]) => ({ view: v, clicks: kind === 'scroll' ? e.sids.size : e.count, users: e.users.size, topClient: [...e.clients.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null })).sort((a, b) => b.clicks - a.clicks) })
    }

    if (kind === 'scroll') {
      const { visits, bands } = scrollBands(rows, view)
      return NextResponse.json({ setup: 'ready', mode, view, total: visits, users: new Set(rows.map(r => r.user_key)).size, bands })
    }
    if (q.get('top') === '1') return NextResponse.json({ setup: 'ready', mode, view, total: rows.length, top: topElements(rows.flatMap(r => Array.from({ length: kind === 'rage' ? (r.n ?? 1) : 1 }, () => ({ sel: r.sel ?? 'body', label: r.label })))) })
    const pts = rows.filter(r => r.sel && r.rx != null && r.ry != null).map(r => ({ sel: r.sel as string, rx: r.rx as number, ry: r.ry as number, n: kind === 'rage' ? (r.n ?? 1) : 1 }))
    return NextResponse.json({ setup: 'ready', mode, view, total: pts.reduce((n, p) => n + p.n, 0), users: new Set(rows.map(r => r.user_key)).size, points: heatBins(pts) })
  }

  if (!view) {
    let query = db.from('usage_clicks').select('view,client_slug,user_key').neq('view', 'admin/heatmap').gte('at', since).limit(60000)
    if (client) query = query.eq('client_slug', client)
    if (user) query = query.eq('user_key', user)
    if (device) query = query.eq('device', device)
    const { data, error } = await query
    if (error) return NextResponse.json({ setup: missingTable(error.message) ? 'tables' : 'error' })
    const by = new Map<string, { clicks: number; users: Set<string>; clients: Map<string, number> }>()
    for (const r of (data ?? []) as Array<{ view: string; client_slug: string; user_key: string }>) {
      const e = by.get(r.view) ?? { clicks: 0, users: new Set<string>(), clients: new Map<string, number>() }
      e.clicks++; e.users.add(r.user_key)
      if (r.client_slug) e.clients.set(r.client_slug, (e.clients.get(r.client_slug) ?? 0) + 1)
      by.set(r.view, e)
    }
    return NextResponse.json({ setup: 'ready', mode, views: [...by.entries()].map(([v, e]) => ({ view: v, clicks: e.clicks, users: e.users.size, topClient: [...e.clients.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null })).sort((a, b) => b.clicks - a.clicks) })
  }

  if (q.get('top') === '1') {
    let tq = db.from('usage_clicks').select('sel,label').eq('view', view).gte('at', since).limit(50000)
    if (client) tq = tq.eq('client_slug', client)
    if (user) tq = tq.eq('user_key', user)
    if (device) tq = tq.eq('device', device)
    let r = await tq
    if (r.error && /label/i.test(r.error.message)) {
      let t2 = db.from('usage_clicks').select('sel').eq('view', view).gte('at', since).limit(50000)
      if (client) t2 = t2.eq('client_slug', client)
      if (user) t2 = t2.eq('user_key', user)
      if (device) t2 = t2.eq('device', device)
      r = await t2 as typeof r
    }
    const rows = (r.data ?? []) as unknown as Array<{ sel: string; label?: string | null }>
    return NextResponse.json({ setup: 'ready', mode, view, total: rows.length, top: topElements(rows) })
  }

  let query = db.from('usage_clicks').select('sel,rx,ry,user_key').eq('view', view).gte('at', since).limit(50000)
  if (client) query = query.eq('client_slug', client)
  if (user) query = query.eq('user_key', user)
  if (device) query = query.eq('device', device)
  const { data, error } = await query
  if (error) return NextResponse.json({ setup: 'error' })
  const rows = (data ?? []) as Array<{ sel: string; rx: number; ry: number; user_key: string }>
  return NextResponse.json({ setup: 'ready', mode, view, total: rows.length, users: new Set(rows.map(r => r.user_key)).size, points: heatBins(rows) })
}
