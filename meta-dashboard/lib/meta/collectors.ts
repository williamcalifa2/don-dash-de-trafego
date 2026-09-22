/**
 * Coletores incrementais. Um job = uma conta + um tipo. Nenhum laço por campanha/conjunto/anúncio:
 * tudo vem de consultas no nível da CONTA (insights com level=...), só com os campos necessários, paginadas.
 * Os dados vão para meta_snapshots; o painel lê de lá.
 */
import type { MetaConfig } from './config'
import type { MetaCallContext, MetaResult } from './client'
import type { LimitStore } from './limits'
import type { SnapshotStore } from './snapshots'
import type { JobKind } from './queue'
import { inBusinessHours } from './time'
import { INSIGHT_FIELDS, prevTimeRange, type DatePreset } from '../meta'

export interface Account {
  clientId: string
  slug: string
  adAccountId: string
  pageId?: string | null
}

export type CollectOutcome =
  | { status: 'done'; calls: number }
  | { status: 'dry'; calls: number }
  | { status: 'deferred'; reason: string; runAfter?: number; calls: number }
  | { status: 'failed'; error: string; calls: number }

export interface CollectDeps {
  cfg: MetaConfig
  now: () => number
  get: <T = Record<string, unknown>>(path: string, ctx: Pick<MetaCallContext, 'accountId' | 'clientId' | 'purpose'>) => Promise<MetaResult<T>>
  snaps: SnapshotStore
  state: LimitStore
  /** importa leads (reaproveita a lógica de leitura de formulários); undefined = coletor de leads indisponível */
  syncLeads?: (acc: Account, opts: { sinceEpochSec: number }) => Promise<{ imported: number; error?: string; blocked?: string; truncated?: boolean; noPage?: boolean }>
}

export const HOT_PRESETS: DatePreset[] = ['today', 'last_7d']
// "Este mês" fica entre os períodos frios (4x o prazo dos quentes) para não pesar na cota da Meta; admin e equipe atualizam na hora pelo botão.
export const COLD_PRESETS: DatePreset[] = ['last_14d', 'last_30d', 'this_month']

const MIN = 60_000
const LEVEL_FIELDS = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name'
const AD_FIELDS = `${LEVEL_FIELDS},spend,impressions,clicks,ctr,frequency,actions,cost_per_action_type`
const ADSET_FIELDS = 'campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,ctr,frequency,actions,cost_per_action_type'
const CAMPAIGN_FIELDS = `campaign_id,campaign_name,${INSIGHT_FIELDS}`

class Stop extends Error {
  constructor(public outcome: CollectOutcome) { super('stop') }
}

/** Traduz uma resposta que não deu certo em "adiar", "falha" ou pausa, sem nunca insistir. */
function interpret(r: MetaResult<unknown>, calls: number, now: number, cfg: MetaConfig): CollectOutcome {
  if (r.blocked?.startsWith('policy:')) return { status: 'failed', error: `pedido barrado pela allowlist (${r.blocked})`, calls } // bug de código: não adianta esperar
  if (r.blocked) return { status: 'deferred', reason: r.blocked, calls }
  if (r.error?.kind === 'rate_limit') return { status: 'deferred', reason: 'rate_limit', runAfter: now + cfg.blockDefaultWaitSec * 1000, calls }
  if (r.error?.kind === 'token') return { status: 'failed', error: 'token da Meta inválido', calls }
  return { status: 'failed', error: r.error?.message ?? `erro ${r.status}`, calls }
}

class Runner {
  calls = 0
  dry = false
  pagesLeft: number
  constructor(private d: CollectDeps, private acc: Account, private purpose: string) { this.pagesLeft = d.cfg.maxPagesPerJob }

  async one<T>(path: string): Promise<T> {
    this.calls++
    const r = await this.d.get<T>(path, { accountId: this.acc.adAccountId, clientId: this.acc.clientId, purpose: this.purpose })
    if (r.dryRun) { this.dry = true; return {} as T }
    if (!r.ok) throw new Stop(interpret(r, this.calls, this.d.now(), this.d.cfg))
    return r.data
  }

  /**
   * Percorre as páginas com teto por job. Se o teto acabar no meio, guarda linhas parciais + cursor e o job continua no próximo ciclo.
   * Retorna as linhas completas, ou lança Stop('deferred') com o progresso salvo.
   */
  async paged<T>(path: string, resumeKey: string): Promise<T[]> {
    const { snaps, state } = this.d
    const partial = await snaps.get<T[]>(this.acc.clientId, 'partial', resumeKey)
    const st = await state.getState(this.acc.clientId)
    const rows: T[] = partial ? [...partial.payload] : []
    let after: string | undefined = partial ? st.cursors[resumeKey] : undefined
    for (;;) {
      if (this.pagesLeft <= 0) {
        await snaps.put(this.acc.clientId, 'partial', resumeKey, rows, this.d.now())
        await state.patchState(this.acc.clientId, { cursors: { ...st.cursors, ...(after ? { [resumeKey]: after } : {}) } })
        throw new Stop({ status: 'deferred', reason: 'page_limit', runAfter: this.d.now(), calls: this.calls })
      }
      this.pagesLeft--
      const data = await this.one<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${path}${after ? `&after=${encodeURIComponent(after)}` : ''}`)
      rows.push(...(data.data ?? []))
      after = data.paging?.next ? data.paging.cursors?.after : undefined
      if (!after) break
    }
    if (partial) {
      await snaps.delete(this.acc.clientId, 'partial', resumeKey)
      const fresh = await state.getState(this.acc.clientId)
      const { [resumeKey]: _gone, ...rest } = fresh.cursors
      void _gone
      await state.patchState(this.acc.clientId, { cursors: rest })
    }
    return rows
  }
}

/** Períodos com recorte de público (hoje fica de fora: pouco dado e muda a toda hora). */
export const AUDIENCE_PRESETS: DatePreset[] = ['last_7d', 'last_14d', 'last_30d']
const AUD_FIELDS = 'spend,impressions,reach,clicks,actions'
const AUD_HOUR_FIELDS = 'spend,impressions,reach,clicks'
const AUD_CALLS: Array<{ key: 'platform' | 'device' | 'hour' | 'agegender' | 'region'; breakdowns: string; fields: string }> = [
  { key: 'platform', breakdowns: 'publisher_platform', fields: AUD_FIELDS },
  { key: 'device', breakdowns: 'device_platform', fields: AUD_FIELDS },
  { key: 'hour', breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', fields: AUD_HOUR_FIELDS },
  { key: 'agegender', breakdowns: 'age,gender', fields: AUD_FIELDS },
  { key: 'region', breakdowns: 'region', fields: AUD_FIELDS },
]

const presetDue = (last: number | undefined, ttlMs: number, now: number) => last === undefined || now - last >= ttlMs

async function markSynced(d: CollectDeps, acc: Account, keys: string[]) {
  const st = await d.state.getState(acc.clientId)
  const at = d.now()
  await d.state.patchState(acc.clientId, { lastSynced: { ...st.lastSynced, ...Object.fromEntries(keys.map(k => [k, at])) }, lastError: null })
}

/** `force`: atualização manual do admin/equipe. Ignora o prazo de validade só dos períodos listados (e da série diária), sem tocar em público nem nos demais períodos. */
export async function collectInsights(d: CollectDeps, acc: Account, opts: { force?: DatePreset[] } = {}): Promise<CollectOutcome> {
  const { cfg, snaps } = d
  const now = d.now()
  const run = new Runner(d, acc, 'sync:insights')
  const st = await d.state.getState(acc.clientId)
  const prefix = cfg.dryRun ? 'dry_' : ''
  const ttl = cfg.ttlInsightsMin * MIN * Math.max(1, st.freqMultiplier)
  const due = opts.force ? [...opts.force] : [
    ...HOT_PRESETS.filter(p => presetDue(st.lastSynced[`${prefix}insights:${p}`], ttl, now)),
    ...COLD_PRESETS.filter(p => presetDue(st.lastSynced[`${prefix}insights:${p}`], ttl * cfg.coldPresetTtlMult, now)),
  ]
  const dailyDue = opts.force ? true : presetDue(st.lastSynced[`${prefix}insights:daily`], ttl, now)
  const audTtl = cfg.ttlAudienceMin * MIN * Math.max(1, st.freqMultiplier)
  const audDue = opts.force ? [] : AUDIENCE_PRESETS.filter(p => presetDue(st.lastSynced[`${prefix}audience:${p}`], audTtl, now))
  if (!due.length && !dailyDue && !audDue.length) return { status: 'done', calls: 0 }

  const a = acc.adAccountId
  const synced: string[] = []
  try {
    for (const p of due) {
      // Um período é gravado inteiro ou não é gravado: só começa um novo se ainda cabe no teto de páginas do job.
      if (run.pagesLeft < 3) throw new Stop({ status: 'deferred', reason: 'page_limit', runAfter: d.now(), calls: run.calls })
      const summary = await run.one<{ data?: Array<Record<string, unknown>> }>(`${a}/insights?fields=${INSIGHT_FIELDS}&date_preset=${p}`)
      const prev = await run.one<{ data?: Array<Record<string, unknown>> }>(`${a}/insights?fields=${INSIGHT_FIELDS}&time_range=${encodeURIComponent(prevTimeRange(p))}`)
      const campaigns = await run.paged(`${a}/insights?level=campaign&fields=${CAMPAIGN_FIELDS}&date_preset=${p}&limit=${cfg.pageSize}`, `campaigns:${p}`)
      const adsets = await run.paged(`${a}/insights?level=adset&fields=${ADSET_FIELDS}&date_preset=${p}&limit=${cfg.pageSize}`, `adsets:${p}`)
      const ads = await run.paged(`${a}/insights?level=ad&fields=${AD_FIELDS}&date_preset=${p}&limit=${cfg.pageSize}`, `ads:${p}`)
      if (!run.dry) {
        await snaps.put(acc.clientId, 'summary', p, { row: summary.data?.[0] ?? null, prev: prev.data?.[0] ?? null }, d.now())
        await snaps.put(acc.clientId, 'campaign_insights', p, campaigns, d.now())
        await snaps.put(acc.clientId, 'adset_insights', p, adsets, d.now())
        await snaps.put(acc.clientId, 'ad_insights', p, ads, d.now())
      }
      synced.push(`${prefix}insights:${p}`)
    }
    if (dailyDue) {
      if (run.pagesLeft < 1) throw new Stop({ status: 'deferred', reason: 'page_limit', runAfter: d.now(), calls: run.calls })
      // Incremental: nos ciclos normais só os últimos dias (mesclados na série guardada). A série completa (30 dias)
      // é refeita 1x por dia, de preferência fora do horário comercial; se passar de 36 h sem refazer, refaz em qualquer horário.
      const old = await snaps.get<Array<Record<string, unknown>>>(acc.clientId, 'daily', 'last_30d')
      const lastFull = st.lastSynced[`${prefix}insights:daily_full`]
      const ageFull = lastFull === undefined ? Infinity : now - lastFull
      const full = !old || ageFull >= 36 * 60 * MIN || (ageFull >= 24 * 60 * MIN && !inBusinessHours(cfg, now))
      const daily = await run.paged<Record<string, unknown>>(
        `${a}/insights?fields=${INSIGHT_FIELDS}&date_preset=${full ? 'last_30d' : (cfg.insightsWindowDays <= 3 ? 'last_3d' : 'last_7d')}&time_increment=1&limit=${cfg.pageSize}`, full ? 'daily:last_30d' : 'daily:recent')
      if (!run.dry) {
        const byDay = new Map((full || !old ? [] : old.payload).map(r => [String(r.date_start), r]))
        for (const r of daily) byDay.set(String(r.date_start), r)
        const merged = [...byDay.values()].sort((x, y) => String(x.date_start).localeCompare(String(y.date_start))).slice(-30)
        await snaps.put(acc.clientId, 'daily', 'last_30d', merged, d.now())
      }
      synced.push(`${prefix}insights:daily`)
      if (full) synced.push(`${prefix}insights:daily_full`)
    }
  } catch (e) {
    // O que já foi gravado por inteiro conta como sincronizado; o resto continua no próximo ciclo.
    if (e instanceof Stop) { if (synced.length) await markSynced(d, acc, synced); return e.outcome }
    throw e
  }
  if (synced.length) await markSynced(d, acc, synced)

  // Público (plataforma, dispositivo, hora, idade/gênero, região): 5 consultas por período, no nível da conta.
  // Falha aqui não desfaz o que já foi gravado acima; limite/bloqueio adia e o resto continua no próximo ciclo.
  const audSynced: string[] = []
  try {
    for (const p of audDue) {
      const raw: Record<string, unknown[]> = {}
      for (const c of AUD_CALLS) {
        const data = await run.one<{ data?: unknown[] }>(`${a}/insights?fields=${c.fields}&breakdowns=${c.breakdowns}&date_preset=${p}&limit=${cfg.pageSize}`)
        raw[c.key] = data.data ?? []
      }
      if (!run.dry) await snaps.put(acc.clientId, 'audience', p, raw, d.now())
      audSynced.push(`${prefix}audience:${p}`)
    }
  } catch (e) {
    if (e instanceof Stop) { if (audSynced.length) await markSynced(d, acc, audSynced); return e.outcome }
    throw e
  }
  if (audSynced.length) await markSynced(d, acc, audSynced)
  return { status: run.dry ? 'dry' : 'done', calls: run.calls }
}

export async function collectStructure(d: CollectDeps, acc: Account): Promise<CollectOutcome> {
  const { cfg, snaps } = d
  const run = new Runner(d, acc, 'sync:structure')
  const st = await d.state.getState(acc.clientId)
  const prefix = cfg.dryRun ? 'dry_' : ''
  const a = acc.adAccountId
  const now = d.now()

  // Incremental por updated_time; a cada 24 h refaz completo (pega apagados e corrige deriva).
  const lastFull = st.lastSynced[`${prefix}structure_full`]
  const lastAny = st.lastSynced[`${prefix}structure`]
  const incremental = !!lastAny && !!lastFull && now - lastFull < 24 * 60 * MIN
  const since = incremental ? Math.floor((lastAny! - 5 * MIN) / 1000) : 0
  const filter = incremental ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: 'updated_time', operator: 'GREATER_THAN', value: since }]))}` : ''
  const merge = <T extends { id: string }>(old: T[] | undefined, fresh: T[]) => {
    if (!incremental || !old) return fresh
    const map = new Map(old.map(x => [x.id, x])); for (const x of fresh) map.set(x.id, x)
    return [...map.values()]
  }

  try {
    const account = await run.one<{ name?: string; currency?: string; account_status?: number }>(`${a}?fields=name,currency,account_status`)
    const campaigns = await run.paged<{ id: string }>(`${a}/campaigns?fields=id,name,effective_status,daily_budget,updated_time&limit=${cfg.pageSize}${filter}`, 'structure:campaigns')
    const adsets = await run.paged<{ id: string }>(`${a}/adsets?fields=id,name,effective_status,daily_budget,lifetime_budget,campaign_id,updated_time&limit=${cfg.pageSize}${filter}`, 'structure:adsets')
    const customs = await run.one<{ data?: Array<{ id: string; name?: string }> }>(`${a}/customconversions?fields=id,name&limit=${cfg.pageSize}`)
    const ads = await run.paged<{ id: string; effective_status?: string }>(`${a}/ads?fields=id,name,effective_status,adset_id,campaign_id,updated_time,creative{id,name,thumbnail_url,image_url,object_type}&limit=${cfg.pageSize}${filter}`, 'structure:ads')
    if (run.dry) return { status: 'dry', calls: run.calls }

    const [oc, oa, od] = await Promise.all([
      snaps.get<Array<{ id: string }>>(acc.clientId, 'structure', 'campaigns'),
      snaps.get<Array<{ id: string }>>(acc.clientId, 'structure', 'adsets'),
      snaps.get<Array<{ id: string; effective_status?: string }>>(acc.clientId, 'structure', 'ads'),
    ])
    const mc = merge(oc?.payload, campaigns), ma = merge(oa?.payload, adsets), md = merge(od?.payload, ads)
    await snaps.put(acc.clientId, 'custom_conversions', '', Object.fromEntries((customs.data ?? []).map(c => [c.id, c.name ?? c.id])), d.now())
    await snaps.put(acc.clientId, 'account', '', { name: account.name ?? null, currency: account.currency ?? 'BRL', status: account.account_status ?? null }, d.now())
    await snaps.put(acc.clientId, 'structure', 'campaigns', mc, d.now())
    await snaps.put(acc.clientId, 'structure', 'adsets', ma, d.now())
    await snaps.put(acc.clientId, 'structure', 'ads', md, d.now())
    const fresh = await d.state.getState(acc.clientId)
    await d.state.patchState(acc.clientId, { activeAds: md.filter(x => x.effective_status === 'ACTIVE').length, lastSynced: { ...fresh.lastSynced, [`${prefix}structure`]: d.now(), ...(incremental ? {} : { [`${prefix}structure_full`]: d.now() }) }, lastError: null })
    return { status: 'done', calls: run.calls }
  } catch (e) {
    if (e instanceof Stop) return e.outcome
    throw e
  }
}

export async function collectLeads(d: CollectDeps, acc: Account): Promise<CollectOutcome> {
  const { cfg } = d
  const st = await d.state.getState(acc.clientId)
  const now = d.now()
  const prefix = cfg.dryRun ? 'dry_' : ''
  if (cfg.dryRun) {
    // Previsão: token da página + formulários + uma página de leads por formulário (estimado em 1).
    const calls = 3
    await d.state.insertUsage({ clientId: acc.clientId, accountId: acc.adAccountId, endpoint: 'plan:leads', calls, outcome: 'dry_run', dryRun: true, origin: 'pipeline', at: now })
    await markSynced(d, acc, [`${prefix}leads`])
    return { status: 'dry', calls }
  }
  if (!d.syncLeads) return { status: 'failed', error: 'coletor de leads não configurado', calls: 0 }
  // Cliente sem leads de formulário (campanhas de site ou de conversas): sem página/formulário não há o que coletar.
  // Não é falha: reconfere só 1x por dia, sem gastar chamadas, e nunca vai para a dead-letter.
  const noPageAt = st.lastSynced.leads_nopage
  if (noPageAt !== undefined && now - noPageAt < 24 * 60 * MIN) {
    await markSynced(d, acc, ['leads'])
    return { status: 'done', calls: 0 }
  }
  // Só o que é novo desde a última coleta (com uma pequena sobreposição; a inserção é idempotente por meta_lead_id).
  const last = st.lastSynced.leads
  const sinceEpochSec = Math.floor(((last ?? now - cfg.insightsWindowDays * 86_400_000) - cfg.leadsOverlapMin * MIN) / 1000)
  const r = await d.syncLeads(acc, { sinceEpochSec })
  if (r.blocked) return { status: 'deferred', reason: r.blocked, calls: 0 }
  if (r.noPage) { await markSynced(d, acc, ['leads', 'leads_nopage']); return { status: 'done', calls: 0 } }
  if (r.error) return { status: 'failed', error: r.error, calls: 0 }
  // Leitura cortada pelo teto de páginas: o relógio NÃO avança (nada de perder lead em silêncio); vira falha visível.
  if (r.truncated) return { status: 'failed', error: 'leads: teto de páginas atingido antes de ler tudo', calls: 0 }
  await markSynced(d, acc, ['leads'])
  if (st.lastSynced.leads_nopage !== undefined) { const { leads_nopage: _x, ...rest } = (await d.state.getState(acc.clientId)).lastSynced; void _x; await d.state.patchState(acc.clientId, { lastSynced: rest }) }
  return { status: 'done', calls: 0 }
}

export const COLLECTORS: Record<JobKind, (d: CollectDeps, acc: Account) => Promise<CollectOutcome>> = {
  insights: collectInsights,
  structure: collectStructure,
  leads: collectLeads,
}
