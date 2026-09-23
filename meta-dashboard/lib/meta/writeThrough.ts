import type { RawMetrics, DatePreset } from '../meta'
import type { SnapshotStore } from './snapshots'

/**
 * Quando o painel de um cliente busca na Meta ao vivo, guarda o resultado no banco também.
 * Assim os cards do admin (que leem do banco) mostram o mesmo número que o cliente acabou de ver, sem esperar o ciclo do sistema.
 * Só grava o que já foi lido; não faz nenhuma consulta nova à Meta.
 */
const DAILY_KEEP = 30

/** Junta dias novos na série diária guardada (o dia repetido é atualizado), sem passar de 30 dias. */
export async function mergeDaily(snaps: SnapshotStore, clientId: string, rows: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const old = await snaps.get<Array<Record<string, unknown>>>(clientId, 'daily', 'last_30d')
  const byDay = new Map((old?.payload ?? []).map(r => [String(r.date_start), r]))
  for (const r of rows) if (r.date_start) byDay.set(String(r.date_start), r)
  return [...byDay.values()].sort((a, b) => String(a.date_start).localeCompare(String(b.date_start))).slice(-DAILY_KEEP)
}

export async function writeThroughMetrics(snaps: SnapshotStore, clientId: string, preset: DatePreset, raw: RawMetrics, now = Date.now()): Promise<void> {
  if (!raw.summaryRow) return
  await snaps.put(clientId, 'summary', preset, { row: raw.summaryRow, prev: raw.prevRow ?? null }, now)
  // A série diária termina em ontem: os números de hoje ficam só em summary/today.
  if (preset !== 'today' && raw.dailyRows?.length) {
    await snaps.put(clientId, 'daily', 'last_30d', await mergeDaily(snaps, clientId, raw.dailyRows), now)
    if (preset === 'last_month' || preset === 'month_2' || preset === 'month_3') {
      await snaps.put(clientId, 'daily', preset, raw.dailyRows, now)
    }
  }
}
