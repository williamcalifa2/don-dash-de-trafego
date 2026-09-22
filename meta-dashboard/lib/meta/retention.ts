/**
 * Higiene de dados (LGPD). Uso da API e alertas envelhecem sozinhos; leads (dado pessoal) só são apagados
 * se a retenção for configurada de propósito (META_LEADS_RETENTION_DAYS > 0). Padrão: 0 = não apaga nada.
 */
import type { MetaConfig } from './config'
import type { LimitStore } from './limits'
import type { JobStore } from './queue'

const DAY = 86_400_000

export interface RetentionDeps {
  cfg: MetaConfig
  now: () => number
  state: LimitStore
  jobs: JobStore
  /** Apaga leads mais antigos que a data (só é chamado se a retenção estiver ligada). Retorna quantos. */
  purgeLeads?: (beforeMs: number) => Promise<number>
}

/** No máximo 1 execução por dia. */
export async function runRetention(d: RetentionDeps): Promise<{ ran: boolean; leadsPurged: number }> {
  const now = d.now()
  const last = await d.state.getSetting<{ at: number }>('retention_last')
  if (last && now - last.at < DAY) return { ran: false, leadsPurged: 0 }
  await d.state.setSetting('retention_last', { at: now })

  await d.state.purgeOld(now - d.cfg.usageRetentionDays * DAY, now - 90 * DAY)
  await d.jobs.purge(now - 7 * DAY)

  let leadsPurged = 0
  if (d.cfg.leadsRetentionDays > 0 && d.purgeLeads) leadsPurged = await d.purgeLeads(now - d.cfg.leadsRetentionDays * DAY)
  return { ran: true, leadsPurged }
}
