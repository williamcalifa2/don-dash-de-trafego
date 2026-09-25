/** Qualidade da experiência no app: agrupa os sinais coletados (raiva, mortos, rolagem, erros, desempenho). Só funções puras. */

export interface EventRow {
  at: string; sid: string; user_key: string; client_slug: string; view: string; kind: string
  sel: string | null; rx: number | null; ry: number | null; n: number | null; value: number | null; label: string | null; msg: string | null
  meta: Record<string, number | string> | null
}

/** Acima disso a tela é considerada lenta (Core Web Vitals trata 2,5 s como bom e 4 s como ruim; o app espera dados, então usamos 3 s). */
export const SLOW_MS = 3000

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return s[i]
}

export interface Friction { view: string; sel: string; label: string | null; events: number; clicks: number; users: number; last: string; /** quem mais passou por isso (até 3) */ who: Array<{ userKey: string; n: number }> }

/** Cliques de raiva ou mortos agrupados por tela e elemento: onde a pessoa tentou e nada respondeu. */
export function frictionByElement(rows: EventRow[], kind: 'rage' | 'dead', limit = 30): Friction[] {
  const m = new Map<string, { f: Friction; users: Map<string, number> }>()
  for (const r of rows) {
    if (r.kind !== kind || !r.sel) continue
    const key = `${r.view}|${r.sel}`
    const e = m.get(key) ?? { f: { view: r.view, sel: r.sel, label: r.label, events: 0, clicks: 0, users: 0, last: r.at, who: [] }, users: new Map<string, number>() }
    e.f.events++; e.f.clicks += r.n ?? 1; e.users.set(r.user_key, (e.users.get(r.user_key) ?? 0) + 1)
    if (r.at > e.f.last) e.f.last = r.at
    if (!e.f.label && r.label) e.f.label = r.label
    m.set(key, e)
  }
  return [...m.values()].map(e => ({ ...e.f, users: e.users.size, who: [...e.users.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([userKey, n]) => ({ userKey, n })) }))
    .sort((a, b) => b.events - a.events || b.clicks - a.clicks).slice(0, limit)
}

export interface Frustrated { userKey: string; rage: number; rageClicks: number; dead: number; topView: string | null; last: string }

/** Quem mais esbarra em cliques de raiva e mortos: a pessoa que está tendo dificuldade com o app. */
export function frictionByPerson(rows: EventRow[], limit = 20): Frustrated[] {
  const m = new Map<string, { f: Frustrated; views: Map<string, number> }>()
  for (const r of rows) {
    if (r.kind !== 'rage' && r.kind !== 'dead') continue
    const e = m.get(r.user_key) ?? { f: { userKey: r.user_key, rage: 0, rageClicks: 0, dead: 0, topView: null, last: r.at }, views: new Map<string, number>() }
    if (r.kind === 'rage') { e.f.rage++; e.f.rageClicks += r.n ?? 1 } else e.f.dead++
    e.views.set(r.view, (e.views.get(r.view) ?? 0) + 1)
    if (r.at > e.f.last) e.f.last = r.at
    m.set(r.user_key, e)
  }
  return [...m.values()].map(e => ({ ...e.f, topView: [...e.views.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }))
    .sort((a, b) => (b.rage + b.dead) - (a.rage + a.dead) || b.rageClicks - a.rageClicks).slice(0, limit)
}

export interface ErrorGroup { msg: string; view: string; count: number; sessions: number; users: number; last: string; lastUser: string; lastClient: string; lastSid: string; file: string | null; line: number | null }

/** Erros iguais (mesma mensagem, mesma tela) juntos, com quem viu por último. */
export function groupErrors(rows: EventRow[], limit = 30): ErrorGroup[] {
  const m = new Map<string, { g: ErrorGroup; users: Set<string>; sids: Set<string> }>()
  for (const r of rows) {
    if (r.kind !== 'error' || !r.msg) continue
    const key = `${r.view}|${r.msg}`
    const e = m.get(key) ?? { g: { msg: r.msg, view: r.view, count: 0, sessions: 0, users: 0, last: r.at, lastUser: r.user_key, lastClient: r.client_slug, lastSid: r.sid, file: null, line: null }, users: new Set<string>(), sids: new Set<string>() }
    e.g.count++; e.users.add(r.user_key); e.sids.add(r.sid)
    if (r.at >= e.g.last) { e.g.last = r.at; e.g.lastUser = r.user_key; e.g.lastClient = r.client_slug; e.g.lastSid = r.sid }
    if (!e.g.file && r.meta?.file) { e.g.file = String(r.meta.file); e.g.line = r.meta.line != null ? Number(r.meta.line) : null }
    m.set(key, e)
  }
  return [...m.values()].map(e => ({ ...e.g, sessions: e.sids.size, users: e.users.size })).sort((a, b) => b.last.localeCompare(a.last)).sort((a, b) => b.count - a.count).slice(0, limit)
}

export interface PerfRow { view: string; samples: number; p50: number; p75: number; slow: number; loadP75: number | null; tabP75: number | null; lcpP75: number | null; ttfbP50: number | null }

/** Tempo até a tela ficar pronta, por tela: mediana, 75% (o "quase pior caso") e quantas vezes passou de 3 s. */
export function perfByView(rows: EventRow[], limit = 30): PerfRow[] {
  const by = new Map<string, EventRow[]>()
  for (const r of rows) { if (r.kind === 'perf' && r.value != null) (by.get(r.view) ?? by.set(r.view, []).get(r.view)!).push(r) }
  const pick = (list: EventRow[], f: (r: EventRow) => number | null) => list.map(f).filter((x): x is number => x != null)
  return [...by.entries()].map(([view, list]) => {
    const all = list.map(r => r.value as number)
    const load = list.filter(r => r.meta?.nav === 'load').map(r => r.value as number)
    const tab = list.filter(r => r.meta?.nav !== 'load').map(r => r.value as number)
    const lcp = pick(list, r => (r.meta?.lcp != null ? Number(r.meta.lcp) : null))
    const ttfb = pick(list, r => (r.meta?.ttfb != null ? Number(r.meta.ttfb) : null))
    return {
      view, samples: all.length, p50: percentile(all, 50), p75: percentile(all, 75), slow: all.filter(v => v > SLOW_MS).length,
      loadP75: load.length ? percentile(load, 75) : null, tabP75: tab.length ? percentile(tab, 75) : null,
      lcpP75: lcp.length ? percentile(lcp, 75) : null, ttfbP50: ttfb.length ? percentile(ttfb, 50) : null,
    }
  }).sort((a, b) => b.p75 - a.p75).slice(0, limit)
}

export interface ScrollRow { view: string; visits: number; avg: number; reach: { 25: number; 50: number; 75: number; 100: number } }

/** Profundidade máxima por visita (sessão + tela). */
function maxDepths(rows: EventRow[]): Map<string, Map<string, number>> {
  const by = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (r.kind !== 'scroll' || r.value == null) continue
    const v = by.get(r.view) ?? by.set(r.view, new Map()).get(r.view)!
    v.set(r.sid, Math.max(v.get(r.sid) ?? 0, r.value))
  }
  return by
}

/** Até onde as pessoas descem em cada tela: média e quantas chegam a 25/50/75/100% da página. */
export function scrollByView(rows: EventRow[], limit = 30): ScrollRow[] {
  return [...maxDepths(rows).entries()].map(([view, sids]) => {
    const d = [...sids.values()]
    const share = (p: number) => Math.round((d.filter(x => x >= p).length / d.length) * 100)
    return { view, visits: d.length, avg: Math.round(d.reduce((n, x) => n + x, 0) / d.length), reach: { 25: share(25), 50: share(50), 75: share(75), 100: share(99) } }
  }).sort((a, b) => b.visits - a.visits).slice(0, limit)
}

/** Faixas de 5% da página com a parcela de visitas que chegou até ali (1 = todas). Serve para pintar o mapa de rolagem. */
export function scrollBands(rows: EventRow[], view: string): { visits: number; bands: number[] } {
  const d = [...(maxDepths(rows).get(view)?.values() ?? [])]
  if (!d.length) return { visits: 0, bands: [] }
  return { visits: d.length, bands: Array.from({ length: 20 }, (_, i) => d.filter(x => x >= i * 5 + 2.5).length / d.length) }
}
