export type DatePreset = 'today' | 'last_7d' | 'last_30d' | 'last_14d'

export interface MetricsSummary {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpm: number
  cpl: number | null
  leads: number
  purchases: number
  purchase_value: number
  roas: number | null
  frequency: number
  reach: number
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
}

export interface DailySummary {
  dates: string[]
  spend: number[]
  leads: number[]
  cpl: number[]
  impressions: number[]
  ctr: number[]
}

export interface MetricsResponse {
  account_id: string
  account_name: string
  currency: string
  date_preset: DatePreset
  generated_at: string
  is_mock?: boolean
  summary: MetricsSummary
  summary_prev?: MetricsSummary
  daily?: DailySummary
  campaigns: CampaignRow[]
}

const GRAPH_BASE = 'https://graph.facebook.com/v20.0'

const INSIGHT_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpm',
  'frequency',
  'reach',
  'actions',
  'action_values',
].join(',')

function getLeads(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions) return 0
  const leadTypes = [
    'lead',
    'onsite_conversion.lead_grouped',
    'leadgen.other',
    'offsite_conversion.fb_pixel_lead',
  ]
  return actions
    .filter((a) => leadTypes.includes(a.action_type))
    .reduce((sum, a) => sum + Number(a.value), 0)
}

function getPurchaseValue(actionValues: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actionValues) return 0
  return actionValues
    .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')
    .reduce((sum, a) => sum + Number(a.value), 0)
}

function getPurchaseCount(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions) return 0
  return actions
    .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')
    .reduce((sum, a) => sum + Number(a.value), 0)
}

export async function fetchMetrics(
  token: string,
  adAccountId: string,
  datePreset: DatePreset
): Promise<MetricsResponse> {
  // Fetch account info
  const accountRes = await fetch(
    `${GRAPH_BASE}/${adAccountId}?fields=name,currency&access_token=${token}`
  )
  if (!accountRes.ok) {
    const err = await accountRes.json()
    throw new Error(err?.error?.message ?? 'Failed to fetch account info')
  }
  const account = await accountRes.json()

  // Fetch account-level insights (summary)
  const insightsRes = await fetch(
    `${GRAPH_BASE}/${adAccountId}/insights?fields=${INSIGHT_FIELDS}&date_preset=${datePreset}&access_token=${token}`
  )
  if (!insightsRes.ok) {
    const err = await insightsRes.json()
    throw new Error(err?.error?.message ?? 'Failed to fetch account insights')
  }
  const insightsData = await insightsRes.json()
  const s = insightsData.data?.[0] ?? {}

  const totalSpend = Number(s.spend ?? 0)
  const totalLeads = getLeads(s.actions)
  const totalPurchaseValue = getPurchaseValue(s.action_values)
  const totalPurchases = getPurchaseCount(s.actions)

  const summary: MetricsSummary = {
    spend: totalSpend,
    impressions: Number(s.impressions ?? 0),
    clicks: Number(s.clicks ?? 0),
    ctr: Number(s.ctr ?? 0),
    cpm: Number(s.cpm ?? 0),
    cpl: totalLeads > 0 ? totalSpend / totalLeads : null,
    leads: totalLeads,
    purchases: totalPurchases,
    purchase_value: totalPurchaseValue,
    roas: totalPurchaseValue > 0 ? totalPurchaseValue / totalSpend : null,
    frequency: Number(s.frequency ?? 0),
    reach: Number(s.reach ?? 0),
  }

  // Fetch campaigns + their insights
  const campaignsRes = await fetch(
    `${GRAPH_BASE}/${adAccountId}/campaigns?fields=id,name,effective_status,daily_budget,insights.date_preset(${datePreset}){${INSIGHT_FIELDS}}&limit=50&access_token=${token}`
  )
  if (!campaignsRes.ok) {
    const err = await campaignsRes.json()
    throw new Error(err?.error?.message ?? 'Failed to fetch campaigns')
  }
  const campaignsData = await campaignsRes.json()

  const campaigns: CampaignRow[] = (campaignsData.data ?? []).map((c: Record<string, unknown>) => {
    type InsightRecord = {
      data?: Array<{
        spend?: string
        impressions?: string
        clicks?: string
        ctr?: string
        frequency?: string
        actions?: Array<{ action_type: string; value: string }>
        action_values?: Array<{ action_type: string; value: string }>
      }>
    }
    const ins = (c.insights as InsightRecord)?.data?.[0] ?? {}
    const cSpend = Number(ins.spend ?? 0)
    const cLeads = getLeads(ins.actions)
    const cPurchaseValue = getPurchaseValue(ins.action_values)

    return {
      id: c.id as string,
      name: c.name as string,
      status: (c.effective_status as string) ?? 'UNKNOWN',
      spend: cSpend,
      impressions: Number(ins.impressions ?? 0),
      clicks: Number(ins.clicks ?? 0),
      ctr: Number(ins.ctr ?? 0),
      cpl: cLeads > 0 ? cSpend / cLeads : null,
      leads: cLeads,
      roas: cPurchaseValue > 0 ? cPurchaseValue / cSpend : null,
      frequency: Number(ins.frequency ?? 0),
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    }
  })

  return {
    account_id: adAccountId,
    account_name: account.name,
    currency: account.currency ?? 'BRL',
    date_preset: datePreset,
    generated_at: new Date().toISOString(),
    summary,
    campaigns,
  }
}
