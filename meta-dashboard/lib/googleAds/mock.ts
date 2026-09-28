import { derive, type GCampaign, type Range } from './gaql'
import type { GoogleMetrics } from './client'

/** Dados de exemplo estáveis (mesma conta e período = mesmos números). Só com GOOGLE_ADS_MOCK=1. */
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000 }
}
const days = (r: Range) => { const out: string[] = []; for (let d = new Date(`${r.since}T00:00:00Z`); d <= new Date(`${r.until}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10)); return out }

const CAMPS: Array<[string, string, string]> = [['Pesquisa | Marca', 'SEARCH', 'ENABLED'], ['Pesquisa | Genéricas', 'SEARCH', 'ENABLED'], ['Performance Max | Geral', 'PERFORMANCE_MAX', 'ENABLED'], ['Display | Remarketing', 'DISPLAY', 'PAUSED'], ['YouTube | Institucional', 'VIDEO', 'ENABLED']]

export function mockGoogle(customerId: string, range: Range): GoogleMetrics {
  const r = rng(`${customerId}:${range.since}:${range.until}`)
  const ds = days(range)
  const daily = ds.map(date => { const spend = 80 + r() * 120; const impressions = Math.round(spend * (40 + r() * 30)); const clicks = Math.round(impressions * (0.02 + r() * 0.03)); return { date, spend: Math.round(spend * 100) / 100, impressions, clicks, conversions: Math.round(clicks * (0.03 + r() * 0.05) * 10) / 10 } })
  const sum = (k: 'spend' | 'impressions' | 'clicks' | 'conversions') => daily.reduce((n, d) => n + d[k], 0)
  const mk = (scale: number) => derive({ spend: Math.round(sum('spend') * scale * 100) / 100, impressions: Math.round(sum('impressions') * scale), clicks: Math.round(sum('clicks') * scale), conversions: Math.round(sum('conversions') * scale * 10) / 10, conversionValue: Math.round(sum('conversions') * scale * 180) })
  const weights = CAMPS.map(() => 0.2 + r())
  const wsum = weights.reduce((a, b) => a + b, 0)
  const campaigns: GCampaign[] = CAMPS.map(([name, channel, status], i) => {
    const w = weights[i] / wsum
    const t = { spend: Math.round(sum('spend') * w * 100) / 100, impressions: Math.round(sum('impressions') * w), clicks: Math.round(sum('clicks') * w), conversions: Math.round(sum('conversions') * w * (0.6 + r() * 0.8) * 10) / 10, conversionValue: 0 }
    return { ...derive({ ...t, conversionValue: Math.round(t.conversions * 180) }), id: String(1000 + i), name, status, channel, dailyBudget: Math.round(60 + r() * 140) }
  }).sort((a, b) => b.spend - a.spend)
  const searchTerms = [
    { searchTerm: 'comprar online com desconto', impressions: Math.round(sum('impressions') * 0.28), clicks: Math.round(sum('clicks') * 0.32), spend: Math.round(sum('spend') * 0.30 * 100) / 100, conversions: Math.round(sum('conversions') * 0.35 * 10) / 10, ctr: 0, cpc: 0 },
    { searchTerm: 'melhor preço entrega rapida', impressions: Math.round(sum('impressions') * 0.22), clicks: Math.round(sum('clicks') * 0.24), spend: Math.round(sum('spend') * 0.23 * 100) / 100, conversions: Math.round(sum('conversions') * 0.26 * 10) / 10, ctr: 0, cpc: 0 },
    { searchTerm: 'promoção oficial do mes', impressions: Math.round(sum('impressions') * 0.18), clicks: Math.round(sum('clicks') * 0.19), spend: Math.round(sum('spend') * 0.18 * 100) / 100, conversions: Math.round(sum('conversions') * 0.18 * 10) / 10, ctr: 0, cpc: 0 },
    { searchTerm: 'loja confiavel garantia', impressions: Math.round(sum('impressions') * 0.14), clicks: Math.round(sum('clicks') * 0.13), spend: Math.round(sum('spend') * 0.14 * 100) / 100, conversions: Math.round(sum('conversions') * 0.11 * 10) / 10, ctr: 0, cpc: 0 },
    { searchTerm: 'cupom frete gratis', impressions: Math.round(sum('impressions') * 0.10), clicks: Math.round(sum('clicks') * 0.08), spend: Math.round(sum('spend') * 0.09 * 100) / 100, conversions: Math.round(sum('conversions') * 0.06 * 10) / 10, ctr: 0, cpc: 0 },
  ].map(st => ({
    ...st,
    ctr: st.impressions > 0 ? (st.clicks / st.impressions) * 100 : 0,
    cpc: st.clicks > 0 ? st.spend / st.clicks : 0,
  }))

  const regions = [
    { region: 'São Paulo (SP)', spend: Math.round(sum('spend') * 0.45 * 100) / 100, impressions: Math.round(sum('impressions') * 0.44), clicks: Math.round(sum('clicks') * 0.46), conversions: Math.round(sum('conversions') * 0.48 * 10) / 10, ctr: 0, cpc: 0 },
    { region: 'Rio de Janeiro (RJ)', spend: Math.round(sum('spend') * 0.22 * 100) / 100, impressions: Math.round(sum('impressions') * 0.23), clicks: Math.round(sum('clicks') * 0.21), conversions: Math.round(sum('conversions') * 0.20 * 10) / 10, ctr: 0, cpc: 0 },
    { region: 'Minas Gerais (MG)', spend: Math.round(sum('spend') * 0.16 * 100) / 100, impressions: Math.round(sum('impressions') * 0.15), clicks: Math.round(sum('clicks') * 0.16), conversions: Math.round(sum('conversions') * 0.15 * 10) / 10, ctr: 0, cpc: 0 },
    { region: 'Paraná (PR)', spend: Math.round(sum('spend') * 0.10 * 100) / 100, impressions: Math.round(sum('impressions') * 0.10), clicks: Math.round(sum('clicks') * 0.10), conversions: Math.round(sum('conversions') * 0.10 * 10) / 10, ctr: 0, cpc: 0 },
    { region: 'Rio Grande do Sul (RS)', spend: Math.round(sum('spend') * 0.07 * 100) / 100, impressions: Math.round(sum('impressions') * 0.08), clicks: Math.round(sum('clicks') * 0.07), conversions: Math.round(sum('conversions') * 0.07 * 10) / 10, ctr: 0, cpc: 0 },
  ].map(reg => ({
    ...reg,
    ctr: reg.impressions > 0 ? (reg.clicks / reg.impressions) * 100 : 0,
    cpc: reg.clicks > 0 ? reg.spend / reg.clicks : 0,
  }))

  return { currency: 'BRL', accountName: 'Conta de demonstração', range, summary: mk(1), previous: mk(0.7 + r() * 0.5), daily, campaigns, searchTerms, regions, source: 'demo' }
}
