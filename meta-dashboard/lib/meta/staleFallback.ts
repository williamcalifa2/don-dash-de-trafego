import type { MetricsResponse, DatePreset } from '../meta'
import { metaConfig } from './config'
import { describeFreshness, readMetrics, readPerformance, type AdPerfRow } from './read'
import { stores } from './stores'
import { StoreNotMigrated, type AccountState } from './limits'

/**
 * Quando a consulta ao vivo falha (pausa por proteção, limite, Meta fora do ar), o painel do cliente NÃO cai:
 * mostra o último dado bom, com um aviso discreto de "dados de X atrás". Vem do banco (snapshots) ou da última resposta boa desta instância.
 */
const MAX_AGE_MS = 24 * 3_600_000
const good = new Map<string, { at: number; value: unknown }>()

export const remember = (key: string, value: unknown, now = Date.now()) => { good.set(key, { at: now, value }); if (good.size > 300) good.delete(good.keys().next().value as string) }
const recall = <T,>(key: string, now: number): { at: number; value: T } | null => {
  const g = good.get(key)
  return g && now - g.at <= MAX_AGE_MS ? { at: g.at, value: g.value as T } : null
}
export const __resetStaleFallback = () => good.clear()

/** Mensagem para quando não há nem dado antigo para mostrar. */
export function friendlyLiveError(message: string): string {
  return /kill_switch|cooldown|blocked|rate_limit|reduzir o ritmo/i.test(message)
    ? 'A atualização com a Meta está em pausa por proteção e volta sozinha. Tente de novo em alguns minutos.'
    : message
}

async function context(clientId: string) {
  const [st, kill] = await Promise.all([
    stores.limit.getState(clientId).catch(() => null) as Promise<AccountState | null>,
    stores.limit.getSetting<{ until: number }>('kill').catch(() => null),
  ])
  return { st, killUntil: kill?.until ?? null }
}

export async function metricsFallback(clientId: string, accountId: string, preset: DatePreset, now = Date.now()): Promise<(MetricsResponse & { freshness: ReturnType<typeof describeFreshness> }) | null> {
  const cfg = metaConfig()
  const { st, killUntil } = await context(clientId)
  let fromDb: Awaited<ReturnType<typeof readMetrics>> | null = null
  try {
    const r = await readMetrics(stores.snaps, clientId, accountId, preset, cfg, st, now)
    if (!r.freshness.pending) fromDb = r
  } catch (e) { if (!(e instanceof StoreNotMigrated)) throw e }
  const mem = recall<MetricsResponse>(`m:${clientId}:${preset}`, now)
  const dbAt = fromDb?.freshness.updatedAt ?? 0
  if (mem && mem.at > dbAt) return { ...mem.value, generated_at: new Date(mem.at).toISOString(), freshness: describeFreshness(mem.at, st, cfg, now, killUntil) }
  return fromDb ? { ...fromDb, freshness: describeFreshness(dbAt, st, cfg, now, killUntil) } : null
}

export async function performanceFallback(clientId: string, preset: string, now = Date.now()): Promise<{ rows: AdPerfRow[]; freshness: ReturnType<typeof describeFreshness> } | null> {
  const cfg = metaConfig()
  const { st, killUntil } = await context(clientId)
  let fromDb: Awaited<ReturnType<typeof readPerformance>> | null = null
  try {
    const r = await readPerformance(stores.snaps, clientId, preset, cfg, st, now)
    if (!r.freshness.pending) fromDb = r
  } catch (e) { if (!(e instanceof StoreNotMigrated)) throw e }
  const mem = recall<AdPerfRow[]>(`p:${clientId}:${preset}`, now)
  const dbAt = fromDb?.freshness.updatedAt ?? 0
  if (mem && mem.at > dbAt) return { rows: mem.value, freshness: describeFreshness(mem.at, st, cfg, now, killUntil) }
  return fromDb ? { rows: fromDb.rows, freshness: describeFreshness(dbAt, st, cfg, now, killUntil) } : null
}
