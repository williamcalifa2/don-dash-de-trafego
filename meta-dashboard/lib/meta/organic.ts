/**
 * Orgânico: Página do Facebook e Instagram do cliente (alcance, seguidores, publicações, público).
 * Só leitura, com um token próprio (META_ORGANIC_TOKEN). Vai para o banco (meta_snapshots, tipo "organic") e o painel lê de lá.
 * Nunca é consultado ao vivo pelo navegador. Fora da fila de anúncios: tem o próprio ritmo (poucas contas por ciclo) para não pesar na cota.
 */
import type { MetaResult } from './client'
import type { SnapshotStore } from './snapshots'
import type { LimitStore } from './limits'
import type { Account, CollectOutcome } from './collectors'

const DAY = 86_400_000
const BR = 3 * 3_600_000
export const ORGANIC_KIND = 'organic'
export const ORGANIC_KEY = 'all'

export interface Point { d: string; v: number }
export interface IgWindow { cur: Record<string, number>; prev: Record<string, number> | null }
export interface IgMedia {
  id: string; type: string; caption: string; thumb: string | null; url: string | null; at: string
  likes: number | null; comments: number | null
  reach: number | null; views: number | null; shares: number | null; saves: number | null; interactions: number | null
}
export interface FbPost {
  id: string; type: string; caption: string; thumb: string | null; url: string | null; at: string
  reactions: number | null; comments: number | null; shares: number | null; reach: number | null; views: number | null
}
export interface Demo { label: string; value: number }
export interface OrganicSnapshot {
  fetchedAt: number
  status: 'ok' | 'no_page' | 'no_token'
  profile: {
    fb: { id: string; name: string; followers: number | null; picture: string | null; link: string | null } | null
    ig: { id: string; username: string; name: string | null; followers: number | null; follows: number | null; mediaCount: number | null; picture: string | null } | null
  }
  fb: { series: Record<string, Point[]>; posts: FbPost[]; unavailable: string[] } | null
  ig: {
    reach: Point[]; gained: Point[]
    windows: Record<string, IgWindow>
    media: IgMedia[]
    stories: Array<{ id: string; type: string; thumb: string | null; url: string | null; at: string }>
    demo: { age: Demo[]; gender: Demo[]; city: Demo[]; country: Demo[] }
    unavailable: string[]
  } | null
}

type Ctx = { clientId?: string | null; accountId?: string | null; purpose: string; token?: string }
export interface OrganicDeps {
  now: () => number
  get: <T = Record<string, unknown>>(path: string, ctx: Ctx) => Promise<MetaResult<T>>
  batch: <T = Record<string, unknown>>(paths: string[], ctx: Ctx) => Promise<MetaResult<Array<MetaResult<T>>>>
  snaps: SnapshotStore
  state: LimitStore
  /** token do orgânico (META_ORGANIC_TOKEN); undefined = sem token */
  token: string | undefined
}

// ── datas (dia do Brasil) ────────────────────────────────────────────────────
export const dayKey = (t: number) => new Date(t - BR).toISOString().slice(0, 10)
const shiftKey = (key: string, n: number) => new Date(Date.parse(`${key}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const monthStart = (key: string) => `${key.slice(0, 8)}01`

/** Janelas de totais do Instagram: [início, fim exclusivo]. 7/14/30 terminam ontem; "month" vai do dia 1 até ontem. */
export function windows(today: string): Record<string, { cur: [string, string]; prev: [string, string] } | null> {
  const out: Record<string, { cur: [string, string]; prev: [string, string] } | null> = {}
  for (const n of [7, 14, 30]) out[String(n)] = { cur: [shiftKey(today, -n), today], prev: [shiftKey(today, -2 * n), shiftKey(today, -n)] }
  const first = monthStart(today)
  const days = Math.round((Date.parse(today) - Date.parse(first)) / DAY)
  if (days <= 0) out.month = null
  else {
    const prevFirst = monthStart(shiftKey(first, -1))
    const prevDays = Math.round((Date.parse(first) - Date.parse(prevFirst)) / DAY)
    out.month = { cur: [first, today], prev: [prevFirst, shiftKey(prevFirst, Math.min(days, prevDays))] }
  }
  // Mês fechado anterior contra o mês antes dele (relatório mensal): sempre inteiro, nunca corta o período.
  const lastFirst = monthStart(shiftKey(first, -1))
  out.last_month = { cur: [lastFirst, first], prev: [monthStart(shiftKey(lastFirst, -1)), lastFirst] }
  return out
}

// ── leitura das respostas da Meta ────────────────────────────────────────────
type Row = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : null)
const arr = <T = Row>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function seriesOf(metric: Row | undefined): Point[] {
  return arr<Row>(metric?.values).flatMap(x => {
    const v = num(x.value), t = typeof x.end_time === 'string' ? Date.parse(x.end_time) : NaN
    return v == null || !isFinite(t) ? [] : [{ d: new Date(t - DAY).toISOString().slice(0, 10), v }]
  })
}

export function parseSeries(json: unknown): Point[] {
  return seriesOf(arr<Row>((json as Row)?.data)[0])
}

/** Séries diárias de várias métricas numa resposta só: { nome: pontos }. Métricas que não vieram ficam de fora. */
export function parseSeriesByName(json: unknown): Record<string, Point[]> {
  const out: Record<string, Point[]> = {}
  for (const m of arr<Row>((json as Row)?.data)) if (typeof m.name === 'string') { const pts = seriesOf(m); if (pts.length) out[m.name] = pts }
  return out
}

/** total_value de vários metrics numa resposta. */
export function parseTotals(json: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of arr<Row>((json as Row)?.data)) {
    const v = num((m.total_value as Row | undefined)?.value)
    if (typeof m.name === 'string' && v != null) out[m.name] = v
  }
  return out
}

export function parseBreakdown(json: unknown, limit = 8): Demo[] {
  const first = arr<Row>((json as Row)?.data)[0]
  const results = arr<Row>(arr<Row>(((first?.total_value as Row | undefined)?.breakdowns))[0]?.results)
  return results
    .flatMap(r => { const v = num(r.value), k = arr<string>(r.dimension_values)[0]; return v == null || !k ? [] : [{ label: k, value: v }] })
    .sort((a, b) => b.value - a.value).slice(0, limit)
}

/** Métricas de uma resposta de insights de mídia/post: { nome: valor }. */
export function parseMetricMap(json: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of arr<Row>((json as Row)?.data)) {
    const v = num(arr<Row>(m.values)[0]?.value)
    if (typeof m.name === 'string' && v != null) out[m.name] = v
  }
  return out
}

const IG_TYPE: Record<string, string> = { REELS: 'Reels', FEED: '', STORY: 'Story', AD: 'Anúncio' }
const IG_MEDIA: Record<string, string> = { IMAGE: 'Foto', VIDEO: 'Vídeo', CAROUSEL_ALBUM: 'Carrossel' }
const igType = (m: Row) => IG_TYPE[String(m.media_product_type)] || IG_MEDIA[String(m.media_type)] || 'Publicação'
const FB_TYPE: Record<string, string> = { added_photos: 'Foto', added_video: 'Vídeo', shared_story: 'Compartilhamento', mobile_status_update: 'Texto', wall_post: 'Texto', published_story: 'Publicação', created_note: 'Nota' }

// ── coleta ───────────────────────────────────────────────────────────────────
const FB_METRICS = ['page_media_view', 'page_total_media_view_unique', 'page_post_engagements', 'page_follows']
const IG_TOTALS = 'reach,views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps'
const MEDIA_INSIGHTS = 'reach,views,likes,comments,shares,saved,total_interactions'
const POST_INSIGHTS = 'post_media_view,post_total_media_view_unique'
const NEWEST_WITH_INSIGHTS = 8

const ok = <T,>(r: MetaResult<T>) => r.ok && !r.dryRun

/** Resolve a Página do cliente: a cadastrada ou, se houver só uma, a que a conta de anúncios promove. */
async function resolvePage(d: OrganicDeps, acc: Account): Promise<string | null> {
  if (acc.pageId) return acc.pageId
  const r = await d.get<{ data?: Array<{ id: string }> }>(`${acc.adAccountId}/promote_pages?fields=id,name&limit=25`, { clientId: acc.clientId, accountId: acc.adAccountId, purpose: 'organic:pagina' })
  const pages = ok(r) ? arr<{ id: string }>(r.data.data) : []
  return pages.length === 1 ? pages[0].id : null
}

export async function collectOrganic(d: OrganicDeps, acc: Account): Promise<CollectOutcome> {
  const now = d.now()
  const put = (snap: Omit<OrganicSnapshot, 'fetchedAt'>) => d.snaps.put(acc.clientId, ORGANIC_KIND, ORGANIC_KEY, { ...snap, fetchedAt: now } satisfies OrganicSnapshot, now)
  // organic_nopage / organic_notoken: só para o menu de sincronização mostrar por que uma conta ainda não tem orgânico.
  const markSynced = async (flag?: 'organic_nopage' | 'organic_notoken') => {
    const st = await d.state.getState(acc.clientId)
    const { organic_nopage: _a, organic_notoken: _b, ...rest } = st.lastSynced; void _a; void _b
    await d.state.patchState(acc.clientId, { lastSynced: { ...rest, organic: now, ...(flag ? { [flag]: now } : {}) }, ...(flag ? {} : { lastError: st.lastError }) })
  }
  const empty = { profile: { fb: null, ig: null }, fb: null, ig: null }

  if (!d.token) { await put({ status: 'no_token', ...empty }); await markSynced('organic_notoken'); return { status: 'done', calls: 0 } }
  const label = `organic:${acc.slug}`
  let calls = 0
  const g = async <T,>(path: string, token: string) => { calls++; return d.get<T>(path, { purpose: label, token }) }

  const pageId = await resolvePage(d, acc)
  if (!pageId) { await put({ status: 'no_page', ...empty }); await markSynced('organic_nopage'); return { status: 'done', calls: 1 } }

  const info = await g<Row>(`${pageId}?fields=access_token,name,fan_count,followers_count,link,picture{url},instagram_business_account{id,username,name,followers_count,follows_count,media_count,profile_picture_url}`, d.token)
  if (info.blocked) return { status: 'deferred', reason: info.blocked, calls }
  if (!ok(info)) return { status: 'failed', error: info.error?.message ?? 'não consegui ler a Página', calls }
  const pageToken = typeof info.data.access_token === 'string' ? info.data.access_token : d.token
  const igRaw = info.data.instagram_business_account as Row | undefined
  const picture = ((info.data.picture as Row | undefined)?.data as Row | undefined)?.url
  const profile: OrganicSnapshot['profile'] = {
    fb: { id: pageId, name: String(info.data.name ?? ''), followers: num(info.data.followers_count) ?? num(info.data.fan_count), picture: typeof picture === 'string' ? picture : null, link: typeof info.data.link === 'string' ? info.data.link : null },
    ig: igRaw?.id ? { id: String(igRaw.id), username: String(igRaw.username ?? ''), name: typeof igRaw.name === 'string' ? igRaw.name : null, followers: num(igRaw.followers_count), follows: num(igRaw.follows_count), mediaCount: num(igRaw.media_count), picture: typeof igRaw.profile_picture_url === 'string' ? igRaw.profile_picture_url : null } : null,
  }

  const today = dayKey(now)
  const since60 = shiftKey(today, -90) // 90 dias: cobre o mês fechado e o anterior (relatório mensal)

  // ── Facebook ──
  const fbPart = async (): Promise<NonNullable<OrganicSnapshot['fb']>> => {
    const unavailable: string[] = []
    const series: Record<string, Point[]> = {}
    // Uma chamada só com as 4 métricas; só as que não vierem são pedidas separadamente (uma inválida derruba a chamada junta).
    const joint = await g<unknown>(`${pageId}/insights?metric=${FB_METRICS.join(',')}&period=day&since=${since60}&until=${today}`, pageToken)
    if (ok(joint)) Object.assign(series, parseSeriesByName(joint.data))
    await Promise.all(FB_METRICS.filter(m => !series[m]).map(async m => {
      const r = await g<unknown>(`${pageId}/insights?metric=${m}&period=day&since=${since60}&until=${today}`, pageToken)
      if (ok(r)) series[m] = parseSeries(r.data); else unavailable.push(m)
    }))
    // Alcance/visualizações de cada post vêm na própria lista (insights aninhado): 1 chamada em vez de 1 + 8.
    const postFields = 'id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)'
    let r = await g<{ data?: Row[] }>(`${pageId}/published_posts?fields=${postFields},insights.metric(${POST_INSIGHTS})&limit=25`, pageToken)
    if (!ok(r)) r = await g<{ data?: Row[] }>(`${pageId}/published_posts?fields=${postFields}&limit=25`, pageToken)
    const raw = ok(r) ? arr<Row>(r.data.data) : []
    if (!ok(r)) unavailable.push('posts')
    const posts: FbPost[] = raw.map(p => ({
      id: String(p.id), type: FB_TYPE[String(p.status_type)] ?? 'Publicação', caption: typeof p.message === 'string' ? p.message : '',
      thumb: typeof p.full_picture === 'string' ? p.full_picture : null, url: typeof p.permalink_url === 'string' ? p.permalink_url : null, at: String(p.created_time ?? ''),
      reactions: num(((p.reactions as Row | undefined)?.summary as Row | undefined)?.total_count), comments: num(((p.comments as Row | undefined)?.summary as Row | undefined)?.total_count),
      shares: num((p.shares as Row | undefined)?.count), reach: null, views: null,
    }))
    raw.forEach((p, i) => { const m = parseMetricMap(p.insights); posts[i].views = m.post_media_view ?? null; posts[i].reach = m.post_total_media_view_unique ?? null })
    // Sem insights aninhado em nenhum post (a Meta não devolveu): pede em lote só para os mais novos.
    const top = posts.slice(0, NEWEST_WITH_INSIGHTS)
    if (top.length && posts.every(p => p.views == null && p.reach == null)) {
      calls += top.length
      const b = await d.batch<unknown>(top.map(p => `${p.id}/insights?metric=${POST_INSIGHTS}`), { purpose: label, token: pageToken })
      if (ok(b)) b.data.forEach((res, i) => { if (res.ok) { const m = parseMetricMap(res.data); top[i].views = m.post_media_view ?? null; top[i].reach = m.post_total_media_view_unique ?? null } })
    }
    return { series, posts, unavailable }
  }

  // ── Instagram ──
  const igPart = async (ig: NonNullable<OrganicSnapshot['profile']['ig']>): Promise<NonNullable<OrganicSnapshot['ig']>> => {
    const unavailable: string[] = []
    const w = windows(today)
    const windowsOut: Record<string, IgWindow> = {}
    await Promise.all(Object.entries(w).flatMap(([key, win]) => !win ? [] : (['cur', 'prev'] as const).map(async which => {
      const [s, u] = win[which]
      const r = await g<unknown>(`${ig.id}/insights?metric=${IG_TOTALS}&metric_type=total_value&period=day&since=${s}&until=${u}`, pageToken)
      if (!ok(r)) { unavailable.push(`janela_${key}_${which}`); return }
      const t = parseTotals(r.data)
      windowsOut[key] ??= { cur: {}, prev: null }
      if (which === 'cur') windowsOut[key].cur = t; else windowsOut[key].prev = t
    })))
    // Visitas ao perfil só do mês fechado (relatório mensal), em chamada separada: se a Meta recusar, o resto não cai.
    const lm = w.last_month
    if (lm) await Promise.all((['cur', 'prev'] as const).map(async which => {
      const [s, u] = lm[which]
      const r = await g<unknown>(`${ig.id}/insights?metric=profile_views&metric_type=total_value&period=day&since=${s}&until=${u}`, pageToken)
      if (!ok(r)) { unavailable.push(`profile_views_${which}`); return }
      const v = parseTotals(r.data).profile_views
      if (v == null) return
      windowsOut.last_month ??= { cur: {}, prev: null }
      if (which === 'cur') windowsOut.last_month.cur.profile_views = v
      else (windowsOut.last_month.prev ??= {}).profile_views = v
    }))
    const series = async (metric: string, type: 'time_series' | null, days = 60) => {
      const spans: Array<[string, string]> = days > 60 ? [[shiftKey(today, -90), shiftKey(today, -60)], [shiftKey(today, -60), shiftKey(today, -30)], [shiftKey(today, -30), today]] : [[shiftKey(today, -60), shiftKey(today, -30)], [shiftKey(today, -30), today]]
      const parts = await Promise.all(spans.map(async ([s, u]) => {
        const r = await g<unknown>(`${ig.id}/insights?metric=${metric}&period=day${type ? `&metric_type=${type}` : ''}&since=${s}&until=${u}`, pageToken)
        if (!ok(r)) { unavailable.push(metric); return [] as Point[] }
        return parseSeries(r.data)
      }))
      const byDay = new Map<string, number>()
      for (const p of parts.flat()) byDay.set(p.d, p.v)
      return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d0, v]) => ({ d: d0, v }))
    }
    const [reach, gained] = await Promise.all([series('reach', 'time_series'), series('follower_count', null, 90)])

    const mediaFields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
    let mediaRes = await g<{ data?: Row[] }>(`${ig.id}/media?fields=${mediaFields},insights.metric(${MEDIA_INSIGHTS})&limit=30`, pageToken)
    if (!ok(mediaRes)) mediaRes = await g<{ data?: Row[] }>(`${ig.id}/media?fields=${mediaFields}&limit=30`, pageToken)
    if (!ok(mediaRes)) unavailable.push('media')
    const mediaRaw = ok(mediaRes) ? arr<Row>(mediaRes.data.data) : []
    const media: IgMedia[] = mediaRaw.map(m => ({
      id: String(m.id), type: igType(m), caption: typeof m.caption === 'string' ? m.caption : '',
      thumb: typeof m.thumbnail_url === 'string' ? m.thumbnail_url : typeof m.media_url === 'string' ? m.media_url : null,
      url: typeof m.permalink === 'string' ? m.permalink : null, at: String(m.timestamp ?? ''),
      likes: num(m.like_count), comments: num(m.comments_count), reach: null, views: null, shares: null, saves: null, interactions: null,
    }))
    const applyInsights = (item: IgMedia, m: Record<string, number>) => Object.assign(item, { reach: m.reach ?? null, views: m.views ?? null, shares: m.shares ?? null, saves: m.saved ?? null, interactions: m.total_interactions ?? null, likes: m.likes ?? item.likes, comments: m.comments ?? item.comments })
    mediaRaw.forEach((raw, i) => { const m = parseMetricMap(raw.insights); if (Object.keys(m).length) applyInsights(media[i], m) })
    const top = media.slice(0, NEWEST_WITH_INSIGHTS)
    if (top.length && media.every(m => m.reach == null && m.views == null)) {
      calls += top.length
      const b = await d.batch<unknown>(top.map(m => `${m.id}/insights?metric=${MEDIA_INSIGHTS}`), { purpose: label, token: pageToken })
      if (ok(b)) b.data.forEach((res, i) => {
        if (!res.ok) return
        applyInsights(top[i], parseMetricMap(res.data))
      })
    }

    const demoOne = async (by: string, limit: number) => {
      const r = await g<unknown>(`${ig.id}/insights?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=${by}`, pageToken)
      if (!ok(r)) { unavailable.push(`demo_${by}`); return [] as Demo[] }
      return parseBreakdown(r.data, limit)
    }
    const [age, gender, city, country] = await Promise.all([demoOne('age', 8), demoOne('gender', 3), demoOne('city', 8), demoOne('country', 5)])

    const st = await g<{ data?: Row[] }>(`${ig.id}/stories?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&limit=25`, pageToken)
    const stories = (ok(st) ? arr<Row>(st.data.data) : []).map(s => ({
      id: String(s.id), type: String(s.media_type ?? ''), thumb: typeof s.thumbnail_url === 'string' ? s.thumbnail_url : typeof s.media_url === 'string' ? s.media_url : null,
      url: typeof s.permalink === 'string' ? s.permalink : null, at: String(s.timestamp ?? ''),
    }))
    return { reach, gained, windows: windowsOut, media, stories, demo: { age, gender, city, country }, unavailable }
  }

  const [fb, igData] = await Promise.all([fbPart(), profile.ig ? igPart(profile.ig) : Promise.resolve(null)])
  await put({ status: 'ok', profile, fb, ig: igData })
  await markSynced()
  return { status: 'done', calls }
}

/** Última vez que deu a hora marcada (no relógio do Brasil): hoje na hora marcada, ou ontem nela se ainda não deu. */
export function lastScheduledAt(now: number, hourBr: number): number {
  const brNow = new Date(now - BR)
  const today = Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate(), hourBr) + BR // instante real em que dá a hora no Brasil
  return now >= today ? today : today - DAY
}

/**
 * Orgânico: uma atualização por dia, na hora marcada (padrão 04:00, com os dados fechados do dia anterior).
 * A partir dessa hora, cada ciclo pega poucas contas ainda não atualizadas desde então, das mais atrasadas para as mais recentes;
 * cliente novo (nunca coletado) entra no mesmo dia.
 */
export async function runOrganicCycle(d: OrganicDeps, accounts: Account[], opts: { hourBr: number; perCycle: number; deadline: number }): Promise<Array<{ slug: string; status: string; reason?: string }>> {
  const now = d.now()
  const since = lastScheduledAt(now, opts.hourBr)
  const due = (await Promise.all(accounts.map(async a => ({ a, at: (await d.state.getState(a.clientId)).lastSynced.organic ?? 0 }))))
    .filter(x => x.at < since)
    .sort((x, y) => x.at - y.at)
    .slice(0, opts.perCycle)
  const out: Array<{ slug: string; status: string; reason?: string }> = []
  for (const { a } of due) {
    if (d.now() > opts.deadline) break
    try {
      const r = await collectOrganic(d, a)
      out.push({ slug: a.slug, status: r.status, reason: r.status === 'deferred' ? r.reason : r.status === 'failed' ? r.error : undefined })
      if (r.status === 'deferred') break // limite/pausa: para o ciclo, nada de insistir
    } catch (e) {
      out.push({ slug: a.slug, status: 'failed', reason: e instanceof Error ? e.message : 'erro' })
    }
  }
  return out
}
