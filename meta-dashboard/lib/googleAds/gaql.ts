/** Google Ads: períodos, consultas GAQL e leitura das linhas devolvidas. Só funções puras. */

import { extraRange, type ExtraPreset } from '../periodsMeta'

export type GooglePreset = 'today' | 'last_7d' | 'last_14d' | 'last_30d' | 'this_month' | 'last_month' | 'month_2' | 'month_3' | ExtraPreset
export const GOOGLE_PRESETS: readonly GooglePreset[] = ['today', 'yesterday', 'today_yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'this_week', 'last_week', 'this_month', 'last_month', 'month_2', 'month_3']

export interface Range { since: string; until: string }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

/** Intervalo (datas de Brasília) de cada período do painel. `now` só existe para teste. */
export function rangeFor(preset: GooglePreset, now = new Date()): Range {
  const extra = extraRange(preset, now.getTime())
  if (extra) return extra
  const br = new Date(now.getTime() - 3 * 3_600_000)
  const today = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()))
  const month = (back: number) => {
    const first = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() - back, 1))
    const last = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() - back + 1, 0))
    return { since: iso(first), until: iso(last) }
  }
  switch (preset) {
    case 'today': return { since: iso(today), until: iso(today) }
    case 'last_7d': return { since: iso(addDays(today, -6)), until: iso(today) }
    case 'last_14d': return { since: iso(addDays(today, -13)), until: iso(today) }
    case 'last_30d': return { since: iso(addDays(today, -29)), until: iso(today) }
    case 'this_month': return { since: iso(new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1))), until: iso(today) }
    case 'last_month': return month(1)
    case 'month_2': return month(2)
    case 'month_3': return month(3)
    default: return { since: iso(today), until: iso(today) } // período extra já tratado acima
  }
}

/** Período anterior de mesmo tamanho, para o comparativo. */
export function previousRange(r: Range): Range {
  const a = new Date(`${r.since}T00:00:00Z`)
  const b = new Date(`${r.until}T00:00:00Z`)
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
  return { since: iso(addDays(a, -days)), until: iso(addDays(a, -1)) }
}

const METRICS = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value'

export const summaryQuery = (r: Range) => `SELECT ${METRICS} FROM customer WHERE segments.date BETWEEN '${r.since}' AND '${r.until}'`
export const dailyQuery = (r: Range) => `SELECT segments.date, ${METRICS} FROM customer WHERE segments.date BETWEEN '${r.since}' AND '${r.until}' ORDER BY segments.date`
export const campaignsQuery = (r: Range) =>
  `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, ${METRICS} FROM campaign WHERE segments.date BETWEEN '${r.since}' AND '${r.until}' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`
export const currencyQuery = () => 'SELECT customer.currency_code, customer.descriptive_name FROM customer LIMIT 1'
export const searchTermsQuery = (r: Range) =>
  `SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM search_term_view WHERE segments.date BETWEEN '${r.since}' AND '${r.until}' ORDER BY metrics.clicks DESC LIMIT 50`
export const geographicQuery = (r: Range) =>
  `SELECT geographic_view.country_criterion_id, segments.geo_target_region, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM geographic_view WHERE segments.date BETWEEN '${r.since}' AND '${r.until}' ORDER BY metrics.cost_micros DESC LIMIT 30`

/** Linha da API (REST devolve camelCase; números grandes chegam como texto). */
export interface GRow {
  segments?: { date?: string; geoTargetRegion?: string }
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string }
  campaignBudget?: { amountMicros?: string | number }
  customer?: { currencyCode?: string; descriptiveName?: string }
  searchTermView?: { searchTerm?: string }
  geographicView?: { countryCriterionId?: string | number }
  metrics?: { costMicros?: string | number; impressions?: string | number; clicks?: string | number; conversions?: number | string; conversionsValue?: number | string; ctr?: number | string }
}

export interface GSummary { spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number; ctr: number; cpc: number; cpa: number; roas: number }
export interface GDay extends Pick<GSummary, 'spend' | 'clicks' | 'conversions' | 'impressions'> { date: string }
export interface GCampaign extends GSummary { id: string; name: string; status: 'ENABLED' | 'PAUSED' | 'REMOVED' | string; channel: string; dailyBudget: number | null }

export interface GSearchTerm {
  searchTerm: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
}

export interface GRegion {
  region: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const micros = (v: unknown) => Math.round(num(v) / 10_000) / 100 // micros → unidade da moeda, 2 casas

export function derive(t: { spend: number; impressions: number; clicks: number; conversions: number; conversionValue: number }): GSummary {
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpa: t.conversions ? t.spend / t.conversions : 0,
    roas: t.spend ? t.conversionValue / t.spend : 0,
  }
}

function totals(m: GRow['metrics']) {
  return { spend: micros(m?.costMicros), impressions: num(m?.impressions), clicks: num(m?.clicks), conversions: Math.round(num(m?.conversions) * 100) / 100, conversionValue: Math.round(num(m?.conversionsValue) * 100) / 100 }
}

/** Soma as linhas (a consulta de resumo já vem em 1 linha, mas somar protege de várias). */
export function parseSummary(rows: GRow[]): GSummary {
  const t = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 }
  for (const r of rows) { const x = totals(r.metrics); t.spend += x.spend; t.impressions += x.impressions; t.clicks += x.clicks; t.conversions += x.conversions; t.conversionValue += x.conversionValue }
  return derive({ ...t, spend: Math.round(t.spend * 100) / 100 })
}

export function parseDaily(rows: GRow[]): GDay[] {
  return rows.filter(r => r.segments?.date).map(r => { const x = totals(r.metrics); return { date: r.segments!.date!, spend: x.spend, clicks: x.clicks, conversions: x.conversions, impressions: x.impressions } })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function parseCampaigns(rows: GRow[]): GCampaign[] {
  return rows.filter(r => r.campaign?.id).map(r => ({
    ...derive(totals(r.metrics)),
    id: String(r.campaign!.id), name: r.campaign!.name ?? '(sem nome)', status: r.campaign!.status ?? 'UNKNOWN',
    channel: r.campaign!.advertisingChannelType ?? '', dailyBudget: r.campaignBudget?.amountMicros != null ? micros(r.campaignBudget.amountMicros) : null,
  })).sort((a, b) => b.spend - a.spend)
}

export function parseSearchTerms(rows: GRow[]): GSearchTerm[] {
  return rows
    .filter(r => r.searchTermView?.searchTerm)
    .map(r => {
      const x = totals(r.metrics)
      return {
        searchTerm: r.searchTermView!.searchTerm!,
        impressions: x.impressions,
        clicks: x.clicks,
        spend: x.spend,
        conversions: x.conversions,
        ctr: x.impressions > 0 ? (x.clicks / x.impressions) * 100 : 0,
        cpc: x.clicks > 0 ? x.spend / x.clicks : 0,
      }
    })
    .sort((a, b) => b.clicks - a.clicks)
}

export const BRAZIL_STATES: Record<string, string> = {
  '20106': 'São Paulo (SP)',
  '20102': 'Rio de Janeiro (RJ)',
  '20098': 'Minas Gerais (MG)',
  '20103': 'Rio Grande do Sul (RS)',
  '20101': 'Paraná (PR)',
  '20105': 'Santa Catarina (SC)',
  '20088': 'Bahia (BA)',
  '20094': 'Goiás (GO)',
  '20091': 'Distrito Federal (DF)',
  '20090': 'Ceará (CE)',
  '20100': 'Pernambuco (PE)',
  '20093': 'Espírito Santo (ES)',
  '20097': 'Mato Grosso do Sul (MS)',
  '20096': 'Mato Grosso (MT)',
  '20095': 'Maranhão (MA)',
  '20099': 'Pará (PA)',
  '20104': 'Rio Grande do Norte (RN)',
  '20092': 'Paraíba (PB)',
  '20086': 'Alagoas (AL)',
  '20107': 'Sergipe (SE)',
  '20108': 'Tocantins (TO)',
  '20109': 'Piauí (PI)',
  '20087': 'Amazonas (AM)',
  '20089': 'Rondônia (RO)',
  '20085': 'Acre (AC)',
  '20084': 'Amapá (AP)',
  '20110': 'Roraima (RR)',
}

export function parseGeographic(rows: GRow[]): GRegion[] {
  const map = new Map<string, GRegion>()
  for (const r of rows) {
    const rawRegion = r.segments?.geoTargetRegion ?? ''
    const regionId = rawRegion.replace(/^geoTargetConstants\//, '')
    const name = BRAZIL_STATES[regionId] || (regionId ? `Região ${regionId}` : 'Brasil')
    const x = totals(r.metrics)
    const existing = map.get(name) ?? { region: name, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0 }
    existing.spend = Math.round((existing.spend + x.spend) * 100) / 100
    existing.impressions += x.impressions
    existing.clicks += x.clicks
    existing.conversions = Math.round((existing.conversions + x.conversions) * 10) / 10
    map.set(name, existing)
  }
  return Array.from(map.values())
    .map(g => ({
      ...g,
      ctr: g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0,
      cpc: g.clicks > 0 ? g.spend / g.clicks : 0,
    }))
    .sort((a, b) => b.spend - a.spend)
}

/** ID da conta: só os 10 dígitos, aceita "123-456-7890". Vazio se inválido. */
export function cleanCustomerId(raw: unknown): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.length === 10 ? d : ''
}

export const CHANNEL_LABEL: Record<string, string> = {
  SEARCH: 'Pesquisa', DISPLAY: 'Display', SHOPPING: 'Shopping', VIDEO: 'YouTube', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Geração de demanda', MULTI_CHANNEL: 'App', SMART: 'Inteligente', LOCAL: 'Local', TRAVEL: 'Viagens',
}
