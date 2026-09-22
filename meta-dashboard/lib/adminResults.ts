/** Resultado de um cliente (card do admin), calculado a partir da série diária da conta. Sem chamar a Meta. */
import { getActions, getConversations, getCustomConversions, getFormLeads, getPurchaseCount, getPurchaseValue, getResults, getSiteLeads, resultCounts } from './meta'
import { detectKind, type ResultKind } from './resultKind'

type Action = { action_type: string; value: string }
export interface DailyRow { date_start?: string; spend?: string | number; impressions?: string | number; clicks?: string | number; actions?: Action[]; action_values?: Action[] }

export { PERIODS, type PeriodDays } from './periods'
import { ADMIN_PERIOD_KEYS, type AdminPeriod } from './periods'

/** Totais da Meta em um período. */
export interface MetaTotals {
  spend: number; impressions: number; clicks: number; results: number
  formLeads: number; siteLeads: number; conversations: number; custom: number
  purchases: number; purchaseValue: number; linkClicks: number; landingViews: number
}

export interface ResultsSummary {
  kind: ResultKind
  /** 14 dias de resultados por dia, do mais antigo ao mais recente (dias sem dado = 0) */
  daily: number[]
  periods: Record<AdminPeriod, MetaTotals>
  /** quantos dias de histórico a série realmente cobre (ao vivo só há 14) */
  spanDays: number
}

const BR_OFFSET = 3 * 3600 * 1000
export const dayKey = (t: number) => new Date(t - BR_OFFSET).toISOString().slice(0, 10)
const n = (v: unknown) => Number(v ?? 0) || 0

const zero = (): MetaTotals => ({ spend: 0, impressions: 0, clicks: 0, results: 0, formLeads: 0, siteLeads: 0, conversations: 0, custom: 0, purchases: 0, purchaseValue: 0, linkClicks: 0, landingViews: 0 })

/** Dias (data do Brasil) de cada período. Os de N dias terminam em "ontem" (a Meta entrega dias fechados); "hoje" é só hoje; "mês" vai do dia 1 até hoje. */
export function periodKeys(now: number, period: AdminPeriod): string[] {
  if (period === 'today') return [dayKey(now)]
  if (period === 'month') {
    const today = dayKey(now)
    return Array.from({ length: Number(today.slice(8, 10)) }, (_, i) => `${today.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
  }
  return Array.from({ length: period }, (_, i) => dayKey(now - (period - i) * 86_400_000))
}

export function metaTotals(rows: DailyRow[], now: number, period: AdminPeriod | number): MetaTotals {
  const keys = new Set(periodKeys(now, period as AdminPeriod))
  const t = zero()
  for (const r of rows) {
    if (!r.date_start || !keys.has(r.date_start)) continue
    t.spend += n(r.spend); t.impressions += n(r.impressions); t.clicks += n(r.clicks)
    t.results += getResults(r.actions)
    t.formLeads += getFormLeads(r.actions); t.siteLeads += getSiteLeads(r.actions); t.conversations += getConversations(r.actions); t.custom += getCustomConversions(r.actions)
    t.purchases += getPurchaseCount(r.actions); t.purchaseValue += getPurchaseValue(r.action_values)
    t.linkClicks += getActions(r.actions, ['link_click']); t.landingViews += getActions(r.actions, ['landing_page_view'])
  }
  return t
}

export function summarizeDaily(rows: DailyRow[], now: number, days = 14): ResultsSummary {
  const keys = Array.from({ length: days }, (_, i) => dayKey(now - (days - i) * 86_400_000))
  const byDay = new Map<string, number>()
  for (const r of rows) if (r.date_start) byDay.set(r.date_start, (byDay.get(r.date_start) ?? 0) + getResults(r.actions))
  const window = new Set(Array.from({ length: 30 }, (_, i) => dayKey(now - (30 - i) * 86_400_000)))
  const spanDays = new Set(rows.map(r => r.date_start).filter((d): d is string => !!d && window.has(d))).size
  const kind = detectKind({
    form_leads: rows.reduce((s, r) => s + resultCounts(r.actions).form_leads, 0),
    site_leads: rows.reduce((s, r) => s + resultCounts(r.actions).site_leads, 0),
    conversations: rows.reduce((s, r) => s + resultCounts(r.actions).conversations, 0),
    custom_conversions: rows.reduce((s, r) => s + resultCounts(r.actions).custom_conversions, 0),
  })
  return {
    kind, daily: keys.map(k => byDay.get(k) ?? 0), spanDays,
    periods: Object.fromEntries(ADMIN_PERIOD_KEYS.map(p => [p, metaTotals(rows, now, p)])) as Record<AdminPeriod, MetaTotals>,
  }
}
