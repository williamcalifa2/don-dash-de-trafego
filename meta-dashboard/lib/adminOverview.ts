/** Soma das métricas de todos os clientes, por dia. Funciona só com a série diária guardada; não chama a Meta. */
import type { DailyRow } from './adminResults'
import { getResults } from './meta'
import { periodKeys } from './adminResults'
import type { AdminPeriod } from './periods'

const BR_OFFSET = 3 * 3600 * 1000
const dayKey = (t: number) => new Date(t - BR_OFFSET).toISOString().slice(0, 10)

export interface Totals { spend: number; impressions: number; clicks: number; results: number }
export interface Overview {
  days: number
  period: AdminPeriod
  dates: string[]
  spend: number[]
  results: number[]
  impressions: number[]
  clicks: number[]
  totals: Totals
  /** período anterior equivalente; null quando os dados guardados não cobrem */
  prev: Totals | null
  clientsWithData: number
  clientsTotal: number
  /** o período pedido é maior que o histórico disponível */
  partial: boolean
}

const num = (v: unknown) => Number(v ?? 0) || 0

export function aggregate(perClient: Array<DailyRow[] | null>, clientsTotal: number, now: number, period: AdminPeriod | number): Overview {
  const p = period as AdminPeriod
  const cur = periodKeys(now, p) // 7/14/30 terminam em "ontem"; hoje = hoje; mês = dia 1 até hoje
  const days = cur.length
  // Período anterior equivalente: hoje -> ontem; mês -> mesmo trecho do mês passado; N dias -> os N dias antes.
  let prevKeys: string[]
  if (p === 'today') prevKeys = [dayKey(now - 86_400_000)]
  else if (p === 'month') {
    const t = new Date(now - 3 * 3600 * 1000)
    const prevMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))
    const lastOfPrev = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)).getUTCDate()
    prevKeys = Array.from({ length: Math.min(days, lastOfPrev) }, (_, i) => `${prevMonth.toISOString().slice(0, 8)}${String(i + 1).padStart(2, '0')}`)
  } else prevKeys = Array.from({ length: days }, (_, i) => dayKey(now - (2 * days - i) * 86_400_000))
  const curSet = new Set(cur), prevSet = new Set(prevKeys)

  const by = { spend: new Map<string, number>(), results: new Map<string, number>(), impressions: new Map<string, number>(), clicks: new Map<string, number>() }
  const prev: Totals = { spend: 0, impressions: 0, clicks: 0, results: 0 }
  let prevSeen = false, minDate = ''
  let withData = 0
  for (const rows of perClient) {
    if (!rows || !rows.length) continue
    withData++
    for (const r of rows) {
      const d = r.date_start; if (!d) continue
      if (!minDate || d < minDate) minDate = d
      if (curSet.has(d)) {
        by.spend.set(d, (by.spend.get(d) ?? 0) + num(r.spend))
        by.results.set(d, (by.results.get(d) ?? 0) + getResults(r.actions))
        by.impressions.set(d, (by.impressions.get(d) ?? 0) + num(r.impressions))
        by.clicks.set(d, (by.clicks.get(d) ?? 0) + num(r.clicks))
      } else if (prevSet.has(d)) {
        prevSeen = true
        prev.spend += num(r.spend); prev.results += getResults(r.actions); prev.impressions += num(r.impressions); prev.clicks += num(r.clicks)
      }
    }
  }
  const series = (m: Map<string, number>) => cur.map(k => m.get(k) ?? 0)
  const s = { spend: series(by.spend), results: series(by.results), impressions: series(by.impressions), clicks: series(by.clicks) }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  return {
    days,
    period: p,
    dates: cur.map(k => `${k.slice(8, 10)}/${k.slice(5, 7)}`),
    ...s,
    totals: { spend: sum(s.spend), results: sum(s.results), impressions: sum(s.impressions), clicks: sum(s.clicks) },
    // Só compara se os dados guardados cobrem o período anterior inteiro (a série tem ~30 dias): sem isso a variação sai absurda.
    prev: prevSeen && !!minDate && prevKeys[0] >= minDate ? prev : null,
    clientsWithData: withData,
    clientsTotal,
    partial: !!minDate && minDate > cur[0],
  }
}
