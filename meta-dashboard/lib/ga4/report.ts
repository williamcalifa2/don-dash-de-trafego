/** Google Analytics 4: consultas e leitura das respostas da API de Dados. Só funções puras. */

export interface GaRange { since: string; until: string }

export interface GaSummary { sessions: number; users: number; newUsers: number; engagementRate: number; avgSessionSec: number; keyEvents: number; conversionRate: number }
export interface GaDay { date: string; sessions: number; keyEvents: number }
export interface GaRow { label: string; sessions: number; keyEvents: number; users: number; engagementRate: number }

export interface GaReport {
  range: GaRange
  summary: GaSummary
  previous: GaSummary
  daily: GaDay[]
  sources: GaRow[]
  campaigns: GaRow[]
  pages: GaRow[]
  devices: GaRow[]
  cities: GaRow[]
  /** usuários no site agora (tempo real); nulo se não deu para ler */
  live: number | null
  source: 'live' | 'demo'
}

/** Resposta de um relatório da API de Dados (só o que lemos). */
export interface GaResponse {
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string }>
  rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }>
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export function derive(t: { sessions: number; users: number; newUsers: number; engagementRate: number; avgSessionSec: number; keyEvents: number }): GaSummary {
  return { ...t, conversionRate: t.sessions ? (t.keyEvents / t.sessions) * 100 : 0 }
}

/** ID da propriedade: só números (aceita "properties/123456789"). Vazio se inválido. */
export function cleanPropertyId(raw: unknown): string {
  const d = String(raw ?? '').trim().replace(/^properties\//i, '')
  return /^\d{5,12}$/.test(d) ? d : ''
}

const HEAD = ['sessions', 'totalUsers', 'newUsers', 'engagementRate', 'averageSessionDuration', 'keyEvents'] as const
const METRICS = HEAD.map(name => ({ name }))
const dim = (name: string) => [{ name }]
const dateRanges = (r: GaRange, prev: GaRange) => [{ startDate: r.since, endDate: r.until, name: 'atual' }, { startDate: prev.since, endDate: prev.until, name: 'anterior' }]

/** Primeiro lote (até 5 relatórios por chamada): resumo com comparativo, dia a dia, origem/mídia, campanhas e páginas. */
export function batchOne(r: GaRange, prev: GaRange) {
  const one = [{ startDate: r.since, endDate: r.until }]
  return [
    { dateRanges: dateRanges(r, prev), metrics: METRICS },
    { dateRanges: one, dimensions: dim('date'), metrics: [{ name: 'sessions' }, { name: 'keyEvents' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 100 },
    { dateRanges: one, dimensions: dim('sessionSourceMedium'), metrics: rowMetrics(), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 },
    { dateRanges: one, dimensions: dim('sessionCampaignName'), metrics: rowMetrics(), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 12 },
    { dateRanges: one, dimensions: dim('landingPagePlusQueryString'), metrics: rowMetrics(), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 },
  ]
}
/** Segundo lote: dispositivo e cidade. */
export function batchTwo(r: GaRange) {
  const one = [{ startDate: r.since, endDate: r.until }]
  return [
    { dateRanges: one, dimensions: dim('deviceCategory'), metrics: rowMetrics(), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 5 },
    { dateRanges: one, dimensions: dim('city'), metrics: rowMetrics(), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 },
  ]
}
function rowMetrics() { return [{ name: 'sessions' }, { name: 'keyEvents' }, { name: 'totalUsers' }, { name: 'engagementRate' }] }

/** Lê uma linha de métricas na ordem em que foram pedidas. */
function metricsOf(row: { metricValues?: Array<{ value: string }> } | undefined, names: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  names.forEach((n, i) => { out[n] = num(row?.metricValues?.[i]?.value) })
  return out
}

/** Resumo do período atual e do anterior (a API devolve uma linha por intervalo, marcada em `dateRange`). */
export function parseSummary(res: GaResponse | undefined): { current: GaSummary; previous: GaSummary } {
  const pick = (range: string): GaSummary => {
    const idx = (res?.dimensionHeaders ?? []).findIndex(h => h.name === 'dateRange')
    const row = res?.rows?.find(r => (idx >= 0 ? r.dimensionValues?.[idx]?.value : '') === range) ?? (idx < 0 && range === 'atual' ? res?.rows?.[0] : undefined)
    const m = metricsOf(row, HEAD)
    return derive({ sessions: m.sessions, users: m.totalUsers, newUsers: m.newUsers, engagementRate: m.engagementRate * 100, avgSessionSec: m.averageSessionDuration, keyEvents: m.keyEvents })
  }
  return { current: pick('atual'), previous: pick('anterior') }
}

export function parseDaily(res: GaResponse | undefined): GaDay[] {
  return (res?.rows ?? []).map(r => {
    const raw = r.dimensionValues?.[0]?.value ?? ''
    return { date: raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw, sessions: num(r.metricValues?.[0]?.value), keyEvents: num(r.metricValues?.[1]?.value) }
  }).sort((a, b) => a.date.localeCompare(b.date))
}

const NOT_SET = /^\((not set|not provided)\)$/i
const CLEAN: Record<string, string> = { '(direct) / (none)': 'Direto', '(not set)': 'Não informado' }

/** Linhas de uma dimensão: nome legível, sessões, eventos-chave, usuários e engajamento. `hideNotSet` tira "(not set)" (campanhas sem UTM). */
export function parseRows(res: GaResponse | undefined, opts: { hideNotSet?: boolean; pretty?: (s: string) => string } = {}): GaRow[] {
  return (res?.rows ?? [])
    .map(r => {
      const raw = r.dimensionValues?.[0]?.value ?? ''
      return { raw, row: { label: opts.pretty ? opts.pretty(raw) : CLEAN[raw] ?? raw, sessions: num(r.metricValues?.[0]?.value), keyEvents: num(r.metricValues?.[1]?.value), users: num(r.metricValues?.[2]?.value), engagementRate: num(r.metricValues?.[3]?.value) * 100 } }
    })
    .filter(x => !(opts.hideNotSet && NOT_SET.test(x.raw)))
    .map(x => x.row)
}

export const DEVICE_LABEL: Record<string, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', 'smart tv': 'TV' }
export const prettyDevice = (s: string) => DEVICE_LABEL[s.toLowerCase()] ?? s
export const prettySource = (s: string) => (s === '(direct) / (none)' ? 'Direto' : s.replace(/ \/ \(none\)$/, '').replace(/^\(not set\)/, 'Não informado'))
export const parseLive = (res: GaResponse | undefined): number | null => (res?.rows?.length ? num(res.rows[0].metricValues?.[0]?.value) : res ? 0 : null)
