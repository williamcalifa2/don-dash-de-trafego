/**
 * Série diária de cada cliente para as telas do admin (cards e visão geral).
 * Fonte 1: cópia no banco (meta_snapshots). Fonte 2 (só antes do corte automático): 1 consulta por cliente,
 * em cache de 15 min, com teto por requisição. Nada aqui é chamado pelo navegador direto na Meta.
 */
import type { DailyRow } from './adminResults'
import { legacyGet } from './meta/legacy'
import { stores } from './meta/stores'
import { liveOrigin } from './meta/mode'
import { StoreNotMigrated } from './meta/limits'

const liveCache = new Map<string, { at: number; rows: DailyRow[] | null }>()
const LIVE_TTL = 15 * 60_000

export const LIVE_FIELDS = 'spend,impressions,clicks,actions,action_values'

export async function dailyRowsFor(clientId: string, account: string | null, opts: { allowLive: boolean }, budget: { live: number }): Promise<{ rows: DailyRow[]; at: number; source: 'snapshot' | 'live' } | null> {
  if (!account) return null
  try {
    const snap = await stores.snaps.get<DailyRow[]>(clientId, 'daily', 'last_30d')
    if (snap) {
      // A série diária termina em ontem. Os números de hoje (e do mês corrente) vêm da cópia do período "hoje", se for de hoje.
      const today = await stores.snaps.get<{ row: DailyRow | null }>(clientId, 'summary', 'today')
      const key = (t: number) => new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10)
      const row = today?.payload.row && key(today.fetchedAt) === key(Date.now()) ? { ...today.payload.row, date_start: key(today.fetchedAt) } : null
      return { rows: row ? [...snap.payload.filter(r => r.date_start !== row.date_start), row] : snap.payload, at: Math.max(snap.fetchedAt, row && today ? today.fetchedAt : 0), source: 'snapshot' }
    }
  } catch (e) { if (!(e instanceof StoreNotMigrated)) throw e }
  if (!opts.allowLive) return null
  const hit = liveCache.get(clientId)
  if (hit && Date.now() - hit.at < LIVE_TTL) return hit.rows ? { rows: hit.rows, at: hit.at, source: 'live' } : null
  if (budget.live <= 0) return null
  budget.live--
  const r = await legacyGet<{ data?: DailyRow[] }>(`${account}/insights?fields=${LIVE_FIELDS}&date_preset=last_14d&time_increment=1&limit=100`, { accountId: account, clientId, purpose: 'admin:geral', origin: await liveOrigin() })
  const rows = r.ok ? (r.data.data ?? []) : null
  liveCache.set(clientId, { at: Date.now(), rows })
  return rows ? { rows, at: Date.now(), source: 'live' } : null
}
