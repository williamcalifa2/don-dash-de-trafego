/** Métricas que o card de cada cliente (no painel de controle) pode mostrar. A escolha, a ordem e o período são do administrador, por cliente. */
import { KIND_LABELS, type ResultKind } from './resultKind'
import { PERIODS, type PeriodDays } from './periods'
import type { MetaTotals } from './adminResults'

/** O que o card precisa por período: Meta + CRM (leads cadastrados no painel). */
export interface CardPeriod extends MetaTotals { crmLeads: number; manualLeads: number; vendas: number; receita: number }

export interface CardData {
  resultKind: ResultKind | null
  periods: Record<PeriodDays, CardPeriod> & Partial<Record<'today' | 'month', CardPeriod>>
  leadsToday: number
  /** total de leads no CRM, de todos os tempos */
  leadCount: number
  parados: number
}

export type MetricKey =
  | 'results' | 'cost' | 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpm' | 'cpc'
  | 'formLeads' | 'siteLeads' | 'conversations' | 'custom' | 'purchases' | 'purchaseValue' | 'roas' | 'linkClicks' | 'landingViews'
  | 'allLeads' | 'crmLeads' | 'manualLeads' | 'leadsToday' | 'leadCount' | 'vendas' | 'receita' | 'taxaConv' | 'ticket' | 'costPerSale' | 'roasReal' | 'parados'

export const MAX_CARD_METRICS = 8

const brl = (v: number, d = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const int = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${(v / 1_000).toFixed(1)}k` : new Intl.NumberFormat('pt-BR').format(Math.round(v)))
const pct = (v: number) => `${v.toFixed(v >= 10 ? 1 : 2).replace('.', ',')}%`
const div = (a: number, b: number) => (b > 0 ? a / b : null)
const opt = (v: number | null, f: (x: number) => string) => (v == null ? '—' : f(v))

interface Def {
  group: 'meta' | 'crm'
  /** nome curto do tipo de número; o período entra à parte, quando faz sentido */
  label: (kind: ResultKind) => string
  value: (c: CardData, p: CardPeriod) => string
  tone?: (c: CardData, p: CardPeriod) => 'good' | 'warn' | undefined
}

export const CARD_METRICS: Record<MetricKey, Def> = {
  // Meta
  results:       { group: 'meta', label: k => KIND_LABELS[k].many, value: (_c, p) => int(p.results) },
  cost:          { group: 'meta', label: k => KIND_LABELS[k].cost, value: (_c, p) => opt(div(p.spend, p.results), v => brl(v, 2)) },
  spend:         { group: 'meta', label: () => 'Investido', value: (_c, p) => brl(p.spend) },
  impressions:   { group: 'meta', label: () => 'Impressões', value: (_c, p) => int(p.impressions) },
  clicks:        { group: 'meta', label: () => 'Cliques', value: (_c, p) => int(p.clicks) },
  ctr:           { group: 'meta', label: () => 'CTR', value: (_c, p) => opt(div(p.clicks * 100, p.impressions), pct) },
  cpm:           { group: 'meta', label: () => 'CPM', value: (_c, p) => opt(div(p.spend * 1000, p.impressions), v => brl(v, 2)) },
  cpc:           { group: 'meta', label: () => 'CPC', value: (_c, p) => opt(div(p.spend, p.clicks), v => brl(v, 2)) },
  formLeads:     { group: 'meta', label: () => 'Leads de formulário', value: (_c, p) => int(p.formLeads) },
  siteLeads:     { group: 'meta', label: () => 'Leads do site', value: (_c, p) => int(p.siteLeads) },
  conversations: { group: 'meta', label: () => 'Conversas iniciadas', value: (_c, p) => int(p.conversations) },
  custom:        { group: 'meta', label: () => 'Conversões personalizadas', value: (_c, p) => int(p.custom) },
  purchases:     { group: 'meta', label: () => 'Compras', value: (_c, p) => int(p.purchases) },
  purchaseValue: { group: 'meta', label: () => 'Valor de compras', value: (_c, p) => brl(p.purchaseValue) },
  roas:          { group: 'meta', label: () => 'ROAS (Meta)', value: (_c, p) => opt(div(p.purchaseValue, p.spend), v => `${v.toFixed(1).replace('.', ',')}x`) },
  linkClicks:    { group: 'meta', label: () => 'Cliques no link', value: (_c, p) => int(p.linkClicks) },
  landingViews:  { group: 'meta', label: () => 'Visitas à página', value: (_c, p) => int(p.landingViews) },
  // Leads (CRM do painel + o que a Meta gerou)
  allLeads:      { group: 'crm', label: () => 'Todos os leads', value: (_c, p) => int(p.results + p.manualLeads) },
  crmLeads:      { group: 'crm', label: () => 'Leads no CRM', value: (_c, p) => int(p.crmLeads) },
  manualLeads:   { group: 'crm', label: () => 'Cadastrados à mão', value: (_c, p) => int(p.manualLeads) },
  leadsToday:    { group: 'crm', label: () => 'Leads hoje (CRM)', value: c => int(c.leadsToday) },
  leadCount:     { group: 'crm', label: () => 'Total no CRM', value: c => int(c.leadCount) },
  vendas:        { group: 'crm', label: () => 'Vendas', value: (_c, p) => int(p.vendas), tone: (_c, p) => (p.vendas ? 'good' : undefined) },
  receita:       { group: 'crm', label: () => 'Receita', value: (_c, p) => brl(p.receita), tone: (_c, p) => (p.receita ? 'good' : undefined) },
  taxaConv:      { group: 'crm', label: () => 'Taxa de conversão', value: (_c, p) => opt(div(p.vendas * 100, p.crmLeads), pct) },
  ticket:        { group: 'crm', label: () => 'Ticket médio', value: (_c, p) => opt(div(p.receita, p.vendas), v => brl(v)) },
  costPerSale:   { group: 'crm', label: () => 'Custo por venda', value: (_c, p) => opt(div(p.spend, p.vendas), v => brl(v, 2)) },
  roasReal:      { group: 'crm', label: () => 'ROAS real', value: (_c, p) => opt(div(p.receita, p.spend), v => `${v.toFixed(1).replace('.', ',')}x`) },
  parados:       { group: 'crm', label: () => 'Sem contato', value: c => int(c.parados), tone: c => (c.parados ? 'warn' : undefined) },
}

export const ALL_KEYS = Object.keys(CARD_METRICS) as MetricKey[]
export const isMetricKey = (k: unknown): k is MetricKey => typeof k === 'string' && k in CARD_METRICS
export const isPeriod = (d: unknown): d is PeriodDays => (PERIODS as readonly unknown[]).includes(d)

/** Nomes antigos (da primeira versão, sempre 7 dias) para os atuais. */
const LEGACY: Record<string, MetricKey> = { leads7: 'crmLeads', vendas7: 'vendas', receita7: 'receita', results7: 'results', cost7: 'cost', spend7: 'spend', impressions7: 'impressions', clicks7: 'clicks', ctr7: 'ctr', cpm7: 'cpm', cpc7: 'cpc' }

export interface CardChoice { metrics: MetricKey[]; days: PeriodDays }

/** Padrão por tipo: formulário mostra o CRM; site, conversas, personalizada e misto mostram o resultado da Meta. */
export function defaultChoice(kind: ResultKind | null): CardChoice {
  return { days: 7, metrics: kind && kind !== 'form' ? ['results', 'cost', 'spend'] : ['crmLeads', 'vendas', 'parados'] }
}

/** Escolha salva (lista antiga ou {metrics, days}) ou o padrão. Ignora chaves desconhecidas, repetidas e limita ao máximo. */
export function resolveChoice(saved: unknown, kind: ResultKind | null): CardChoice {
  const raw = Array.isArray(saved) ? saved : (saved && typeof saved === 'object' ? (saved as { metrics?: unknown }).metrics : undefined)
  const days = saved && typeof saved === 'object' && !Array.isArray(saved) && isPeriod((saved as { days?: unknown }).days) ? (saved as { days: PeriodDays }).days : 7
  const list = Array.isArray(raw) ? [...new Set(raw.map(k => (typeof k === 'string' && LEGACY[k]) || k).filter(isMetricKey))].slice(0, MAX_CARD_METRICS) : []
  return list.length ? { metrics: list, days } : defaultChoice(kind)
}

/** De onde vêm o rodapé e o gráfico do card: do primeiro número escolhido. */
export const cardSource = (keys: MetricKey[]): 'crm' | 'meta' => CARD_METRICS[keys[0]].group === 'meta' ? 'meta' : 'crm'

/** Move um item da lista de métricas do card (arrastar e soltar). Índice fora da lista não mexe em nada. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list]
  const n = [...list]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n
}
