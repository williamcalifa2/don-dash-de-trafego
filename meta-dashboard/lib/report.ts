/**
 * Relatório mensal: junta o que o app já guarda (orgânico do mês fechado e anúncios do mês fechado) num formato pronto para os slides.
 * Só funções puras: quem lê o banco e chama a Meta é a rota. Sem dado pessoal (nada de nome/telefone de lead).
 */
import type { MetricsResponse, MetricsSummary } from './meta'
import { KIND_LABELS } from './resultKind'
import type { OrganicPost, OrganicView } from './meta/organicRead'
import type { AdPerfRow } from './meta/read'

const BR = 3 * 3_600_000
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export type ReportPreset = 'last_month' | 'last_7d'

export interface ReportMonth {
  key: string
  label: string
  since: string
  until: string
  preset?: ReportPreset
}

/** Instante (ms) em que o mês fechado acabou: só dado coletado depois disso já enxerga o mês inteiro. */
export const monthEndsAt = (m: ReportMonth) => Date.parse(`${m.until}T00:00:00-03:00`) + 86_400_000

/** Os últimos 7 dias fechados (até ontem, hora do Brasil). */
export function last7DaysOf(now: number): ReportMonth {
  const br = new Date(now - BR)
  const untilDate = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - 1))
  const sinceDate = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - 7))
  const since = sinceDate.toISOString().slice(0, 10)
  const until = untilDate.toISOString().slice(0, 10)
  return {
    key: `7d-${until}`,
    label: 'Últimos 7 dias',
    since,
    until,
    preset: 'last_7d',
  }
}

/** O mês fechado antes de `now` (dia do Brasil): no dia 1 de setembro, agosto inteiro. */
export function lastMonthOf(now: number): ReportMonth {
  const br = new Date(now - BR)
  const first = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() - 1, 1))
  const last = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 0))
  const y = first.getUTCFullYear(), m = first.getUTCMonth()
  return {
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
    label: `${MONTHS[m]} de ${y}`,
    since: first.toISOString().slice(0, 10),
    until: last.toISOString().slice(0, 10),
    preset: 'last_month',
  }
}

export function reportPeriodOf(preset: ReportPreset, now: number): ReportMonth {
  return preset === 'last_7d' ? last7DaysOf(now) : lastMonthOf(now)
}

export interface ReportStat {
  label: string
  /** já formatado (pt-BR); "—" quando não há dado */
  value: string
  /** variação contra o mês anterior, em %; null quando não dá para comparar */
  delta: number | null
  /** custo: cair é bom */
  lowerIsBetter?: boolean
}
export interface ReportPost { platform: 'ig' | 'fb'; type: string; caption: string; thumb: string | null; url: string | null; reach: number | null; views: number | null; interactions: number }
export interface ReportAd { id: string; name: string; thumb: string | null; results: number; spend: number; clicks: number; impressions: number; costPerResult: number | null; ctr: number | null }
export interface ReportNotes { objective: string; goals: string; analysis: string; next: string }

export type ReportMode = 'standard' | 'advanced'

export interface ReportCampaign {
  id: string
  name: string
  status: string
  spend: number
  results: number
  costPerResult: number | null
  ctr: number
}

export interface ReportFunnel {
  impressions: number
  clicks: number
  results: number
  resultLabel: string
  costPerResult: number | null
  ctr: number
  clickToResultRate: number
}

export interface ReportData {
  month: ReportMonth
  client: { name: string; logoUrl: string | null }
  currency: string
  organic: { status: OrganicView['status'] | 'incomplete'; handle: string | null; stats: ReportStat[]; top: ReportPost[] }
  paid: { status: 'ok' | 'pending'; resultLabel: string; stats: ReportStat[]; top: ReportAd[] }
  campaigns?: ReportCampaign[]
  daily?: { dates: string[]; spend: number[]; results: number[] }
  funnel?: ReportFunnel
  notes: ReportNotes
}

// ── formatação ───────────────────────────────────────────────────────────────
const nf = (v: number, d = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
/** 9.600 → "9,6 mil"; 98.700 → "98,7 mil"; 1.250.000 → "1,25 mi". Abaixo de mil, o número inteiro. */
export function compact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${nf(v / 1_000_000, 2).replace(/,?0+$/, '')} mi`
  if (a >= 10_000) return `${nf(v / 1_000, 1).replace(/,0$/, '')} mil`
  if (a >= 1_000) return `${nf(v / 1_000, 2).replace(/,?0+$/, '')} mil`
  return nf(v)
}
const money = (v: number | null | undefined, currency: string) => (v == null || !isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v))
export const pct = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : `${nf(v, d)}%`)

export function delta(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev <= 0) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}
export const deltaLabel = (d: number | null) => (d == null ? '' : `${d > 0 ? '+' : ''}${nf(d, 1)}%`)

// ── orgânico ─────────────────────────────────────────────────────────────────
const rankPost = (p: OrganicPost) => (p.reach ?? p.views ?? 0) * 1_000_000 + p.interactions

export function organicSection(view: OrganicView | null, notBefore = 0): ReportData['organic'] {
  const empty = { handle: null, stats: [], top: [] as ReportPost[] }
  if (!view) return { status: 'pending', ...empty }
  if (view.status !== 'ok') return { status: view.status, ...empty }
  const kpis = view.hasIg ? view.kpis.ig : view.kpis.fb
  const k = (key: string) => kpis.find(x => x.key === key)
  const stat = (label: string, key: string): ReportStat => { const x = k(key); return { label, value: compact(x?.value), delta: delta(x?.value, x?.prev) } }
  const stats: ReportStat[] = view.hasIg
    ? [stat('Alcance', 'reach'), stat('Novos seguidores', 'gained'), stat('Visualizações', 'views'), stat('Visitas ao perfil', 'visits'), stat('Interações', 'interactions'), stat('Cliques no link', 'taps')]
    : [stat('Alcance', 'reach'), stat('Novos seguidores', 'followers'), stat('Visualizações', 'views'), stat('Interações', 'interactions')]
  // Sem a janela do mês fechado (coleta antiga, ainda sem esse recorte): melhor avisar do que mostrar números de outro período.
  const incomplete = (view.hasIg && k('reach')?.value == null) || (view.at ?? 0) < notBefore // coleta de antes da virada do mês: a janela "mês anterior" ainda é a do mês retrasado
  const top = [...view.posts].sort((a, b) => rankPost(b) - rankPost(a)).slice(0, 3)
    .map(p => ({ platform: p.platform, type: p.type, caption: p.caption, thumb: p.thumb, url: p.url, reach: p.reach, views: p.views, interactions: p.interactions }))
  return { status: incomplete ? 'incomplete' : 'ok', handle: view.profile?.ig?.username ? `@${view.profile.ig.username}` : view.profile?.fb?.name ?? null, stats, top }
}

// ── anúncios ─────────────────────────────────────────────────────────────────
export function paidStats(cur: MetricsSummary | undefined, prev: MetricsSummary | undefined, currency: string, resultMany: string, costFull: string): ReportStat[] {
  if (!cur) return []
  type Row = [label: string, key: keyof MetricsSummary, fmt: (v: number) => string, lowerIsBetter?: boolean]
  const rows: Row[] = [
    ['Investimento', 'spend', v => money(v, currency)],
    ['Alcance', 'reach', v => compact(v)],
    ['Impressões', 'impressions', v => compact(v)],
    ['Frequência', 'frequency', v => nf(v, 2)],
    ['Cliques no link', 'link_clicks', v => compact(v)],
    ['Custo por clique', 'cost_per_link_click', v => money(v, currency), true],
    ['CTR', 'ctr', v => pct(v)],
    ['CPM', 'cpm', v => money(v, currency), true],
    [resultMany, 'results', v => compact(v)],
    [costFull, 'cost_per_result', v => money(v, currency), true],
    ['Visualizações da página', 'landing_page_views', v => compact(v)],
    ['Engajamentos', 'post_engagement', v => compact(v)],
  ]
  return rows.map(([label, key, fmt, lowerIsBetter]) => {
    const v = cur[key] as number | null | undefined, p = prev?.[key] as number | null | undefined
    return { label, value: v == null || !isFinite(v) ? '—' : fmt(v), delta: delta(v, p), ...(lowerIsBetter ? { lowerIsBetter } : {}) }
  })
}

interface StructAd { id: string; creative?: Record<string, unknown> }
const creativeThumb = (a: StructAd | undefined): string | null => {
  const c = a?.creative
  const img = typeof c?.image_url === 'string' ? c.image_url : typeof c?.thumbnail_url === 'string' ? c.thumbnail_url : null
  return img
}

/** Os 3 melhores anúncios do mês: mais resultados; sem resultados, mais cliques. */
export function topAds(rows: AdPerfRow[], structure: StructAd[]): ReportAd[] {
  const byId = new Map(structure.map(a => [a.id, a]))
  const anyResults = rows.some(r => r.results > 0)
  return [...rows]
    .filter(r => r.spend > 0)
    .sort((a, b) => (anyResults ? b.results - a.results || (a.spend / Math.max(a.results, 1)) - (b.spend / Math.max(b.results, 1)) : b.clicks - a.clicks) || b.spend - a.spend)
    .slice(0, 3)
    .map(r => ({
      id: r.ad_id, name: r.ad_name, thumb: creativeThumb(byId.get(r.ad_id)), results: r.results, spend: r.spend, clicks: r.clicks, impressions: r.impressions,
      costPerResult: r.results > 0 ? r.spend / r.results : null, ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null,
    }))
}

export function paidSection(m: MetricsResponse | null, ads: AdPerfRow[], structure: StructAd[]): ReportData['paid'] & { currency: string } {
  if (!m || !m.summary || (m.summary.spend ?? 0) <= 0 && !m.summary.impressions) return { status: 'pending', resultLabel: 'Resultados', stats: [], top: [], currency: m?.currency ?? 'BRL' }
  const kl = KIND_LABELS[m.result_kind] ?? KIND_LABELS.misto
  return { status: 'ok', resultLabel: kl.many, stats: paidStats(m.summary, m.summary_prev, m.currency, kl.many, kl.costFull), top: topAds(ads, structure), currency: m.currency }
}

// ── textos ───────────────────────────────────────────────────────────────────
const num = (s: ReportStat | undefined) => s?.value ?? '—'

/** Rascunho da análise a partir dos números; a equipe revisa e edita antes de baixar. Só afirma o que os dados mostram. */
export function draftAnalysis(d: Pick<ReportData, 'organic' | 'paid' | 'month'>): string {
  const lines: string[] = []
  const p = (label: string) => d.paid.stats.find(s => s.label === label)
  const inv = p('Investimento'), res = p(d.paid.resultLabel), cost = d.paid.stats.find(s => s.lowerIsBetter && s.label.toLowerCase().startsWith('custo por') && s.label !== 'Custo por clique')
  const is7d = d.month.preset === 'last_7d'
  const timeContext = is7d ? 'Nos últimos 7 dias' : `Em ${d.month.label.split(' de ')[0]}`
  const compContext = is7d ? 'ao período anterior' : 'ao mês anterior'
  if (d.paid.status === 'ok' && inv && res && res.value !== '—' && res.value !== '0') {
    lines.push(`${timeContext}, investimos ${num(inv)} e geramos ${num(res)} ${d.paid.resultLabel.toLowerCase()}${cost && cost.value !== '—' ? `, a ${num(cost)} cada` : ''}.`)
    if (cost?.delta != null && Math.abs(cost.delta) >= 1) lines.push(`O ${cost.label.toLowerCase()} ${cost.delta < 0 ? `caiu ${deltaLabel(Math.abs(cost.delta)).replace('+', '')}` : `subiu ${deltaLabel(cost.delta).replace('+', '')}`} em relação ${compContext}.`)
  }
  const reach = d.organic.stats.find(s => s.label === 'Alcance')
  if (d.organic.status === 'ok' && reach && reach.value !== '—') lines.push(`No orgânico, o alcance foi de ${reach.value}${reach.delta != null ? ` (${deltaLabel(reach.delta)} contra o ${is7d ? 'período' : 'mês'} anterior)` : ''}.`)
  const best = d.organic.top[0]
  if (best) lines.push(`O conteúdo de maior destaque foi ${best.type === 'Reels' ? 'um Reels' : best.type ? `uma publicação (${best.type.toLowerCase()})` : 'uma publicação'}${best.reach != null ? `, com ${compact(best.reach)} de alcance` : ''}.`)
  return lines.join('\n')
}

export const EMPTY_NOTES: ReportNotes = { objective: '', goals: '', analysis: '', next: '' }
export function cleanNotes(v: unknown): ReportNotes {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const t = (k: keyof ReportNotes) => (typeof o[k] === 'string' ? (o[k] as string).slice(0, 1500) : '')
  return { objective: t('objective'), goals: t('goals'), analysis: t('analysis'), next: t('next') }
}

export function extractCampaigns(m: MetricsResponse | null): ReportCampaign[] {
  if (!m?.campaigns) return []
  return m.campaigns
    .filter(c => (c.spend ?? 0) > 0 || (c.results ?? 0) > 0)
    .sort((a, b) => (b.results ?? 0) - (a.results ?? 0) || (b.spend ?? 0) - (a.spend ?? 0))
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      spend: c.spend ?? 0,
      results: c.results ?? 0,
      costPerResult: c.cost_per_result ?? null,
      ctr: c.ctr ?? 0,
    }))
}

export function extractDaily(m: MetricsResponse | null): ReportData['daily'] | undefined {
  if (!m?.daily?.dates?.length) return undefined
  const d = m.daily
  const results = d.metrics?.results ?? d.leads
  return {
    dates: d.dates.map(iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`),
    spend: d.spend,
    results,
  }
}

export function extractFunnel(m: MetricsResponse | null): ReportFunnel | undefined {
  if (!m?.summary) return undefined
  const s = m.summary
  const kl = KIND_LABELS[m.result_kind] ?? KIND_LABELS.misto
  const imp = s.impressions ?? 0
  const clicks = s.link_clicks || s.clicks || 0
  const results = s.results ?? 0
  const ctr = imp > 0 ? (clicks / imp) * 100 : 0
  const cvr = clicks > 0 ? (results / clicks) * 100 : 0
  return {
    impressions: imp,
    clicks,
    results,
    resultLabel: kl.many,
    costPerResult: s.cost_per_result,
    ctr: Math.round(ctr * 100) / 100,
    clickToResultRate: Math.round(cvr * 100) / 100,
  }
}

export function generateSmartAnalysis(d: ReportData): { analysis: string; next: string } {
  const p = (label: string) => d.paid.stats.find(s => s.label === label)
  const inv = p('Investimento'), res = p(d.paid.resultLabel), cpl = d.paid.stats.find(s => s.lowerIsBetter && s.label.toLowerCase().startsWith('custo'))
  const ctr = p('CTR'), freq = p('Frequência')

  const analysisLines: string[] = []
  const nextLines: string[] = []

  if (inv && res && inv.value !== '—' && res.value !== '—') {
    analysisLines.push(`• Performance Geral: O investimento total foi de ${inv.value}, gerando ${res.value} ${d.paid.resultLabel.toLowerCase()}${cpl && cpl.value !== '—' ? ` a um custo médio de ${cpl.value} cada` : ''}.`)
  }

  if (cpl?.delta != null) {
    if (cpl.delta < -5) {
      analysisLines.push(`• Eficiência Elevada: O ${cpl.label.toLowerCase()} reduziu ${Math.abs(cpl.delta)}% contra o período anterior, indicando boa aceitação dos criativos e alta taxa de conversão.`)
      nextLines.push(`• Otimização de Escala: Aumentar o investimento em 15% a 20% nas campanhas com menor custo por resultado para maximizar o volume de conversões.`)
    } else if (cpl.delta > 10) {
      analysisLines.push(`• Variação de Custo: O ${cpl.label.toLowerCase()} subiu ${cpl.delta}% em relação ao período anterior, refletindo maior concorrência no leilão ou saturação da base impactada.`)
      nextLines.push(`• Testes de Segmentação: Abrir novos públicos de interesse e testar públicos semelhantes (Lookalike) para diminuir a pressão de custo por resultado.`)
    } else {
      analysisLines.push(`• Estabilidade de Custo: O ${cpl.label.toLowerCase()} manteve-se equilibrado com variação de ${deltaLabel(cpl.delta)}, sem oscilações bruscas no custo de aquisição.`)
    }
  }

  const freqVal = freq ? parseFloat(freq.value.replace(',', '.')) : 0
  if (freqVal >= 2.8) {
    analysisLines.push(`• Frequência de Exibição: A frequência média atingiu ${freq.value}, sinalizando que o público já foi impactado múltiplas vezes pelos mesmos anúncios.`)
    nextLines.push(`• Renovação de Criativos: Inserir de 2 a 4 novos criativos (revezando vídeos curtos e peças estáticas) para reduzir o desgaste visual.`)
  } else if (freqVal > 0) {
    analysisLines.push(`• Cobertura de Público: A frequência média de ${freq.value} demonstra entrega balanceada, com ampla captura de pessoas novas sem saturação.`)
  }

  if (ctr && ctr.value !== '—') {
    const ctrVal = parseFloat(ctr.value.replace(',', '.').replace('%', ''))
    if (ctrVal >= 1.5) {
      analysisLines.push(`• Taxa de Cliques (CTR): O CTR de ${ctr.value} indica alto poder de atração dos anúncios no feed e stories.`)
    }
  }

  const topAd = d.paid.top[0]
  if (topAd) {
    analysisLines.push(`• Anúncio Destaque: A peça "${topAd.name}" liderou as conversões com ${compact(topAd.results)} resultados.`)
    nextLines.push(`• Variações do Campeão: Produzir variações diretas da peça "${topAd.name}" testando novos ganchos (3 primeiros segundos) e chamadas para ação.`)
  }

  const topCamp = d.campaigns?.[0]
  if (topCamp) {
    analysisLines.push(`• Campanha Principal: A campanha "${topCamp.name}" foi a mais produtiva, concentrando ${compact(topCamp.results)} resultados.`)
  }

  const reachOrg = d.organic.stats.find(s => s.label === 'Alcance')
  if (d.organic.status === 'ok' && reachOrg && reachOrg.value !== '—') {
    analysisLines.push(`• Sinergia Orgânica: No Instagram e Facebook, o alcance orgânico atingiu ${reachOrg.value}, servindo de base sólida para os anúncios pagos.`)
  }

  if (nextLines.length === 0) {
    nextLines.push('• Monitorar diariamente a estabilidade do CPL e o ritmo de entrega das campanhas principais.')
    nextLines.push('• Manter o plano de testes contínuos de criativos para garantir consistência no próximo período.')
  }

  return {
    analysis: analysisLines.join('\n\n'),
    next: nextLines.join('\n\n'),
  }
}
