/**
 * Leitura do painel a partir do banco (meta_snapshots). Nenhuma função aqui chama a Meta.
 * Usa as mesmas funções de montagem do modo ao vivo (assembleMetrics), então a tela é idêntica.
 */
import { assembleMetrics, getLeads, getResults, listConversions, type ConversionItem, type DatePreset, type InsightRow, type MetricsResponse } from '../meta'
import type { MetaConfig } from './config'
import type { AccountState } from './limits'
import type { SnapshotStore } from './snapshots'

type Action = { action_type: string; value: string }
const isLead = (a: Action) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'

export interface Freshness {
  /** ms da atualização mais antiga entre os dados usados; null = nunca sincronizou */
  updatedAt: number | null
  stale: boolean
  /** texto pronto para o painel (pt-BR), ou null se está tudo em dia */
  note: string | null
  pending: boolean
}

const fmtAgo = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return m < 90 ? `${m} min` : m < 36 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dia(s)`
}

/** Diz há quanto tempo os dados foram atualizados e por quê, se estão velhos. Não busca nada por conta própria. */
export function describeFreshness(updatedAt: number | null, st: AccountState | null, cfg: MetaConfig, now: number, killUntil?: number | null): Freshness {
  if (updatedAt == null) return { updatedAt: null, stale: true, pending: true, note: 'Os dados desta conta ainda estão sendo sincronizados. Volte em alguns minutos.' }
  const age = now - updatedAt
  const stale = age > cfg.ttlInsightsMin * 60_000 * 3 * Math.max(1, st?.freqMultiplier ?? 1)
  let why = ''
  if (killUntil && killUntil > now) why = `as consultas à Meta estão em pausa por proteção e voltam sozinhas em cerca de ${fmtAgo(killUntil - now)}`
  else if (st?.suspended) why = 'a conta está suspensa por excesso de bloqueios da Meta (aguardando liberação)'
  else if (st?.paused) why = 'a atualização desta conta está pausada'
  else if (st?.blockedUntil && st.blockedUntil > now) why = `a Meta pediu para reduzir o ritmo; nova atualização em cerca de ${fmtAgo(st.blockedUntil - now)}`
  else if (stale) why = 'a próxima atualização automática ainda não rodou'
  if (!stale && !why) return { updatedAt, stale: false, pending: false, note: null }
  return { updatedAt, stale, pending: false, note: `Dados de ${fmtAgo(age)} atrás${why ? `: ${why}` : ''}.` }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const PRESET_DAYS: Record<string, number> = { today: 1, last_7d: 7, last_14d: 14, last_30d: 30 }

export function sliceDaily(rows: InsightRow[], preset: DatePreset, now: Date): InsightRow[] {
  if (preset === 'today') return []
  if (preset === 'this_month') {
    const first = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 8) + '01' // 1º dia do mês, hora do Brasil
    return rows.filter(r => String(r.date_start ?? '') >= first)
  }
  const days = PRESET_DAYS[preset] ?? 7
  const cutoff = ymd(new Date(now.getTime() - (days + 1) * 86_400_000))
  return rows.filter(r => String(r.date_start ?? '') > cutoff)
}

interface StructRow { id: string; name?: string; effective_status?: string; daily_budget?: string | number | null; lifetime_budget?: string | number | null; campaign_id?: string; adset_id?: string; creative?: Record<string, unknown> }

export async function readMetrics(snaps: SnapshotStore, clientId: string, adAccountId: string, preset: DatePreset, cfg: MetaConfig, st: AccountState | null, now = Date.now()): Promise<MetricsResponse & { freshness: Freshness }> {
  const [summary, daily, account, camps, campIns, customs] = await Promise.all([
    snaps.get<{ row: InsightRow | null; prev: InsightRow | null }>(clientId, 'summary', preset),
    snaps.get<InsightRow[]>(clientId, 'daily', 'last_30d'),
    snaps.get<{ name: string | null; currency: string }>(clientId, 'account', ''),
    snaps.get<StructRow[]>(clientId, 'structure', 'campaigns'),
    snaps.get<InsightRow[]>(clientId, 'campaign_insights', preset),
    snaps.get<Record<string, string>>(clientId, 'custom_conversions', ''),
  ])
  const fresh = describeFreshness(summary?.fetchedAt ?? null, st, cfg, now)
  const byCampaign = new Map((campIns?.payload ?? []).map(r => [String(r.campaign_id), r]))
  const resp = assembleMetrics(adAccountId, preset, {
    customNames: customs?.payload,
    account: { name: account?.payload.name ?? undefined, currency: account?.payload.currency },
    summaryRow: summary?.payload.row ?? undefined,
    prevRow: summary?.payload.prev ?? undefined,
    dailyRows: daily ? sliceDaily(daily.payload, preset, new Date(now)) : undefined,
    campaigns: (camps?.payload ?? []).map(c => ({ id: c.id, name: c.name ?? c.id, effective_status: c.effective_status, daily_budget: c.daily_budget, insight: byCampaign.get(c.id) })),
  }, new Date(summary?.fetchedAt ?? now).toISOString())
  return { ...resp, freshness: fresh, ...(fresh.pending ? { error: fresh.note ?? undefined } : {}) }
}

export interface AdPerfRow { ad_id: string; ad_name: string; adset_name: string; campaign_id: string; campaign_name: string; spend: number; impressions: number; clicks: number; meta_leads: number; results: number }

export const toPerfRows = (rows: Array<Record<string, unknown>>): AdPerfRow[] => rows.map(r => ({
  ad_id: String(r.ad_id ?? ''), ad_name: String(r.ad_name ?? ''), adset_name: String(r.adset_name ?? ''),
  campaign_id: String(r.campaign_id ?? ''), campaign_name: String(r.campaign_name ?? ''),
  spend: Number(r.spend ?? 0), impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0),
  meta_leads: getLeads(r.actions as Action[] | undefined),
  results: getResults(r.actions as Action[] | undefined),
}))

export async function readPerformance(snaps: SnapshotStore, clientId: string, preset: string, cfg: MetaConfig, st: AccountState | null, now = Date.now()) {
  const s = await snaps.get<Array<Record<string, unknown>>>(clientId, 'ad_insights', preset)
  return { rows: toPerfRows(s?.payload ?? []), freshness: describeFreshness(s?.fetchedAt ?? null, st, cfg, now) }
}

const cost = (cpas: Action[] | undefined) => cpas?.find(isLead)
export async function readAdsets(snaps: SnapshotStore, clientId: string, campaignId: string, preset: string) {
  const [ins, st] = await Promise.all([snaps.get<InsightRow[]>(clientId, 'adset_insights', preset), snaps.get<StructRow[]>(clientId, 'structure', 'adsets')])
  const byId = new Map((ins?.payload ?? []).map(r => [String(r.adset_id), r]))
  return (st?.payload ?? []).filter(a => String(a.campaign_id) === campaignId).map(a => {
    const i = byId.get(a.id) ?? {}
    const leads = (i.actions as Action[] | undefined)?.find(isLead)
    const cpl = cost(i.cost_per_action_type as Action[] | undefined)
    const spend = Number(i.spend ?? 0)
    return {
      id: a.id, name: a.name, status: a.effective_status, daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
      spend, impressions: Number(i.impressions ?? 0), clicks: Number(i.clicks ?? 0),
      ctr: Number(i.ctr ?? 0), frequency: Number(i.frequency ?? 0), leads: leads ? Number(leads.value) : 0, cpl: cpl ? Number(cpl.value) : null,
      results: getResults(i.actions as Action[] | undefined),
      cost_per_result: getResults(i.actions as Action[] | undefined) > 0 ? spend / getResults(i.actions as Action[] | undefined) : null,
      conversions: listConversions(i.actions as Action[] | undefined, spend),
    }
  })
}

export async function readAds(snaps: SnapshotStore, clientId: string, adsetId: string, preset: string) {
  const [ins, st] = await Promise.all([snaps.get<InsightRow[]>(clientId, 'ad_insights', preset), snaps.get<StructRow[]>(clientId, 'structure', 'ads')])
  const byId = new Map((ins?.payload ?? []).map(r => [String(r.ad_id), r]))
  return (st?.payload ?? []).filter(a => String(a.adset_id) === adsetId).map(a => {
    const i = byId.get(a.id) ?? {}
    const c = a.creative ?? {}
    const leads = (i.actions as Action[] | undefined)?.find(isLead)
    const cpl = cost(i.cost_per_action_type as Action[] | undefined)
    const spend = Number(i.spend ?? 0)
    return {
      id: a.id, name: a.name, status: a.effective_status,
      thumb: String(c.thumbnail_url ?? c.image_url ?? ''), creative_name: String(c.name ?? a.name ?? ''), object_type: String(c.object_type ?? ''),
      spend, impressions: Number(i.impressions ?? 0), clicks: Number(i.clicks ?? 0),
      leads: leads ? Number(leads.value) : 0, cpl: cpl ? Number(cpl.value) : null,
      results: getResults(i.actions as Action[] | undefined),
      cost_per_result: getResults(i.actions as Action[] | undefined) > 0 ? spend / getResults(i.actions as Action[] | undefined) : null,
      conversions: listConversions(i.actions as Action[] | undefined, spend),
    }
  })
}

/** Posse de campanha/conjunto/anúncio conferida pela cópia local (sem chamar a Meta). */
export async function ownsFromSnapshots(snaps: SnapshotStore, clientId: string, id: string): Promise<boolean> {
  for (const k of ['campaigns', 'adsets', 'ads']) {
    const s = await snaps.get<Array<{ id: string }>>(clientId, 'structure', k)
    if (s?.payload.some(x => x.id === id)) return true
  }
  return false
}

/** Prévia de anúncio a partir da miniatura guardada (sem chamar a Meta). */
export async function readAdPreview(snaps: SnapshotStore, clientId: string, adId: string): Promise<string> {
  const s = await snaps.get<StructRow[]>(clientId, 'structure', 'ads')
  const c = s?.payload.find(a => a.id === adId)?.creative
  const url = String(c?.image_url ?? c?.thumbnail_url ?? '')
  if (!/^https:\/\//.test(url)) return ''
  const esc = (x: string) => x.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
  return `<div style="display:flex;justify-content:center"><img src="${esc(url)}" alt="" style="max-width:100%;border-radius:8px"/></div>`
}
