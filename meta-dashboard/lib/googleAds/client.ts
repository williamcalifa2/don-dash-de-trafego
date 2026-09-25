import { campaignsQuery, currencyQuery, dailyQuery, parseCampaigns, parseDaily, parseSummary, previousRange, rangeFor, summaryQuery, type GCampaign, type GDay, type GRow, type GSummary, type GooglePreset } from './gaql'
import { mockGoogle } from './mock'

export interface GoogleMetrics { currency: string; accountName: string | null; range: { since: string; until: string }; summary: GSummary; previous: GSummary; daily: GDay[]; campaigns: GCampaign[]; source: 'live' | 'demo' }

/** live: credenciais completas · demo: GOOGLE_ADS_MOCK=1 (dados de exemplo, nunca em produção real) · off: falta configurar. */
export function googleAdsMode(): 'live' | 'demo' | 'off' {
  const e = process.env
  if (e.GOOGLE_ADS_DEVELOPER_TOKEN && e.GOOGLE_ADS_CLIENT_ID && e.GOOGLE_ADS_CLIENT_SECRET && e.GOOGLE_ADS_REFRESH_TOKEN) return 'live'
  return e.GOOGLE_ADS_MOCK === '1' ? 'demo' : 'off'
}

const API = 'https://googleads.googleapis.com/v20'
let tokenCache: { token: string; exp: number } | null = null

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_ADS_CLIENT_ID!, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!, grant_type: 'refresh_token' }),
  })
  const j = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number }
  if (!res.ok || !j.access_token) throw new GoogleAdsError('Falha ao autenticar no Google Ads.', 'auth')
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
  return j.access_token
}

export class GoogleAdsError extends Error {
  constructor(msg: string, public kind: 'auth' | 'access' | 'quota' | 'other') { super(msg) }
}

/** Uma consulta GAQL (somente leitura). `login-customer-id` = conta gerente (MCC), quando as contas dos clientes são dela. */
export async function gaql(customerId: string, query: string): Promise<GRow[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, 'Content-Type': 'application/json',
  }
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, '')
  const res = await fetch(`${API}/customers/${customerId}/googleAds:search`, { method: 'POST', headers, body: JSON.stringify({ query, pageSize: 1000 }), cache: 'no-store' })
  const j = await res.json().catch(() => ({})) as { results?: GRow[]; error?: { message?: string; status?: string } }
  if (!res.ok) {
    const st = j.error?.status ?? ''
    throw new GoogleAdsError(j.error?.message ?? `Google Ads ${res.status}`, res.status === 429 || st === 'RESOURCE_EXHAUSTED' ? 'quota' : res.status === 401 ? 'auth' : res.status === 403 ? 'access' : 'other')
  }
  return j.results ?? []
}

const cache = new Map<string, { at: number; data: GoogleMetrics }>()
const TTL = 5 * 60_000

export async function fetchGoogleMetrics(customerId: string, preset: GooglePreset): Promise<GoogleMetrics> {
  const mode = googleAdsMode()
  const range = rangeFor(preset)
  if (mode === 'demo') return mockGoogle(customerId, range)
  const key = `${customerId}:${preset}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const prev = previousRange(range)
  const [cur, prevRows, daily, camps, meta] = await Promise.all([
    gaql(customerId, summaryQuery(range)), gaql(customerId, summaryQuery(prev)), gaql(customerId, dailyQuery(range)), gaql(customerId, campaignsQuery(range)), gaql(customerId, currencyQuery()),
  ])
  const data: GoogleMetrics = {
    currency: meta[0]?.customer?.currencyCode ?? 'BRL', accountName: meta[0]?.customer?.descriptiveName ?? null, range,
    summary: parseSummary(cur), previous: parseSummary(prevRows), daily: parseDaily(daily), campaigns: parseCampaigns(camps), source: 'live',
  }
  cache.set(key, { at: Date.now(), data })
  return data
}
