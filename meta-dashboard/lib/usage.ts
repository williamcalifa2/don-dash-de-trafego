/** Análise de uso do app: sessões, tempo por tela e cliente, presença e mapa de calor. Só funções puras (a coleta e as telas ficam em outros arquivos). */

export const ONLINE_MS = 50_000
/** Tempo máximo somado por batimento (o navegador manda a cada ~15 s). */
export const MAX_DELTA_SEC = 30

export const VIEW_LABELS: Record<string, string> = {
  metrics: 'Geral', campaigns: 'Campanhas', organic: 'Orgânico', audience: 'Público', funnel: 'Funil', leads: 'Leads',
  ecommerce: 'E-commerce', 'ecommerce/live': 'E-commerce › Live View', 'ecommerce/carrinhos': 'E-commerce › Carrinhos', reports: 'Report Studio', integracoes: 'Integrações',
  admin: 'Painel', 'admin/reports': 'Report Studio (equipe)', 'admin/apresentar': 'Apresentação', 'admin/heatmap': 'Heatmap', 'admin/uso': 'Uso do app', 'admin/equipe': 'Performance', dashboard: 'Painel do cliente',
}
const SUB_LABELS: Record<string, string> = { live: 'Live View', carrinhos: 'Carrinhos', janela: 'Janela' }
const humanize = (t: string) => { const w = t.replace(/-/g, ' ').trim(); return w ? w[0].toUpperCase() + w.slice(1) : t }

/** Nome amigável da tela. "leads/detalhe-do-lead" vira "Leads › Detalhe do lead" (janela ou aba que abre por cima da tela). */
export function viewLabel(v: string): string {
  if (VIEW_LABELS[v]) return VIEW_LABELS[v]
  const parts = v.split('/')
  // Acha o maior começo conhecido ("admin/reports" em "admin/reports/novo-relatorio"); o resto é a janela ou aba por cima.
  for (let n = parts.length - 1; n >= 1; n--) {
    const base = parts.slice(0, n).join('/')
    if (VIEW_LABELS[base]) { const rest = parts.slice(n).join('-'); return `${VIEW_LABELS[base]} › ${SUB_LABELS[rest] ?? humanize(rest)}` }
  }
  return v
}

export type Device = 'desktop' | 'tablet' | 'mobile'
export const deviceOf = (width: number): Device => (width >= 1024 ? 'desktop' : width >= 640 ? 'tablet' : 'mobile')

const VIEW_RE = /^[a-z0-9][a-z0-9/_-]{0,39}$/
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SID_RE = /^[A-Za-z0-9_-]{8,40}$/

export interface BeatClick { sel: string; rx: number; ry: number; /** tela e cliente no instante do clique (o lote pode sair depois de a pessoa mudar de tela) */ view: string | null; client: string | null; label: string | null }
export interface BeatEntry { client: string; view: string; delta: number }
/** Sinais de qualidade: cliques de raiva e mortos, até onde a pessoa rolou a tela, erros de tela e tempo até a tela ficar pronta. */
export type EventKind = 'rage' | 'dead' | 'scroll' | 'perf' | 'error'
export interface BeatEvent { kind: EventKind; view: string | null; client: string | null; sel: string | null; rx: number | null; ry: number | null; n: number; value: number | null; label: string | null; msg: string | null; meta: Record<string, number | string> | null }
export interface Beat { sid: string; view: string; client: string; device: Device; entries: BeatEntry[]; clicks: BeatClick[]; events: BeatEvent[] }

/** Nome curto do botão/aba clicado ("Novo lead"). Nada que pareça dado pessoal: e-mail ou número comprido descarta o rótulo. */
export function cleanLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t || t.length > 40 || /@/.test(t) || /\d{5,}/.test(t)) return null
  return t
}

/** Mensagem de erro sem dado pessoal: e-mail, endereço com parâmetros e números compridos saem. Ruído conhecido (extensões, ResizeObserver) devolve null. */
export function cleanError(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let t = v.replace(/\s+/g, ' ').trim()
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/https?:\/\/[^\s)'"]+/g, u => { try { const x = new URL(u); return x.origin + x.pathname } catch { return '<url>' } })
    .replace(/\d{5,}/g, '#')
  t = t.slice(0, 160)
  if (!t || /^script error\.?$/i.test(t) || /ResizeObserver loop/i.test(t) || /^Non-Error promise rejection/i.test(t)) return null
  return t
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN }
const unit = (v: unknown) => { const n = num(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 1000) / 1000)) : null }

const EVENT_KINDS: readonly string[] = ['rage', 'dead', 'scroll', 'perf', 'error']
const META_NUM = ['ttfb', 'lcp', 'cls', 'line'] as const

/** Valida os sinais de qualidade do batimento. Cada tipo exige o que precisa (raiva e morto: onde; rolagem: profundidade; desempenho: tempo; erro: mensagem). */
export function normalizeEvents(raw: unknown): BeatEvent[] {
  const out: BeatEvent[] = []
  for (const e of (Array.isArray(raw) ? raw : []).slice(0, 40)) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const kind = typeof o.kind === 'string' && EVENT_KINDS.includes(o.kind) ? o.kind as EventKind : null
    if (!kind) continue
    const view = typeof o.view === 'string' && VIEW_RE.test(o.view) ? o.view : null
    const client = typeof o.client === 'string' && o.client.length <= 40 && (o.client === '' || SLUG.test(o.client)) ? o.client : null
    const ev: BeatEvent = { kind, view, client, sel: null, rx: null, ry: null, n: 1, value: null, label: null, msg: null, meta: null }
    if (kind === 'rage' || kind === 'dead') {
      const sel = typeof o.sel === 'string' ? o.sel.trim() : ''
      const rx = unit(o.rx), ry = unit(o.ry)
      if (!sel || sel.length > 300 || rx == null || ry == null) continue
      ev.sel = sel; ev.rx = rx; ev.ry = ry; ev.label = cleanLabel(o.label)
      if (kind === 'rage') { const n = Math.round(num(o.n)); if (!Number.isFinite(n) || n < 3) continue; ev.n = Math.min(n, 99) }
    } else if (kind === 'scroll') {
      const v = num(o.value)
      if (!Number.isFinite(v)) continue
      ev.value = Math.min(100, Math.max(0, Math.round(v)))
    } else if (kind === 'perf') {
      const v = num(o.value)
      if (!Number.isFinite(v) || v < 0 || v > 60_000) continue
      ev.value = Math.round(v)
      const m = (o.meta && typeof o.meta === 'object' ? o.meta : {}) as Record<string, unknown>
      const meta: Record<string, number | string> = { nav: m.nav === 'load' ? 'load' : 'tab' }
      for (const k of META_NUM) { const x = num(m[k]); if (Number.isFinite(x) && x >= 0 && x < 1e6) meta[k] = Math.round(x * 1000) / 1000 }
      ev.meta = meta
    } else {
      const msg = cleanError(o.msg)
      if (!msg) continue
      ev.msg = msg
      const m = (o.meta && typeof o.meta === 'object' ? o.meta : {}) as Record<string, unknown>
      const meta: Record<string, number | string> = {}
      if (typeof m.file === 'string' && /^[\w.@~-]{1,60}$/.test(m.file)) meta.file = m.file
      const line = num(m.line); if (Number.isFinite(line) && line >= 0 && line < 1e7) meta.line = Math.round(line)
      ev.meta = Object.keys(meta).length ? meta : null
    }
    out.push(ev)
  }
  return out
}

/** Valida o corpo do batimento. Devolve null se não presta; descarta o que vier fora do formato em vez de aceitar. */
export function normalizeBeat(body: unknown): Beat | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const sid = typeof b.sid === 'string' ? b.sid : ''
  if (!SID_RE.test(sid)) return null
  const view = typeof b.view === 'string' && VIEW_RE.test(b.view) ? b.view : ''
  if (!view) return null
  const client = typeof b.client === 'string' && b.client.length <= 40 && (b.client === '' || SLUG.test(b.client)) ? b.client : ''
  const width = num(b.w)
  const device = deviceOf(Number.isFinite(width) ? width : 1280)

  const entries: BeatEntry[] = []
  for (const e of (Array.isArray(b.entries) ? b.entries : []).slice(0, 6)) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const ev = typeof o.view === 'string' && VIEW_RE.test(o.view) ? o.view : null
    const ec = typeof o.client === 'string' && o.client.length <= 40 && (o.client === '' || SLUG.test(o.client)) ? o.client : null
    const d = Math.round(num(o.delta))
    if (ev == null || ec == null || !Number.isFinite(d) || d <= 0) continue
    entries.push({ client: ec, view: ev, delta: Math.min(d, MAX_DELTA_SEC) })
  }

  const clicks: BeatClick[] = []
  for (const c of (Array.isArray(b.clicks) ? b.clicks : []).slice(0, 100)) {
    if (!c || typeof c !== 'object') continue
    const o = c as Record<string, unknown>
    const sel = typeof o.sel === 'string' ? o.sel.trim() : ''
    const rx = unit(o.rx), ry = unit(o.ry)
    if (!sel || sel.length > 300 || rx == null || ry == null) continue
    const cv = typeof o.view === 'string' && VIEW_RE.test(o.view) ? o.view : null
    const cc = typeof o.client === 'string' && o.client.length <= 40 && (o.client === '' || SLUG.test(o.client)) ? o.client : null
    clicks.push({ sel, rx, ry, view: cv, client: cc, label: cleanLabel(o.label) })
  }
  return { sid, view, client, device, entries, clicks, events: normalizeEvents(b.events) }
}

export const isOnline = (lastSeenIso: string, now = Date.now()) => now - Date.parse(lastSeenIso) <= ONLINE_MS

export interface SessionRow { sid: string; user_key: string; role: string; started_at: string; last_seen: string; active_sec: number; last_view: string | null; last_client: string | null; device: string | null; country?: string | null }
export interface ViewRow { sid: string; client_slug: string; view: string; seconds: number }
export interface LoginRow { at: string; user_key: string; role: string; client_slug: string | null; ok: boolean; country: string | null; city: string | null; device: string | null }

export interface UsageSummary {
  kpis: { online: number; sessions: number; activeSec: number; users: number }
  online: Array<{ userKey: string; role: string; view: string; client: string; since: string; lastSeen: string; device: string | null }>
  people: Array<{ userKey: string; role: string; sessions: number; activeSec: number; lastSeen: string; topClient: string | null; topView: string | null }>
  byClient: Array<{ slug: string; sec: number; users: number }>
  byView: Array<{ view: string; sec: number; users: number }>
}

const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

/** Junta sessões e tempos por tela. `onlyUser` filtra os blocos por cliente e por tela; a lista de pessoas e a presença continuam completas. */
export function summarizeUsage(sessions: SessionRow[], views: ViewRow[], now = Date.now(), onlyUser?: string | null): UsageSummary {
  const owner = new Map(sessions.map(s => [s.sid, s.user_key]))
  const byUser = new Map<string, { role: string; sessions: number; activeSec: number; lastSeen: string; clients: Map<string, number>; views: Map<string, number> }>()
  for (const s of sessions) {
    const u = byUser.get(s.user_key) ?? { role: s.role, sessions: 0, activeSec: 0, lastSeen: s.last_seen, clients: new Map(), views: new Map() }
    u.sessions++
    u.activeSec += s.active_sec
    if (s.last_seen > u.lastSeen) u.lastSeen = s.last_seen
    byUser.set(s.user_key, u)
  }
  const clientSec = new Map<string, { sec: number; users: Set<string> }>()
  const viewSec = new Map<string, { sec: number; users: Set<string> }>()
  for (const v of views) {
    const user = owner.get(v.sid)
    if (!user) continue
    const u = byUser.get(user)
    if (u) {
      if (v.client_slug) u.clients.set(v.client_slug, (u.clients.get(v.client_slug) ?? 0) + v.seconds)
      u.views.set(v.view, (u.views.get(v.view) ?? 0) + v.seconds)
    }
    if (onlyUser && user !== onlyUser) continue
    if (v.client_slug) { const c = clientSec.get(v.client_slug) ?? { sec: 0, users: new Set<string>() }; c.sec += v.seconds; c.users.add(user); clientSec.set(v.client_slug, c) }
    const w = viewSec.get(v.view) ?? { sec: 0, users: new Set<string>() }; w.sec += v.seconds; w.users.add(user); viewSec.set(v.view, w)
  }
  const live = sessions.filter(s => isOnline(s.last_seen, now))
  const onlineUsers = new Map<string, SessionRow>()
  for (const s of live) { const cur = onlineUsers.get(s.user_key); if (!cur || s.last_seen > cur.last_seen) onlineUsers.set(s.user_key, s) }
  return {
    kpis: { online: onlineUsers.size, sessions: sessions.length, activeSec: sessions.reduce((n, s) => n + s.active_sec, 0), users: byUser.size },
    online: [...onlineUsers.values()].map(s => ({ userKey: s.user_key, role: s.role, view: s.last_view ?? '', client: s.last_client ?? '', since: s.started_at, lastSeen: s.last_seen, device: s.device })).sort((a, b) => a.userKey.localeCompare(b.userKey)),
    people: [...byUser.entries()].map(([userKey, u]) => ({ userKey, role: u.role, sessions: u.sessions, activeSec: u.activeSec, lastSeen: u.lastSeen, topClient: top(u.clients), topView: top(u.views) })).sort((a, b) => b.activeSec - a.activeSec),
    byClient: [...clientSec.entries()].map(([slug, c]) => ({ slug, sec: c.sec, users: c.users.size })).sort((a, b) => b.sec - a.sec),
    byView: [...viewSec.entries()].map(([view, c]) => ({ view, sec: c.sec, users: c.users.size })).sort((a, b) => b.sec - a.sec),
  }
}

export interface HeatPoint { sel: string; rx: number; ry: number; n: number }

/** Agrupa cliques do mesmo elemento em quadrinhos de 5% (20×20), para não mandar cada clique ao navegador. */
export function heatBins(rows: Array<{ sel: string; rx: number; ry: number; n?: number }>, limit = 4000): HeatPoint[] {
  const m = new Map<string, HeatPoint>()
  for (const r of rows) {
    const bx = Math.min(19, Math.floor(r.rx * 20)), by = Math.min(19, Math.floor(r.ry * 20))
    const key = `${r.sel}|${bx}|${by}`
    const e = m.get(key)
    const w = r.n && r.n > 0 ? r.n : 1
    if (e) e.n += w
    else m.set(key, { sel: r.sel, rx: (bx + 0.5) / 20, ry: (by + 0.5) / 20, n: w })
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, limit)
}

export const fmtDuration = (sec: number): string => {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')} min`
}

/** Início do período em ms (Brasil): hoje = meia-noite; 7 e 30 = dias corridos incluindo hoje. */
export function usageSince(period: string, now = Date.now()): number {
  const BR = 3 * 3_600_000, DAY = 86_400_000
  const local = now - BR
  const dayStart = local - (((local % DAY) + DAY) % DAY)
  const days = period === 'today' ? 0 : period === '30' ? 29 : 6
  return dayStart - days * DAY + BR
}

/** Recorta as sessões e os tempos para um cliente só: o "tempo ativo" de cada sessão passa a ser o tempo dentro desse cliente. */
export function focusClient(sessions: SessionRow[], views: ViewRow[], client: string): { sessions: SessionRow[]; views: ViewRow[] } {
  const cv = views.filter(v => v.client_slug === client)
  const secBySid = new Map<string, number>()
  for (const v of cv) secBySid.set(v.sid, (secBySid.get(v.sid) ?? 0) + v.seconds)
  return { sessions: sessions.filter(s => secBySid.has(s.sid)).map(s => ({ ...s, active_sec: secBySid.get(s.sid) ?? 0 })), views: cv }
}

export interface Visit { sid: string; userKey: string; role: string; startedAt: string; lastSeen: string; seconds: number; topView: string | null; views: Array<{ view: string; sec: number }>; lastClient: string | null; device: string | null; country: string | null; online: boolean }

/** Um acesso por sessão: quem entrou, quando, quanto tempo ficou e em quais telas (da que mais prendeu à que menos). */
export function buildVisits(sessions: SessionRow[], views: ViewRow[], limit = 40, now = Date.now()): Visit[] {
  const bySid = new Map<string, Map<string, number>>()
  for (const v of views) { const m = bySid.get(v.sid) ?? new Map<string, number>(); m.set(v.view, (m.get(v.view) ?? 0) + v.seconds); bySid.set(v.sid, m) }
  return sessions.map(s => {
    const list = [...(bySid.get(s.sid) ?? new Map<string, number>()).entries()].map(([view, sec]) => ({ view, sec })).sort((a, b) => b.sec - a.sec)
    return { sid: s.sid, userKey: s.user_key, role: s.role, startedAt: s.started_at, lastSeen: s.last_seen, seconds: s.active_sec, topView: list[0]?.view ?? null, views: list, lastClient: s.last_client, device: s.device, country: s.country ?? null, online: isOnline(s.last_seen, now) }
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit)
}

export interface TopElement { sel: string; label: string | null; n: number }

/** Elementos mais clicados de uma tela, com o nome do botão quando existe. Serve para telas que não abrem no visualizador (janelas, abas que dependem de clique). */
export function topElements(rows: Array<{ sel: string; label?: string | null }>, limit = 12): TopElement[] {
  const m = new Map<string, TopElement>()
  for (const r of rows) {
    const key = `${r.sel}|${r.label ?? ''}`
    const e = m.get(key)
    if (e) e.n++
    else m.set(key, { sel: r.sel, label: r.label ?? null, n: 1 })
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, limit)
}


// ─── Comportamento de uso: dias, horários, aparelhos e clientes sem acesso ───

const BR_MS = 3 * 3_600_000
const brDay = (ms: number) => new Date(ms - BR_MS).toISOString().slice(0, 10)
const brHour = (ms: number) => new Date(ms - BR_MS).getUTCHours()

/** Papéis da equipe da agência (o cliente que usa o próprio painel não conta como acesso da equipe). */
export const TEAM_ROLES = ['owner', 'admin', 'member', 'reader']

export interface Breakdown { daily: Array<{ day: string; sec: number; sessions: number }>; hours: number[]; devices: { desktop: number; tablet: number; mobile: number } }

/** Tempo ativo por dia, sessões por hora do dia e por aparelho, no horário do Brasil. Dias sem uso entram com zero, para o gráfico não pular. */
export function activityBreakdown(sessions: SessionRow[], sinceMs: number, nowMs: number): Breakdown {
  const days = new Map<string, { sec: number; sessions: number }>()
  for (let t = sinceMs; brDay(t) <= brDay(nowMs); t += 86_400_000) days.set(brDay(t), { sec: 0, sessions: 0 })
  const hours = Array.from({ length: 24 }, () => 0)
  const devices = { desktop: 0, tablet: 0, mobile: 0 }
  for (const s of sessions) {
    const t = Date.parse(s.started_at)
    if (!Number.isFinite(t)) continue
    const d = days.get(brDay(t))
    if (d) { d.sec += s.active_sec; d.sessions++ }
    hours[brHour(t)]++
    if (s.device === 'tablet' || s.device === 'mobile') devices[s.device]++
    else devices.desktop++
  }
  return { daily: [...days.entries()].map(([day, v]) => ({ day, ...v })), hours, devices }
}

/** Clientes em que a equipe não passou tempo nenhum no período (para lembrar de olhar). */
export function clientsWithoutTeamAccess(clients: Array<{ slug: string; name: string }>, sessions: SessionRow[], views: ViewRow[]): Array<{ slug: string; name: string }> {
  const team = new Set(sessions.filter(s => TEAM_ROLES.includes(s.role)).map(s => s.sid))
  const seen = new Set(views.filter(v => v.seconds > 0 && v.client_slug && team.has(v.sid)).map(v => v.client_slug))
  return clients.filter(c => !seen.has(c.slug))
}
