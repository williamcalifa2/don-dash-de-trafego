/**
 * Cards do admin com o MESMO número que o painel do cliente mostra: o resumo de cada período (hoje, 7, 14, 30 dias, este mês),
 * que é o que o painel do cliente lê. A série diária fica só para o gráfico pequeno e como reserva.
 */
import { INSIGHT_FIELDS, type DatePreset } from './meta'
import { legacyGet } from './meta/legacy'
import { liveOrigin } from './meta/mode'
import type { SnapshotStore } from './meta/snapshots'
import { dayKey, metaTotals, type DailyRow, type MetaTotals, type ResultsSummary } from './adminResults'
import { ADMIN_PERIOD_KEYS, type AdminPeriod } from './periods'
import { detectKind } from './resultKind'

export const PRESET_OF: Record<AdminPeriod, DatePreset> = { today: 'today', 7: 'last_7d', 14: 'last_14d', 30: 'last_30d', month: 'this_month' }
export const SUMMARY_PRESETS = Object.values(PRESET_OF)

export interface SummaryEntry { row: DailyRow | null; at: number }
export type SummaryMap = Map<string, Partial<Record<DatePreset, SummaryEntry>>>

/** Totais de uma linha de resumo da Meta (a mesma conta do resto do admin). */
export function totalsOfRow(row: DailyRow | null | undefined, now: number): MetaTotals {
  return metaTotals(row ? [{ ...row, date_start: dayKey(now) }] : [], now, 'today')
}

export async function loadSummaryMap(snaps: SnapshotStore): Promise<SummaryMap> {
  const map: SummaryMap = new Map()
  const rows = await snaps.listKind<{ row: DailyRow | null }>('summary', SUMMARY_PRESETS)
  for (const r of rows) {
    const cur = map.get(r.clientId) ?? {}
    cur[r.key as DatePreset] = { row: r.payload?.row ?? null, at: r.fetchedAt }
    map.set(r.clientId, cur)
  }
  return map
}

/** Busca o resumo de UM período na Meta (o painel de cada cliente faz a mesma consulta) e guarda. Cache de 4 min no caminho central. */
export async function liveSummary(snaps: SnapshotStore, clientId: string, account: string, preset: DatePreset, now: number): Promise<SummaryEntry | null> {
  const r = await legacyGet<{ data?: DailyRow[] }>(`${account}/insights?fields=${INSIGHT_FIELDS}&date_preset=${preset}`, { accountId: account, clientId, purpose: 'admin:resumo', origin: await liveOrigin() })
  if (!r.ok) return null
  const row = r.data.data?.[0] ?? null
  await snaps.put(clientId, 'summary', preset, { row, prev: null }, now)
  return { row, at: now }
}

/** Troca os totais de cada período pelos do resumo guardado (quando existe e não está velho demais; o período escolhido sempre vale). */
export function applySummaries(base: ResultsSummary | null, sums: Partial<Record<DatePreset, SummaryEntry>> | undefined, now: number, selected: AdminPeriod, maxAgeMs = 6 * 3_600_000): ResultsSummary | null {
  if (!sums || !Object.keys(sums).length) return base
  const periods = { ...(base?.periods ?? {}) } as Record<AdminPeriod, MetaTotals>
  for (const p of ADMIN_PERIOD_KEYS) {
    const e = sums[PRESET_OF[p]]
    if (e && (p === selected || now - e.at < maxAgeMs)) periods[p] = totalsOfRow(e.row, now)
  }
  for (const p of ADMIN_PERIOD_KEYS) periods[p] ??= totalsOfRow(null, now)
  // O tipo de resultado vem do período mais longo que tem dados (mais estável que "hoje").
  const ref = [periods[30], periods[14], periods[7], periods.month, periods.today].find(t => t && (t.formLeads + t.siteLeads + t.conversations + t.custom) > 0) ?? periods[selected]
  const kind = base?.kind && base.kind !== 'form' ? base.kind : detectKind({ form_leads: ref.formLeads, site_leads: ref.siteLeads, conversations: ref.conversations, custom_conversions: ref.custom })
  return { kind, daily: base?.daily ?? Array(14).fill(0), periods, spanDays: base?.spanDays ?? 0 }
}
