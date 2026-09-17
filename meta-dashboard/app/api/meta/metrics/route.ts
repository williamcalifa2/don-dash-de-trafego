import { NextRequest, NextResponse } from 'next/server'
import { fetchMetrics, type DatePreset, type MetricsResponse } from '@/lib/meta'

function pastDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  })
}

const MOCK: MetricsResponse = {
  account_id: 'act_demo',
  account_name: 'Agência Demo — Conta Principal',
  currency: 'BRL',
  date_preset: 'last_7_days',
  generated_at: new Date().toISOString(),
  is_mock: true,
  summary: {
    spend: 14320.50,
    impressions: 892400,
    clicks: 11340,
    ctr: 1.27,
    cpm: 16.05,
    cpl: 53.78,
    leads: 266,
    purchases: 38,
    purchase_value: 59876,
    roas: 4.18,
    frequency: 2.4,
    reach: 371830,
  },
  daily: {
    dates: pastDates(7),
    spend:       [1820, 2100, 1950, 2280, 2100, 1890, 2180],
    leads:       [34,   41,   38,   45,   39,   34,   35],
    cpl:         [53.5, 51.2, 51.3, 50.7, 53.8, 55.6, 62.3],
    impressions: [118000, 132000, 124000, 142000, 128000, 114000, 134000],
    ctr:         [1.21, 1.30, 1.27, 1.33, 1.25, 1.18, 1.29],
  },
  campaigns: [
    {
      id: 'c1',
      name: 'Captação B2B — Lead Form',
      status: 'ACTIVE',
      spend: 5840.00,
      impressions: 312000,
      clicks: 4280,
      ctr: 1.37,
      cpl: 45.23,
      leads: 129,
      roas: null,
      frequency: 2.1,
      daily_budget: 900,
    },
    {
      id: 'c2',
      name: 'Remarketing — MQL Quente',
      status: 'ACTIVE',
      spend: 3210.00,
      impressions: 198500,
      clicks: 3100,
      ctr: 1.56,
      cpl: 58.36,
      leads: 55,
      roas: 6.2,
      frequency: 3.8,
      daily_budget: 500,
    },
    {
      id: 'c3',
      name: 'Cold — Lookalike 1% Compradores',
      status: 'IN_PROCESS',
      spend: 2870.50,
      impressions: 241000,
      clicks: 2640,
      ctr: 1.10,
      cpl: 71.76,
      leads: 40,
      roas: 2.8,
      frequency: 1.9,
      daily_budget: 450,
    },
    {
      id: 'c4',
      name: 'Awareness — Vídeo Institucional',
      status: 'ACTIVE',
      spend: 1480.00,
      impressions: 112000,
      clicks: 980,
      ctr: 0.88,
      cpl: null,
      leads: 0,
      roas: null,
      frequency: 2.9,
      daily_budget: 200,
    },
    {
      id: 'c5',
      name: 'Black Friday — Antecipação',
      status: 'PAUSED',
      spend: 920.00,
      impressions: 28900,
      clicks: 340,
      ctr: 1.18,
      cpl: 215.00,
      leads: 4,
      roas: 1.1,
      frequency: 4.2,
      daily_budget: null,
    },
  ],
}

export async function GET(req: NextRequest) {
  const token = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID

  const { searchParams } = new URL(req.url)
  const datePreset = (searchParams.get('date_preset') ?? 'last_7d') as DatePreset

  const validPresets: DatePreset[] = ['today', 'last_7d', 'last_14d', 'last_30d']
  if (!validPresets.includes(datePreset)) {
    return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })
  }

  if (!token || !accountId) {
    return NextResponse.json({ ...MOCK, date_preset: datePreset, generated_at: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  try {
    const data = await fetchMetrics(token, accountId, datePreset)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
