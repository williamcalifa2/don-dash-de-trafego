import { insertLead, getSupabaseServer } from '../supabase'
import { clientIdForLead } from '../tenant'
import { parseLead } from '../metaLeads'
import { legacyGet } from './legacy'
import { metaConfig } from './config'
import { processEvents, type EventStore, type ProcessDeps, type ProcessReport } from './webhook'
import { SupabaseEventStore } from './webhookStore'
import { limits } from './instance'
import { ensureRuntime } from './runtime'

export const eventStore = new SupabaseEventStore()

type Detail = { field_data?: Array<{ name: string; values: string[] }>; created_time?: string; ad_name?: string; campaign_name?: string; adset_name?: string }

export function webhookDeps(store: EventStore): ProcessDeps {
  const cfg = metaConfig()
  // Antes do corte final o webhook usa o caminho antigo (não é barrado por DRY_RUN); depois, o pipeline.
  const origin = cfg.legacyLive ? 'legacy' as const : 'pipeline' as const
  return {
    store, now: Date.now, maxAttempts: cfg.jobMaxAttempts, retryBaseSec: cfg.jobRetryBaseSec, batch: 10,
    resolveClient: clientIdForLead,
    fetchLead: async (leadgenId, clientId) => {
      const r = await legacyGet<Detail>(`${leadgenId}?fields=field_data,created_time,ad_name,campaign_name,adset_name`, { clientId, origin, purpose: 'webhook:lead' })
      if (r.blocked || r.dryRun || r.error?.kind === 'rate_limit') return { ok: false, blocked: r.blocked ?? (r.dryRun ? 'dry_run' : 'rate_limit') }
      return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error?.message }
    },
    saveLead: async (clientId, leadgenId, adId, data) => {
      const p = parseLead(data as Detail)
      return insertLead(clientId, {
        meta_lead_id: leadgenId, date: p.date, nome: p.nome, telefone: p.telefone, email: p.email, status: 'Novo',
        ad_name: p.ad_name ?? (adId || null), campanha: p.campanha, conjunto: p.conjunto, notas: p.notas,
      }, getSupabaseServer())
    },
    onFailed: async (id) => { await limits().raise({ level: 'warning', kind: 'webhook_event_failed', message: `Evento de lead ${id} não pôde ser processado após várias tentativas.` }).catch(() => {}) },
  }
}

export async function runWebhookEvents(store: EventStore = eventStore): Promise<ProcessReport> {
  await ensureRuntime()
  return processEvents(webhookDeps(store))
}
