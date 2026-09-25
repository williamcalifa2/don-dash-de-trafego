/** Live view da loja: recebe eventos do pixel (Shopify Custom Pixel) e monta o painel "ao vivo". Funções puras onde dá, para testar. */
import crypto from 'node:crypto'

export const EVENT_TYPES = ['ping', 'visit', 'product', 'cart', 'checkout', 'purchase'] as const
export type StoreEventType = (typeof EVENT_TYPES)[number]

/** Sessão sem sinal há mais que isso deixa de contar como "online". */
export const ONLINE_MS = 5 * 60_000
/** Janela do funil (carrinho, checkout, compra). */
export const FUNNEL_MS = 10 * 60_000
const BR = 3 * 3_600_000

/** Chave pública do pixel de uma loja. Derivada do segredo do app, então não precisa ser guardada. */
export function trackKey(slug: string): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET ?? 'dev-track'
  return crypto.createHmac('sha256', secret).update(`track:${slug}`).digest('hex').slice(0, 24)
}

export function trackKeyValid(slug: string, key: string | null | undefined): boolean {
  if (!key) return false
  const want = trackKey(slug)
  return key.length === want.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(want))
}

export interface TrackInput {
  sid: string
  type: StoreEventType
  path: string | null
  product: string | null
  value: number | null
  source: string | null
}

const clip = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Valida o corpo enviado pelo pixel. Devolve null se não presta. */
export function normalizeTrack(body: unknown): TrackInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const sid = clip(b.sid, 64)
  if (!sid || !/^[A-Za-z0-9_-]{6,64}$/.test(sid)) return null
  const type = b.type as StoreEventType
  if (!EVENT_TYPES.includes(type)) return null
  const num = Number(b.value)
  return {
    sid, type,
    path: clip(b.path, 200),
    product: clip(b.product, 120),
    value: Number.isFinite(num) && num >= 0 && num < 1e8 ? Math.round(num * 100) / 100 : null,
    source: clip(b.source, 60),
  }
}

export interface Geo { city: string | null; region: string | null; country: string | null; lat: number | null; lng: number | null }

/** Localização do visitante pelos cabeçalhos que a Vercel coloca na requisição. */
export function geoFromHeaders(h: { get(name: string): string | null }): Geo {
  const dec = (v: string | null) => { if (!v) return null; try { return decodeURIComponent(v) } catch { return v } }
  const n = (v: string | null) => { const x = v == null ? NaN : Number(v); return Number.isFinite(x) ? x : null }
  return {
    city: dec(h.get('x-vercel-ip-city')),
    region: dec(h.get('x-vercel-ip-country-region')),
    country: dec(h.get('x-vercel-ip-country')),
    lat: n(h.get('x-vercel-ip-latitude')),
    lng: n(h.get('x-vercel-ip-longitude')),
  }
}

/** Meia-noite de hoje no Brasil, em ISO (UTC). */
export function startOfDayBr(now = Date.now()): string {
  const local = now - BR
  const day = local - (((local % 86_400_000) + 86_400_000) % 86_400_000)
  return new Date(day + BR).toISOString()
}

export interface SessionRow { sid: string; last_seen: string; city: string | null; region: string | null; country: string | null; lat: number | null; lng: number | null; source: string | null }
export interface EventRow { id: number | string; sid: string; type: string; city: string | null; region: string | null; country: string | null; lat: number | null; lng: number | null; product: string | null; value: number | null; source: string | null; created_at: string }

export interface LiveCity { name: string; city: string; state: string; lat: number; lng: number; visitors: number; ordersToday: number; channel: string }
export interface LiveEventOut { id: string; type: 'order' | 'checkout' | 'cart' | 'visit'; title: string; description: string; city: string; state: string; value?: number; channel: string; timestamp: number; lat: number | null; lng: number | null }
export interface LiveSnapshot {
  online: number
  funnel: { visiting: number; cart: number; checkout: number; purchased: number }
  cities: LiveCity[]
  events: LiveEventOut[]
}

const stateOf = (region: string | null, country: string | null) => (country === 'BR' ? region || 'BR' : country || '—')
const top = (values: Array<string | null>) => {
  const m = new Map<string, number>()
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Direto'
}

const FEED: Record<string, { type: LiveEventOut['type']; title: string; fallback: string }> = {
  purchase: { type: 'order', title: 'Pedido Aprovado', fallback: 'Compra concluída' },
  checkout: { type: 'checkout', title: 'Iniciou Checkout', fallback: 'Avançou para o pagamento' },
  cart: { type: 'cart', title: 'Adicionou ao Carrinho', fallback: 'Produto na sacola' },
  visit: { type: 'visit', title: 'Novo Visitante', fallback: 'Entrou na loja' },
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/** Monta o painel a partir das sessões recentes (últimos 10 min) e dos eventos de hoje. */
export function buildLive(sessions: SessionRow[], events: EventRow[], now = Date.now()): LiveSnapshot {
  const onlineSessions = sessions.filter(s => now - Date.parse(s.last_seen) <= ONLINE_MS)

  const cityMap = new Map<string, { s: SessionRow[] }>()
  for (const s of onlineSessions) {
    if (s.lat == null || s.lng == null) continue
    const k = `${s.city ?? '?'}|${s.country ?? '?'}`
    const e = cityMap.get(k) ?? { s: [] }
    e.s.push(s)
    cityMap.set(k, e)
  }
  const ordersByCity = new Map<string, number>()
  for (const e of events) if (e.type === 'purchase') { const k = `${e.city ?? '?'}|${e.country ?? '?'}`; ordersByCity.set(k, (ordersByCity.get(k) ?? 0) + 1) }

  const cities: LiveCity[] = [...cityMap.entries()].map(([k, { s }]) => {
    const f = s[0]
    const state = stateOf(f.region, f.country)
    const city = f.city ?? 'Local desconhecido'
    return { name: `${city}, ${state}`, city, state, lat: f.lat as number, lng: f.lng as number, visitors: s.length, ordersToday: ordersByCity.get(k) ?? 0, channel: top(s.map(x => x.source)) }
  }).sort((a, b) => b.visitors - a.visitors)

  const recent = events.filter(e => now - Date.parse(e.created_at) <= FUNNEL_MS)
  const sids = (t: string) => new Set(recent.filter(e => e.type === t).map(e => e.sid))
  const bought = sids('purchase')
  const minus = (a: Set<string>) => [...a].filter(x => !bought.has(x)).length
  const funnel = { visiting: onlineSessions.length, cart: minus(sids('cart')), checkout: minus(sids('checkout')), purchased: bought.size }

  const feed: LiveEventOut[] = events
    .filter(e => FEED[e.type])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 15)
    .map(e => {
      const f = FEED[e.type]
      const value = e.value ?? undefined
      const description = e.product ? `${e.product}${value != null && e.type !== 'visit' ? ` (${brl(value)})` : ''}` : value != null && e.type !== 'visit' ? `${f.fallback} (${brl(value)})` : f.fallback
      return { id: `ev-${e.id}`, type: f.type, title: f.title, description, city: e.city ?? 'Local desconhecido', state: stateOf(e.region, e.country), value, channel: e.source ?? 'Direto', timestamp: Date.parse(e.created_at), lat: e.lat, lng: e.lng }
    })

  return { online: onlineSessions.length, funnel, cities, events: feed }
}

// ─── Estados e produtos em alta ──────────────────────────────────────────────

const BR_STATES: Record<string, string> = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' }

export interface StateStat { uf: string; name: string; live: number; orders: number; sessions: number; percent: number }

/** Acessos de hoje por estado (ou país, fora do Brasil), com quem está online agora e as compras do dia. */
export function buildStates(today: Array<{ region: string | null; country: string | null }>, online: Array<{ region: string | null; country: string | null }>, purchases: Array<{ region: string | null; country: string | null }>): StateStat[] {
  const key = (r: { region: string | null; country: string | null }) => (r.country === 'BR' ? r.region || null : r.country || null)
  const count = (l: Array<{ region: string | null; country: string | null }>) => { const m = new Map<string, number>(); for (const r of l) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1) } return m }
  const t = count(today), o = count(online), p = count(purchases)
  const total = [...t.values()].reduce((a, b) => a + b, 0)
  return [...t.entries()].map(([uf, sessions]) => ({ uf, name: BR_STATES[uf] ?? uf, live: o.get(uf) ?? 0, orders: p.get(uf) ?? 0, sessions, percent: total > 0 ? Math.round((sessions / total) * 100) : 0 }))
    .sort((a, b) => b.sessions - a.sessions).slice(0, 12)
}

export interface TrendingProduct { name: string; viewing: number; inCart: number; salesToday: number; image?: string | null }

/** Produtos com movimento: quem está vendo e quem colocou no carrinho nos últimos 10 min, e as vendas do dia. */
export function buildTrending(eventsToday: EventRow[], now = Date.now()): TrendingProduct[] {
  const by = new Map<string, { view: Set<string>; cart: Set<string>; sales: number }>()
  const get = (n: string) => { let e = by.get(n); if (!e) { e = { view: new Set(), cart: new Set(), sales: 0 }; by.set(n, e) } return e }
  const bought = new Set(eventsToday.filter(e => e.type === 'purchase' && now - Date.parse(e.created_at) <= FUNNEL_MS).map(e => e.sid))
  for (const e of eventsToday) {
    if (!e.product) continue
    const recent = now - Date.parse(e.created_at) <= FUNNEL_MS
    if (e.type === 'purchase') get(e.product).sales++
    else if (recent && e.type === 'product') get(e.product).view.add(e.sid)
    else if (recent && (e.type === 'cart' || e.type === 'checkout') && !bought.has(e.sid)) get(e.product).cart.add(e.sid)
  }
  return [...by.entries()].map(([name, v]) => ({ name, viewing: v.view.size, inCart: v.cart.size, salesToday: v.sales }))
    .filter(p => p.viewing + p.inCart + p.salesToday > 0)
    .sort((a, b) => b.inCart - a.inCart || b.viewing - a.viewing || b.salesToday - a.salesToday).slice(0, 5)
}
