import { legacyGet, errMsg } from './meta/legacy'
import { detectKind, KIND_LABELS, type ResultKind } from './resultKind'
import { isCustomConversion, labelAction } from './actionLabels'
export type DatePreset = 'today' | 'last_7d' | 'last_30d' | 'last_14d' | 'this_month' | 'last_month'

export interface MetricsSummary {
  spend: number
  impressions: number
  clicks: number
  unique_clicks: number
  ctr: number
  cpm: number
  cpc: number
  cpl: number | null
  leads: number
  purchases: number
  purchase_value: number
  roas: number | null
  cpa: number | null
  frequency: number
  reach: number
  post_engagement: number
  cost_per_engagement: number | null
  reactions: number
  comments: number
  video_views: number
  link_clicks: number
  cost_per_link_click: number | null
  landing_page_views: number
  messaging_conversations: number
  cost_per_conversation: number | null
  /** leads de formulário (lead_grouped) */
  form_leads: number
  /** leads do site (evento Lead do pixel) */
  site_leads: number
  /** conversões personalizadas (definidas na Meta) */
  custom_conversions: number
  /** total de resultados: formulário + conversas + (conversão personalizada, ou leads do site quando não há) */
  results: number
  cost_per_result: number | null
}

export interface CampaignRow {
  id: string
  name: string
  status: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpl: number | null
  leads: number
  roas: number | null
  frequency: number
  daily_budget: number | null
  results: number
  cost_per_result: number | null
  /** todas as conversões e ações da campanha, com nome legível */
  conversions: ConversionItem[]
}

/** Uma ação/conversão da Meta com o nome em português e o custo por ação. */
export interface ConversionItem { type: string; label: string; value: number; cost: number | null; custom: boolean }

export interface DailySummary {
  dates: string[]
  spend: number[]
  leads: number[]
  cpl: number[]
  impressions: number[]
  ctr: number[]
  metrics?: Record<string, number[]>
}

export interface MetricsResponse {
  account_id: string
  account_name: string
  currency: string
  date_preset: DatePreset
  generated_at: string
  is_mock?: boolean
  error?: string
  summary: MetricsSummary
  summary_prev?: MetricsSummary
  daily?: DailySummary
  campaigns: CampaignRow[]
  /** Todas as conversões e ações da conta no período (nada fica de fora). */
  conversions: ConversionItem[]
  /** Tipo de resultado do cliente, detectado pelo que a conta gera (formulário, site, conversas ou misto). */
  result_kind: ResultKind
  /** Só no modo banco: idade dos dados e motivo se estiverem velhos ou a conta estiver em espera. */
  freshness?: { updatedAt: number | null; stale: boolean; pending: boolean; note: string | null }
}

export { METRIC_DEFS, DEFAULT_METRICS, type MetricKey } from './metricDefs'

const INSIGHT_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'unique_clicks',
  'ctr',
  'cpm',
  'cpc',
  'frequency',
  'reach',
  'actions',
  'action_values',
  'inline_post_engagement',
].join(',')

type ActionRow = { action_type: string; value: string }

function getAction(actions: ActionRow[] | undefined, type: string): number {
  if (!actions) return 0
  const match = actions.find(a => a.action_type === type)
  return match ? Number(match.value) : 0
}

export function getActions(actions: ActionRow[] | undefined, types: string[]): number {
  if (!actions) return 0
  return actions
    .filter(a => types.includes(a.action_type))
    .reduce((sum, a) => sum + Number(a.value), 0)
}

/** Leads de formulário instantâneo (o número que o Gerenciador mostra como lead de formulário). */
export function getFormLeads(actions: ActionRow[] | undefined): number {
  return actions ? getAction(actions, 'onsite_conversion.lead_grouped') : 0
}

/** Leads do site: evento Lead do pixel. Sem o evento específico, usa "lead" só quando não há formulário (evita contar 2x). */
/** Conversões de captação e cadastro no site que não são lead padrão (cadastros, agendamentos, contatos, candidaturas). */
export function getOtherWebConversions(actions: ActionRow[] | undefined): number {
  if (!actions) return 0
  const registrations = Math.max(
    getAction(actions, 'complete_registration'),
    getAction(actions, 'offsite_conversion.fb_pixel_complete_registration')
  )
  const schedules = Math.max(
    getAction(actions, 'schedule'),
    getAction(actions, 'offsite_conversion.fb_pixel_schedule')
  )
  const contacts = Math.max(
    getAction(actions, 'contact_total'),
    getAction(actions, 'contact_website'),
    getAction(actions, 'contact'),
    getAction(actions, 'offsite_conversion.fb_pixel_contact')
  )
  const applications = Math.max(
    getAction(actions, 'submit_application'),
    getAction(actions, 'offsite_conversion.fb_pixel_submit_application')
  )
  return registrations + schedules + contacts + applications
}

/** Leads do site: evento Lead do pixel + outras conversões de cadastro/contato. Sem o evento específico, usa "lead" só quando não há formulário (evita contar 2x). */
export function getSiteLeads(actions: ActionRow[] | undefined): number {
  if (!actions) return 0
  const pixel = getActions(actions, ['offsite_conversion.fb_pixel_lead'])
  const alt = getOtherWebConversions(actions)
  if (pixel > 0) return pixel + alt
  const genericLead = getAction(actions, 'lead')
  const form = getFormLeads(actions)
  if (genericLead > form) return (genericLead - form) + alt
  if (form > 0) return alt
  return alt > 0 ? alt : genericLead
}

/** Conversas iniciadas (mensagem). A Meta devolve com o prefixo onsite_conversion.; aceita também o nome curto. */
export function getConversations(actions: ActionRow[] | undefined): number {
  if (!actions) return 0
  const full = getAction(actions, 'onsite_conversion.messaging_conversation_started_7d')
  if (full > 0) return full
  const short = getAction(actions, 'messaging_conversation_started_7d')
  // Sem o evento de conversa iniciada, as conexões de mensagem são a melhor aproximação (mesmo clique para o WhatsApp/Direct).
  return short > 0 ? short : getAction(actions, 'onsite_conversion.total_messaging_connection')
}

/** Conversões personalizadas (definidas na Meta) e eventos personalizados do pixel. */
export function getCustomConversions(actions: ActionRow[] | undefined): number {
  if (!actions) return 0
  return actions.filter(a => isCustomConversion(a.action_type) || a.action_type === 'offsite_conversion.fb_pixel_custom').reduce((s, a) => s + Number(a.value || 0), 0)
}

/** Resultado do site: a conversão personalizada, quando existe (ela já inclui os leads do pixel: contar as duas repetiria); senão os leads do site. */
export function getWebResult(actions: ActionRow[] | undefined): number {
  const custom = getCustomConversions(actions)
  if (custom > 0) return custom
  return getSiteLeads(actions)
}

/** Total de resultados: formulário + conversas iniciadas + resultado do site/personalizado + compras. */
export function getResults(actions: ActionRow[] | undefined): number {
  return getFormLeads(actions) + getConversations(actions) + getWebResult(actions) + getPurchaseCount(actions)
}

/** Contagens por tipo, já sem repetição, para detectar o tipo de resultado da conta. */
export function resultCounts(actions: ActionRow[] | undefined) {
  const custom = getCustomConversions(actions)
  return {
    form_leads: getFormLeads(actions),
    site_leads: custom > 0 ? 0 : getSiteLeads(actions),
    conversations: getConversations(actions),
    custom_conversions: custom,
    purchases: getPurchaseCount(actions),
  }
}

/** Lista TODAS as ações da linha (conversões, cliques, engajamento...), com nome e custo por ação. */
export function listConversions(actions: ActionRow[] | undefined, spend: number, names: Record<string, string> = {}): ConversionItem[] {
  if (!actions) return []
  return actions
    .map(a => ({ type: a.action_type, label: labelAction(a.action_type, names), value: Number(a.value || 0), custom: isCustomConversion(a.action_type) }))
    .filter(a => a.value > 0)
    .map(a => ({ ...a, cost: spend > 0 ? spend / a.value : null }))
    .sort((a, b) => Number(b.custom) - Number(a.custom) || b.value - a.value)
}

export interface DeliveryItem {
  spend: number
  leads?: number
  results?: number
  cpl?: number | null
  cost_per_result?: number | null
  clicks?: number
  impressions?: number
  conversions?: ConversionItem[]
}

export interface DeliveryResolution {
  count: number
  label: string
  cost: number | null
  costLabel: string
  badge: string
  type: string
}

/** Resolve com inteligência a entrega real de uma campanha, conjunto ou anúncio (sem zerar tráfego, vídeo, compras, etc.). */
export function resolveDelivery(
  item: DeliveryItem,
  accountKind: ResultKind = 'form',
): DeliveryResolution {
  const spend = item.spend || 0
  const convs = item.conversions ?? []

  const getConvVal = (types: string[]) => {
    const hit = convs.find(c => types.includes(c.type))
    return hit ? hit.value : 0
  }

  // 1. Alta intenção / conversões
  const formLeads = getConvVal(['onsite_conversion.lead_grouped'])
  const pixelLeads = getConvVal(['offsite_conversion.fb_pixel_lead'])
  const genericLeads = getConvVal(['lead'])
  const totalLeads = Math.max(formLeads + pixelLeads, genericLeads, item.leads ?? 0)

  const conversations = getConvVal([
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
  ])

  const purchases = Math.max(
    getConvVal(['purchase']),
    getConvVal(['offsite_conversion.fb_pixel_purchase']),
    getConvVal(['omni_purchase']),
  )

  const customConv = convs.find(c => c.custom && c.value > 0)

  const schedules = Math.max(
    getConvVal(['schedule']),
    getConvVal(['offsite_conversion.fb_pixel_schedule']),
  )

  const registrations = Math.max(
    getConvVal(['complete_registration']),
    getConvVal(['offsite_conversion.fb_pixel_complete_registration']),
  )

  const contacts = Math.max(
    getConvVal(['contact_total']),
    getConvVal(['contact_website']),
    getConvVal(['contact']),
    getConvVal(['offsite_conversion.fb_pixel_contact']),
  )

  const applications = Math.max(
    getConvVal(['submit_application']),
    getConvVal(['offsite_conversion.fb_pixel_submit_application']),
  )

  if (formLeads > 0 && formLeads >= pixelLeads && formLeads >= conversations && formLeads >= purchases) {
    return {
      count: formLeads,
      label: 'leads',
      cost: formLeads > 0 && spend > 0 ? spend / formLeads : null,
      costLabel: 'CPL',
      badge: 'Leads',
      type: 'form',
    }
  }

  if (pixelLeads > 0 && pixelLeads >= conversations && pixelLeads >= purchases) {
    return {
      count: pixelLeads,
      label: 'leads do site',
      cost: pixelLeads > 0 && spend > 0 ? spend / pixelLeads : null,
      costLabel: 'CPL',
      badge: 'Leads',
      type: 'site',
    }
  }

  if (conversations > 0 && conversations >= purchases) {
    return {
      count: conversations,
      label: 'conversas',
      cost: conversations > 0 && spend > 0 ? spend / conversations : null,
      costLabel: 'Custo/conv.',
      badge: 'Conversas',
      type: 'conversa',
    }
  }

  if (purchases > 0) {
    return {
      count: purchases,
      label: 'compras',
      cost: purchases > 0 && spend > 0 ? spend / purchases : null,
      costLabel: 'CPA',
      badge: 'Compras',
      type: 'sales',
    }
  }

  if (customConv) {
    return {
      count: customConv.value,
      label: customConv.label.toLowerCase().replace(' (personalizada)', ''),
      cost: customConv.cost ?? (spend > 0 ? spend / customConv.value : null),
      costLabel: 'Custo/conv.',
      badge: 'Conv.',
      type: 'custom',
    }
  }

  if (schedules > 0) {
    return {
      count: schedules,
      label: 'agendamentos',
      cost: spend > 0 ? spend / schedules : null,
      costLabel: 'Custo/agend.',
      badge: 'Agend.',
      type: 'schedule',
    }
  }

  if (registrations > 0) {
    return {
      count: registrations,
      label: 'cadastros',
      cost: spend > 0 ? spend / registrations : null,
      costLabel: 'Custo/cad.',
      badge: 'Cadastros',
      type: 'registration',
    }
  }

  if (contacts > 0) {
    return {
      count: contacts,
      label: 'contatos',
      cost: spend > 0 ? spend / contacts : null,
      costLabel: 'Custo/cont.',
      badge: 'Contatos',
      type: 'contact',
    }
  }

  if (applications > 0) {
    return {
      count: applications,
      label: 'candidaturas',
      cost: spend > 0 ? spend / applications : null,
      costLabel: 'Custo/cand.',
      badge: 'Cand.',
      type: 'application',
    }
  }

  if (totalLeads > 0) {
    return {
      count: totalLeads,
      label: 'leads',
      cost: item.cpl ?? (spend > 0 ? spend / totalLeads : null),
      costLabel: 'CPL',
      badge: 'Leads',
      type: 'lead',
    }
  }

  const res = item.results ?? 0
  if (res > 0) {
    const cost = item.cost_per_result ?? (spend > 0 ? spend / res : null)
    const kl = KIND_LABELS[accountKind] ?? KIND_LABELS.misto
    return {
      count: res,
      label: kl.many.toLowerCase(),
      cost,
      costLabel: kl.cost,
      badge: kl.many,
      type: accountKind,
    }
  }

  // 2. Tráfego / Engajamento / Vídeo / Impressões
  const landingViews = getConvVal(['landing_page_view'])
  if (landingViews > 0) {
    return {
      count: landingViews,
      label: 'visitas à página',
      cost: spend > 0 ? spend / landingViews : null,
      costLabel: 'Custo/visita',
      badge: 'Visitas',
      type: 'landing_page_view',
    }
  }

  const linkClicks = Math.max(
    getConvVal(['link_click']),
    getConvVal(['outbound_click']),
  )
  if (linkClicks > 0) {
    return {
      count: linkClicks,
      label: 'cliques no link',
      cost: spend > 0 ? spend / linkClicks : null,
      costLabel: 'CPC',
      badge: 'Cliques',
      type: 'link_click',
    }
  }

  const videoViews = getConvVal(['video_view'])
  if (videoViews > 0) {
    return {
      count: videoViews,
      label: 'views de vídeo',
      cost: spend > 0 ? spend / videoViews : null,
      costLabel: 'CPV',
      badge: 'Views',
      type: 'video_view',
    }
  }

  const postEngagements = Math.max(
    getConvVal(['post_engagement']),
    getConvVal(['page_engagement']),
  )
  if (postEngagements > 0) {
    return {
      count: postEngagements,
      label: 'engajamentos',
      cost: spend > 0 ? spend / postEngagements : null,
      costLabel: 'CPE',
      badge: 'Engaj.',
      type: 'engagement',
    }
  }

  const clicks = item.clicks ?? 0
  if (clicks > 0) {
    return {
      count: clicks,
      label: 'cliques',
      cost: spend > 0 ? spend / clicks : null,
      costLabel: 'CPC',
      badge: 'Cliques',
      type: 'clicks',
    }
  }

  const impressions = item.impressions ?? 0
  if (impressions > 0) {
    return {
      count: impressions,
      label: 'impressões',
      cost: spend > 0 ? (spend * 1000) / impressions : null,
      costLabel: 'CPM',
      badge: 'Imp.',
      type: 'impressions',
    }
  }

  return {
    count: 0,
    label: KIND_LABELS[accountKind]?.many.toLowerCase() ?? 'resultados',
    cost: null,
    costLabel: KIND_LABELS[accountKind]?.cost ?? 'Custo/res.',
    badge: '—',
    type: 'none',
  }
}

/** Total de leads (formulário nativo + site/pixel + cadastros/agendamentos), sem descartar pixel se houver formulário. */
export function getLeads(actions: ActionRow[] | undefined): number {
  if (!actions) return 0
  const form = getFormLeads(actions)
  const pixel = getActions(actions, ['offsite_conversion.fb_pixel_lead'])
  const genericLead = getAction(actions, 'lead')
  const standardLeads = Math.max(genericLead, form + pixel)
  if (standardLeads > 0) return standardLeads
  return getOtherWebConversions(actions)
}

export function getPurchaseValue(actionValues: ActionRow[] | undefined): number {
  if (!actionValues) return 0
  const pixel = getAction(actionValues, 'offsite_conversion.fb_pixel_purchase')
  const generic = getAction(actionValues, 'purchase')
  const omni = getAction(actionValues, 'omni_purchase')
  return Math.max(generic, pixel, omni)
}

export function getPurchaseCount(actions: ActionRow[] | undefined): number {
  if (!actions) return 0
  const pixel = getAction(actions, 'offsite_conversion.fb_pixel_purchase')
  const generic = getAction(actions, 'purchase')
  const omni = getAction(actions, 'omni_purchase')
  return Math.max(generic, pixel, omni)
}

function buildSummary(s: Record<string, unknown>): MetricsSummary {
  const actions = s.actions as ActionRow[] | undefined
  const actionValues = s.action_values as ActionRow[] | undefined
  const spend = Number(s.spend ?? 0)
  const leads = getLeads(actions)
  const purchaseValue = getPurchaseValue(actionValues)
  const purchases = getPurchaseCount(actions)
  const engagement = Number(s.inline_post_engagement ?? 0) || getActions(actions, ['post_engagement'])
  const conversations = getConversations(actions)
  const linkClicks = getActions(actions, ['link_click', 'outbound_click'])
  const videoViews = getActions(actions, ['video_view'])
  const landingPageViews = getAction(actions, 'landing_page_view')
  const reactions = getActions(actions, ['post_reaction', 'like', 'love', 'haha', 'wow', 'sad', 'angry'])
  const comments = getAction(actions, 'comment')

  return {
    spend,
    impressions: Number(s.impressions ?? 0),
    clicks: Number(s.clicks ?? 0),
    unique_clicks: Number(s.unique_clicks ?? 0),
    ctr: Number(s.ctr ?? 0),
    cpm: Number(s.cpm ?? 0),
    cpc: Number(s.cpc ?? 0) || (Number(s.clicks ?? 0) > 0 ? spend / Number(s.clicks) : 0),
    cpl: leads > 0 ? spend / leads : null,
    leads,
    purchases,
    purchase_value: purchaseValue,
    roas: purchaseValue > 0 && spend > 0 ? purchaseValue / spend : null,
    cpa: purchases > 0 ? spend / purchases : null,
    frequency: Number(s.frequency ?? 0),
    reach: Number(s.reach ?? 0),
    post_engagement: engagement,
    cost_per_engagement: engagement > 0 ? spend / engagement : null,
    reactions,
    comments,
    video_views: videoViews,
    link_clicks: linkClicks,
    cost_per_link_click: linkClicks > 0 ? spend / linkClicks : null,
    landing_page_views: landingPageViews,
    messaging_conversations: conversations,
    cost_per_conversation: conversations > 0 ? spend / conversations : null,
    form_leads: getFormLeads(actions),
    site_leads: getSiteLeads(actions),
    custom_conversions: getCustomConversions(actions),
    results: getResults(actions),
    cost_per_result: getResults(actions) > 0 ? spend / getResults(actions) : null,
  }
}

/**
 * Período anterior equivalente, na data do Brasil. "Hoje" compara com ontem; 7/14/30 dias (que não incluem hoje) com os N dias
 * imediatamente antes; "este mês" (do dia 1 até hoje) com o mesmo trecho do mês passado.
 */
function prevTimeRange(datePreset: DatePreset, nowMs = Date.now()): string {
  const br = new Date(nowMs - 3 * 3600 * 1000) // relógio do Brasil lido em UTC
  const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const today = day(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate())
  const shift = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
  let since: Date, until: Date
  if (datePreset === 'last_month') {
    // o mês fechado antes do mês passado (mesmo recorte inteiro, para comparar mês com mês)
    since = day(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)
    until = day(today.getUTCFullYear(), today.getUTCMonth() - 1, 0)
  } else if (datePreset === 'this_month') {
    const first = day(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    const lastOfPrev = day(today.getUTCFullYear(), today.getUTCMonth(), 0).getUTCDate()
    since = first
    until = day(first.getUTCFullYear(), first.getUTCMonth(), Math.min(today.getUTCDate(), lastOfPrev))
  } else if (datePreset === 'today') {
    since = until = shift(today, -1)
  } else {
    const days = { last_7d: 7, last_14d: 14, last_30d: 30 }[datePreset] ?? 7
    until = shift(today, -1 - days)
    since = shift(until, -days + 1)
  }
  return `{"since":"${fmt(since)}","until":"${fmt(until)}"}`
}

export type InsightRow = Record<string, unknown>

/** Dados brutos da Meta (ao vivo ou lidos do banco) que o painel transforma na resposta de métricas. */
export interface RawMetrics {
  account: { name?: string; currency?: string }
  summaryRow: InsightRow | undefined
  prevRow?: InsightRow | undefined
  dailyRows?: InsightRow[]
  campaigns: Array<{ id: string; name: string; effective_status?: string; daily_budget?: string | number | null; insight?: InsightRow }>
  /** id da conversão personalizada -> nome dado na Meta */
  customNames?: Record<string, string>
}

/** Monta a resposta de métricas. Único caminho de montagem: vale para o modo ao vivo e para os dados do banco. */
export function assembleMetrics(adAccountId: string, datePreset: DatePreset, raw: RawMetrics, generatedAt = new Date().toISOString()): MetricsResponse {
  const summary = buildSummary(raw.summaryRow ?? {})
  const summary_prev = raw.prevRow ? buildSummary(raw.prevRow) : undefined

  let daily: DailySummary | undefined
  const rows = raw.dailyRows ?? []
  if (rows.length > 1) {
    const perDay = rows.map(buildSummary)
    const metrics: Record<string, number[]> = {}
    for (const k of Object.keys(perDay[0])) metrics[k] = perDay.map(day => Number((day as unknown as Record<string, number | null>)[k]) || 0)
    daily = {
      dates: rows.map(r => {
        const parts = String(r.date_start ?? '').split('-')
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(r.date_start ?? '')
      }),
      spend: rows.map(r => Number(r.spend ?? 0)),
      leads: rows.map(r => getLeads(r.actions as ActionRow[] | undefined)),
      cpl: rows.map(r => {
        const l = getLeads(r.actions as ActionRow[] | undefined)
        const sp = Number(r.spend ?? 0)
        return l > 0 ? sp / l : 0
      }),
      impressions: rows.map(r => Number(r.impressions ?? 0)),
      ctr: rows.map(r => Number(r.ctr ?? 0)),
      metrics,
    }
  }

  const campaigns: CampaignRow[] = raw.campaigns.map(c => {
    const cs = buildSummary(c.insight ?? {})
    return {
      id: c.id,
      name: c.name,
      status: c.effective_status ?? 'UNKNOWN',
      spend: cs.spend,
      impressions: cs.impressions,
      clicks: cs.clicks,
      ctr: cs.ctr,
      cpl: cs.cpl,
      leads: cs.leads,
      roas: cs.roas,
      frequency: cs.frequency,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      results: cs.results,
      cost_per_result: cs.cost_per_result,
      conversions: listConversions((c.insight?.actions as ActionRow[] | undefined), cs.spend, raw.customNames),
    }
  })

  return {
    account_id: adAccountId,
    account_name: raw.account.name ?? '',
    currency: raw.account.currency ?? 'BRL',
    date_preset: datePreset,
    generated_at: generatedAt,
    summary,
    summary_prev,
    daily,
    campaigns,
    conversions: listConversions((raw.summaryRow?.actions as ActionRow[] | undefined), summary.spend, raw.customNames),
    result_kind: detectKind(resultCounts(raw.summaryRow?.actions as ActionRow[] | undefined)),
  }
}

/** Modo ao vivo (caminho antigo, até o corte para leitura só do banco). */
const namesCache = new Map<string, { at: number; names: Record<string, string> }>()

/** Nomes das conversões personalizadas da conta (id -> nome). Guardado por 1 h; falha aqui nunca derruba as métricas. */
async function customNamesFor(adAccountId: string, ctx: { accountId: string; clientId?: string | null; token: string; purpose: string }): Promise<Record<string, string>> {
  const hit = namesCache.get(adAccountId)
  if (hit && Date.now() - hit.at < 3_600_000) return hit.names
  const r = await legacyGet<{ data?: Array<{ id: string; name?: string }> }>(`${adAccountId}/customconversions?fields=id,name&limit=100`, { ...ctx, purpose: 'painel:conversoes' })
  const names = r.ok ? Object.fromEntries((r.data.data ?? []).map(c => [c.id, c.name ?? c.id])) : {}
  namesCache.set(adAccountId, { at: Date.now(), names })
  return names
}

export async function fetchMetrics(
  token: string,
  adAccountId: string,
  datePreset: DatePreset,
  clientId?: string | null,
  onRaw?: (raw: RawMetrics) => Promise<void> | void,
): Promise<MetricsResponse> {
  const ctx = { accountId: adAccountId, clientId, token, purpose: 'painel:metricas' }
  type Rows = { data?: InsightRow[] }

  const accountRes = await legacyGet<{ name?: string; currency?: string }>(`${adAccountId}?fields=name,currency`, ctx)
  if (!accountRes.ok) throw new Error(errMsg(accountRes, 'Failed to fetch account info'))

  const insightsRes = await legacyGet<Rows>(`${adAccountId}/insights?fields=${INSIGHT_FIELDS}&date_preset=${datePreset}`, ctx)
  if (!insightsRes.ok) throw new Error(errMsg(insightsRes, 'Failed to fetch account insights'))

  const prevRes = await legacyGet<Rows>(`${adAccountId}/insights?fields=${INSIGHT_FIELDS}&time_range=${encodeURIComponent(prevTimeRange(datePreset))}`, ctx)
  const dailyRes = await legacyGet<Rows>(`${adAccountId}/insights?fields=${INSIGHT_FIELDS}&date_preset=${datePreset}&time_increment=1&limit=100`, ctx)

  const campaignsRes = await legacyGet<{ data?: Array<Record<string, unknown>> }>(
    `${adAccountId}/campaigns?fields=id,name,effective_status,daily_budget,insights.date_preset(${datePreset}){${INSIGHT_FIELDS}}&limit=50`, ctx)
  if (!campaignsRes.ok) throw new Error(errMsg(campaignsRes, 'Failed to fetch campaigns'))

  const customNames = await customNamesFor(adAccountId, ctx)

  const raw: RawMetrics = {
    customNames,
    account: accountRes.data,
    summaryRow: insightsRes.data.data?.[0],
    prevRow: prevRes.ok ? prevRes.data.data?.[0] : undefined,
    dailyRows: dailyRes.ok ? dailyRes.data.data : undefined,
    campaigns: (campaignsRes.data.data ?? []).map(c => ({
      id: c.id as string, name: c.name as string, effective_status: c.effective_status as string | undefined,
      daily_budget: c.daily_budget as string | undefined,
      insight: (c.insights as { data?: InsightRow[] } | undefined)?.data?.[0],
    })),
  }
  try { await onRaw?.(raw) } catch { /* guardar no banco é um bônus: nunca derruba a tela do cliente */ }
  return assembleMetrics(adAccountId, datePreset, raw)
}

export { prevTimeRange, INSIGHT_FIELDS }
