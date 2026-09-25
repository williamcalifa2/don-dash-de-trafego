import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { getSupabaseServer } from '@/lib/supabase'
import { buildLive, buildStates, buildTrending, ONLINE_MS, FUNNEL_MS, startOfDayBr, type EventRow, type SessionRow } from '@/lib/storeTrack'
import { getClientConfig } from '@/lib/clientConfig'
import { canLoadCatalog, loadCatalog, matchProduct } from '@/lib/shopifyCatalog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

  const now = Date.now()
  const today = startOfDayBr(now)
  const since = new Date(now - Math.max(ONLINE_MS, FUNNEL_MS)).toISOString()

  const todayMs = Date.parse(today)
  const yStart = new Date(todayMs - 86_400_000).toISOString()
  const ySoFar = new Date(todayMs - 86_400_000 + (now - todayMs)).toISOString()
  const yOrdersEnd = ySoFar
  const [sessions, events, sessionsToday, orders, any, todaySessions, sessionsPrev, ordersPrev] = await Promise.all([
    db.from('store_sessions').select('sid,last_seen,city,region,country,lat,lng,source').eq('client_id', tenant.clientId).gte('last_seen', since).limit(1000),
    db.from('store_events').select('id,sid,type,city,region,country,lat,lng,product,value,source,created_at').eq('client_id', tenant.clientId).gte('created_at', today).order('created_at', { ascending: false }).limit(5000),
    db.from('store_sessions').select('sid', { count: 'exact', head: true }).eq('client_id', tenant.clientId).gte('first_seen', today),
    db.from('ecommerce_orders').select('total').eq('client_id', tenant.clientId).eq('status', 'paid').gte('paid_at', today).limit(2000),
    db.from('store_sessions').select('sid').eq('client_id', tenant.clientId).limit(1),
    db.from('store_sessions').select('region,country,last_seen').eq('client_id', tenant.clientId).gte('first_seen', today).limit(5000),
    db.from('store_sessions').select('sid', { count: 'exact', head: true }).eq('client_id', tenant.clientId).gte('first_seen', yStart).lt('first_seen', ySoFar),
    db.from('ecommerce_orders').select('total').eq('client_id', tenant.clientId).eq('status', 'paid').gte('paid_at', yStart).lt('paid_at', yOrdersEnd).limit(2000),
  ])

  // Tabelas ainda não criadas: o painel avisa em vez de quebrar.
  const missing = [sessions.error, events.error].some(e => e && /relation|schema cache|does not exist/i.test(e.message))
  const live = buildLive((sessions.data ?? []) as SessionRow[], (events.data ?? []) as EventRow[], now)
  const paid = (orders.data ?? []) as Array<{ total: number | string }>
  const evs = (events.data ?? []) as EventRow[]
  const onlineNow = ((sessions.data ?? []) as SessionRow[]).filter(x => now - Date.parse(x.last_seen) <= ONLINE_MS)
  const states = buildStates((todaySessions.data ?? []) as Array<{ region: string | null; country: string | null }>, onlineNow, evs.filter(e => e.type === 'purchase'))
  const trending = buildTrending(evs, now)

  // Foto dos produtos em alta, quando a loja tem catálogo configurado.
  const i = (await getClientConfig(tenant.slug)).integrations ?? {}
  const creds = { storeUrl: i.shopifyStoreUrl, domain: i.shopifyDomain, token: i.shopifyToken, clientId: i.shopifyClientId, clientSecret: i.shopifyClientSecret }
  if (trending.length && canLoadCatalog(creds)) {
    const catalog = await loadCatalog(creds).catch(() => [])
    for (const t of trending) t.image = matchProduct(catalog, t.name)?.image ?? null
  }
  const paidPrev = (ordersPrev.data ?? []) as Array<{ total: number | string }>

  return NextResponse.json({
    ok: true,
    setup: missing ? 'tables' : (any.data?.length ?? 0) > 0 ? 'ready' : 'waiting',
    ...live,
    sessionsToday: sessionsToday.count ?? 0,
    ordersToday: paid.length,
    salesToday: paid.reduce((s, o) => s + Number(o.total || 0), 0),
    salesPrev: paidPrev.reduce((s, o) => s + Number(o.total || 0), 0),
    sessionsPrev: sessionsPrev.count ?? 0,
    states,
    trending,
    at: now,
  })
}
