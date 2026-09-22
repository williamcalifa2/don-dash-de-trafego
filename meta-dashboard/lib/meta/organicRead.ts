/** Do que está guardado (OrganicSnapshot) para o que a aba Orgânico mostra, para cada período. Sem chamar a Meta. */
import type { SnapshotStore } from './snapshots'
import { dayKey, ORGANIC_KEY, ORGANIC_KIND, type Demo, type OrganicSnapshot, type Point } from './organic'

const DAY = 86_400_000
const shift = (key: string, n: number) => new Date(Date.parse(`${key}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)

export type Platform = 'all' | 'ig' | 'fb'
export interface Kpi { key: string; label: string; value: number | null; prev: number | null; note?: string }
export interface OrganicPost {
  key: string; platform: 'ig' | 'fb'; type: string; caption: string; thumb: string | null; url: string | null; at: string
  reach: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; interactions: number
}
export interface OrganicView {
  status: 'ok' | 'pending' | 'no_page' | 'no_token'
  at: number | null
  preset: string
  /** aviso curto (por exemplo, "hoje não tem dados fechados") */
  note: string | null
  profile: OrganicSnapshot['profile'] | null
  hasIg: boolean
  hasFb: boolean
  kpis: Record<Platform, Kpi[]>
  series: { dates: string[]; reachIg: number[]; reachFb: number[]; gained: number[] }
  posts: OrganicPost[]
  audience: { age: Demo[]; gender: Demo[]; city: Demo[]; country: Demo[] } | null
  stories: Array<{ id: string; type: string; thumb: string | null; url: string | null; at: string }>
  /** média de interações por post, de domingo (0) a sábado (6) */
  weekdays: Array<{ day: number; avg: number; posts: number }>
  unavailable: string[]
}

const PRESET_DAYS: Record<string, number> = { today: 7, last_7d: 7, last_14d: 14, last_30d: 30 }
const WINDOW_KEY: Record<string, string> = { today: '7', last_7d: '7', last_14d: '14', last_30d: '30', this_month: 'month', last_month: 'last_month' }
const monthDays = (first: string, next: string) => Array.from({ length: Math.round((Date.parse(next) - Date.parse(first)) / DAY) }, (_, i) => shift(first, i))

function periodDays(preset: string, today: string): string[] {
  if (preset === 'last_month') {
    const first = `${today.slice(0, 8)}01`
    return monthDays(`${shift(first, -1).slice(0, 8)}01`, first) // mês fechado anterior, inteiro
  }
  if (preset === 'this_month') {
    const n = Number(today.slice(8, 10)) - 1 // dias fechados do mês (até ontem)
    return Array.from({ length: Math.max(0, n) }, (_, i) => `${today.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
  }
  const n = PRESET_DAYS[preset] ?? 7
  return Array.from({ length: n }, (_, i) => shift(today, -n + i))
}

function prevDays(preset: string, cur: string[], today: string): string[] {
  if (!cur.length) return []
  if (preset === 'last_month') return monthDays(`${shift(cur[0], -1).slice(0, 8)}01`, cur[0]) // o mês antes dele, inteiro
  if (preset === 'this_month') {
    const first = `${today.slice(0, 8)}01`
    const prevFirst = `${shift(first, -1).slice(0, 8)}01`
    const prevLen = Math.round((Date.parse(first) - Date.parse(prevFirst)) / DAY)
    return Array.from({ length: Math.min(cur.length, prevLen) }, (_, i) => shift(prevFirst, i))
  }
  return cur.map(d => shift(d, -cur.length))
}

const sum = (pts: Point[] | undefined, days: string[]): number | null => {
  if (!pts || !pts.length) return null
  const set = new Set(days)
  const have = pts.filter(p => set.has(p.d))
  return have.length ? have.reduce((s, p) => s + p.v, 0) : null
}
/** Só compara se a série guardada cobre o período anterior inteiro (evita variações absurdas). */
const covered = (pts: Point[] | undefined, days: string[]) => !!pts?.length && days.length > 0 && pts[0].d <= days[0]
const add = (a: number | null, b: number | null): number | null => (a == null && b == null ? null : (a ?? 0) + (b ?? 0))

export function buildOrganicView(snap: { payload: OrganicSnapshot; fetchedAt: number } | null, preset: string, now: number): OrganicView {
  const base: OrganicView = {
    status: 'pending', at: snap?.fetchedAt ?? null, preset, note: null, profile: null, hasIg: false, hasFb: false,
    kpis: { all: [], ig: [], fb: [] }, series: { dates: [], reachIg: [], reachFb: [], gained: [] }, posts: [], audience: null, stories: [], weekdays: [], unavailable: [],
  }
  if (!snap) return base
  const s = snap.payload
  if (s.status !== 'ok') return { ...base, status: s.status }

  const today = dayKey(now)
  const days = periodDays(preset, today)
  const prev = prevDays(preset, days, today)
  const wk = WINDOW_KEY[preset] ?? '7'
  const ig = s.ig, fb = s.fb
  const win = ig?.windows[wk]

  // ── séries por dia ──
  const byDay = (pts: Point[] | undefined) => new Map((pts ?? []).map(p => [p.d, p.v]))
  const fbReach = fb?.series.page_total_media_view_unique
  const igReachMap = byDay(ig?.reach), fbReachMap = byDay(fbReach), gainedMap = byDay(ig?.gained)
  const series = {
    dates: days,
    reachIg: days.map(d => igReachMap.get(d) ?? 0),
    reachFb: days.map(d => fbReachMap.get(d) ?? 0),
    gained: days.map(d => gainedMap.get(d) ?? 0),
  }

  // ── KPIs por plataforma ──
  const fbSum = (metric: string) => ({ cur: sum(fb?.series[metric], days), prev: covered(fb?.series[metric], prev) ? sum(fb?.series[metric], prev) : null })
  const igW = (m: string) => ({ cur: win?.cur[m] ?? null, prev: win?.prev?.[m] ?? null })
  const igReachDaily = { cur: sum(ig?.reach, days), prev: covered(ig?.reach, prev) ? sum(ig?.reach, prev) : null }
  const igReach = igW('reach').cur != null ? igW('reach') : igReachDaily
  const igGained = { cur: sum(ig?.gained, days), prev: covered(ig?.gained, prev) ? sum(ig?.gained, prev) : null }
  const fbFollowsSeries = fb?.series.page_follows

  const postsAll: OrganicPost[] = [
    ...(ig?.media ?? []).map(m => ({ key: `ig:${m.id}`, platform: 'ig' as const, type: m.type, caption: m.caption, thumb: m.thumb, url: m.url, at: m.at, reach: m.reach, views: m.views, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, interactions: m.interactions ?? ((m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)) })),
    ...(fb?.posts ?? []).map(p => ({ key: `fb:${p.id}`, platform: 'fb' as const, type: p.type, caption: p.caption, thumb: p.thumb, url: p.url, at: p.at, reach: p.reach, views: p.views, likes: p.reactions, comments: p.comments, shares: p.shares, saves: null, interactions: (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) })),
  ]
  const end = preset === 'last_month' ? days[days.length - 1] : today
  const inPeriod = (p: OrganicPost) => { const d = p.at.slice(0, 10); return days.length > 0 && d >= days[0] && d <= end }
  const posts = postsAll.filter(inPeriod).sort((a, b) => b.at.localeCompare(a.at))
  const countIn = (plat: 'ig' | 'fb') => posts.filter(p => p.platform === plat).length
  const interactionsOf = (plat: 'ig' | 'fb') => posts.filter(p => p.platform === plat).reduce((t, p) => t + p.interactions, 0)

  const kpisIg: Kpi[] = ig ? [
    { key: 'followers', label: 'Seguidores', value: s.profile.ig?.followers ?? null, prev: s.profile.ig?.followers != null && igGained.cur != null ? s.profile.ig.followers - igGained.cur : null, note: igGained.cur != null ? `${igGained.cur >= 0 ? '+' : ''}${igGained.cur} no período` : undefined },
    { key: 'reach', label: 'Alcance', value: igReach.cur, prev: igReach.prev },
    { key: 'views', label: 'Visualizações', value: igW('views').cur, prev: igW('views').prev },
    { key: 'interactions', label: 'Interações', value: igW('total_interactions').cur, prev: igW('total_interactions').prev },
    { key: 'engaged', label: 'Contas engajadas', value: igW('accounts_engaged').cur, prev: igW('accounts_engaged').prev },
    { key: 'taps', label: 'Toques nos links do perfil', value: igW('profile_links_taps').cur, prev: igW('profile_links_taps').prev },
    { key: 'visits', label: 'Visitas ao perfil', value: igW('profile_views').cur, prev: igW('profile_views').prev },
    { key: 'gained', label: 'Novos seguidores', value: igGained.cur, prev: igGained.prev },
    { key: 'posts', label: 'Publicações', value: countIn('ig'), prev: null },
    { key: 'avg', label: 'Interações por post', value: countIn('ig') ? Math.round(interactionsOf('ig') / countIn('ig')) : null, prev: null },
  ] : []
  const fbViews = fbSum('page_media_view'), fbReachK = fbSum('page_total_media_view_unique'), fbEng = fbSum('page_post_engagements')
  const fbGained = fbFollowsSeries && fbFollowsSeries.length ? (() => {
    const inRange = fbFollowsSeries.filter(p => days.includes(p.d))
    return inRange.length > 1 ? inRange[inRange.length - 1].v - inRange[0].v : null
  })() : null
  const kpisFb: Kpi[] = fb ? [
    { key: 'followers', label: 'Seguidores', value: s.profile.fb?.followers ?? null, prev: s.profile.fb?.followers != null && fbGained != null ? s.profile.fb.followers - fbGained : null, note: fbGained != null ? `${fbGained >= 0 ? '+' : ''}${fbGained} no período` : undefined },
    { key: 'reach', label: 'Alcance', value: fbReachK.cur, prev: fbReachK.prev, note: 'soma dos dias' },
    { key: 'views', label: 'Visualizações', value: fbViews.cur, prev: fbViews.prev },
    { key: 'interactions', label: 'Interações', value: fbEng.cur, prev: fbEng.prev },
    { key: 'posts', label: 'Publicações', value: countIn('fb'), prev: null },
    { key: 'avg', label: 'Interações por post', value: countIn('fb') ? Math.round(interactionsOf('fb') / countIn('fb')) : null, prev: null },
  ] : []
  const both = (key: string, label: string, note?: string): Kpi => {
    const a = kpisIg.find(k => k.key === key), b = kpisFb.find(k => k.key === key)
    return { key, label, value: add(a?.value ?? null, b?.value ?? null), prev: a?.prev != null || b?.prev != null ? add(a?.prev ?? null, b?.prev ?? null) : null, note }
  }
  const kpisAll: Kpi[] = [
    both('followers', 'Seguidores'),
    both('reach', 'Alcance', 'soma das plataformas'),
    both('views', 'Visualizações'),
    both('interactions', 'Interações'),
    { key: 'posts', label: 'Publicações', value: posts.length, prev: null },
    { key: 'avg', label: 'Interações por post', value: posts.length ? Math.round(posts.reduce((t, p) => t + p.interactions, 0) / posts.length) : null, prev: null },
    ...(ig ? [kpisIg.find(k => k.key === 'engaged')!, kpisIg.find(k => k.key === 'taps')!] : []),
  ]

  // ── melhores dias para postar ──
  const wd = Array.from({ length: 7 }, (_, day) => ({ day, total: 0, posts: 0 }))
  for (const p of postsAll) {
    const t = Date.parse(p.at)
    if (!isFinite(t)) continue
    const day = new Date(t - 3 * 3_600_000).getUTCDay()
    wd[day].total += p.interactions; wd[day].posts++
  }

  return {
    status: 'ok', at: snap.fetchedAt, preset,
    note: preset === 'today' ? 'Hoje ainda não tem dados fechados: mostrando os últimos 7 dias.' : preset === 'this_month' && !days.length ? 'O mês acabou de começar: ainda não há dias fechados.' : null,
    profile: s.profile, hasIg: !!ig, hasFb: !!fb,
    kpis: { all: kpisAll, ig: kpisIg, fb: kpisFb }, series, posts,
    audience: ig ? ig.demo : null,
    stories: ig?.stories ?? [],
    weekdays: wd.map(w => ({ day: w.day, avg: w.posts ? Math.round(w.total / w.posts) : 0, posts: w.posts })),
    unavailable: [...(fb?.unavailable ?? []), ...(ig?.unavailable ?? [])],
  }
}

export async function readOrganic(snaps: SnapshotStore, clientId: string, preset: string, now = Date.now()): Promise<OrganicView> {
  const snap = await snaps.get<OrganicSnapshot>(clientId, ORGANIC_KIND, ORGANIC_KEY)
  return buildOrganicView(snap, preset, now)
}
