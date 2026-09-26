/** Acessos ao Gerenciador da Meta (avisados pela extensão): agrupa as visitas por pessoa e cliente. Só funções puras. */

export interface VisitRow { visit_id: string; user_key: string; client_slug: string; started_at: string; last_seen: string; active_sec: number }

export interface AccessEntry {
  userKey: string; slug: string
  /** quantas vezes abriu a conta no período */
  opens: number
  activeSec: number
  firstAt: string; lastAt: string
  /** com a conta aberta agora (aviso nos últimos minutos) */
  live: boolean
}

/** Uma visita continua "ao vivo" enquanto a extensão avisa (a cada ~30 s). */
export const LIVE_MS = 3 * 60_000

export function summarizeVisits(rows: VisitRow[], nowMs: number): AccessEntry[] {
  const by = new Map<string, AccessEntry>()
  for (const r of rows) {
    const k = `${r.user_key}|${r.client_slug}`
    const e = by.get(k) ?? { userKey: r.user_key, slug: r.client_slug, opens: 0, activeSec: 0, firstAt: r.started_at, lastAt: r.last_seen, live: false }
    e.opens++; e.activeSec += r.active_sec
    if (r.started_at < e.firstAt) e.firstAt = r.started_at
    if (r.last_seen > e.lastAt) e.lastAt = r.last_seen
    by.set(k, e)
  }
  for (const e of by.values()) e.live = nowMs - Date.parse(e.lastAt) < LIVE_MS
  return [...by.values()].sort((a, b) => Number(b.live) - Number(a.live) || b.lastAt.localeCompare(a.lastAt))
}

export const fmtActive = (sec: number) => (sec < 60 ? 'menos de 1 min' : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`)
