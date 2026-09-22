import type { MetaConfig } from './config'
import type { LimitStore } from './limits'
import type { JobStore, JobKind } from './queue'
import { isDue } from './orchestrator'

export interface RefreshDeps { store: LimitStore; jobs: JobStore; config: () => MetaConfig; now?: () => number }
export type RefreshResult = { queued: boolean; reason?: 'cooldown' | 'disabled' | 'blocked' | 'already_queued' | 'not_available' | 'fresh'; retryInSec?: number }

/** Pedido manual de atualização: respeita o resfriamento por conta e nunca passa por cima de bloqueio/pausa. */
export async function requestRefresh(d: RefreshDeps, clientId: string): Promise<RefreshResult> {
  const cfg = d.config(); const now = (d.now ?? Date.now)()
  const st = await d.store.getState(clientId)
  if (cfg.dryRun || st.paused || st.suspended) return { queued: false, reason: 'disabled' }
  if (st.blockedUntil && st.blockedUntil > now) return { queued: false, reason: 'blocked', retryInSec: Math.ceil((st.blockedUntil - now) / 1000) }

  const key = `refresh:${clientId}`
  const last = await d.store.getSetting<{ at: number }>(key)
  const wait = last ? last.at + cfg.manualRefreshCooldownSec * 1000 - now : 0
  if (wait > 0) return { queued: false, reason: 'cooldown', retryInSec: Math.ceil(wait / 1000) }

  await d.store.setSetting(key, { at: now })
  // Só antecipa o que já venceu o TTL (o TTL continua mandando); sem escalonamento, mas o worker segue todos os limites.
  const due = (['insights', 'leads'] as JobKind[]).filter(k => isDue(cfg, k, st, now))
  if (!due.length) return { queued: false, reason: 'fresh' }
  const created: string[] = []
  for (const k of due) created.push(await d.jobs.enqueue(clientId, k, now, now))
  return created.includes('created') ? { queued: true } : { queued: false, reason: 'already_queued' }
}
