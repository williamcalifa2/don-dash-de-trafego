import crypto from 'node:crypto'
import { batchOne, batchTwo, cleanPropertyId, parseDaily, parseLive, parseRows, parseSummary, prettyDevice, prettySource, type GaReport, type GaRange, type GaResponse } from './report'
import { mockGa4 } from './mock'
import { previousRange } from '../googleAds/gaql'

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const API = 'https://analyticsdata.googleapis.com/v1beta'

interface ServiceAccount { client_email: string; private_key: string }
interface OAuthCreds { clientId: string; clientSecret: string; refreshToken: string }

/** Conta de serviço (JSON, ou o JSON em base64). GA4_SERVICE_ACCOUNT_JSON tem prioridade; senão usa a mesma das planilhas. */
export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  for (const text of [raw, (() => { try { return Buffer.from(raw, 'base64').toString('utf8') } catch { return '' } })()]) {
    try { const j = JSON.parse(text) as Partial<ServiceAccount>; if (j.client_email && j.private_key) return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, '\n') } } catch { /* tenta o próximo formato */ }
  }
  return null
}

/** Credenciais OAuth (compatível com as credenciais do Google Ads / Google Cloud). */
export function oauthCredentials(): OAuthCreds | null {
  const e = process.env
  const clientId = e.GA4_CLIENT_ID || e.GOOGLE_ADS_CLIENT_ID || e.GOOGLE_CLIENT_ID
  const clientSecret = e.GA4_CLIENT_SECRET || e.GOOGLE_ADS_CLIENT_SECRET || e.GOOGLE_CLIENT_SECRET
  const refreshToken = e.GA4_REFRESH_TOKEN || e.GOOGLE_ADS_REFRESH_TOKEN || e.GOOGLE_REFRESH_TOKEN
  if (clientId && clientSecret && refreshToken) {
    return { clientId, clientSecret, refreshToken }
  }
  return null
}

/** live: conta de serviço ou OAuth configurado · demo: GA4_MOCK=1 · off: falta configurar. */
export function ga4Mode(): 'live' | 'demo' | 'off' {
  if (serviceAccount() || oauthCredentials()) return 'live'
  return process.env.GA4_MOCK === '1' ? 'demo' : 'off'
}

export class Ga4Error extends Error {
  constructor(msg: string, public kind: 'auth' | 'access' | 'quota' | 'notfound' | 'disabled' | 'other') { super(msg) }
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
let tokenCache: { token: string; exp: number } | null = null

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token

  const sa = serviceAccount()
  if (sa) {
    const iat = Math.floor(Date.now() / 1000)
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) })
    const j = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number }
    if (!res.ok || !j.access_token) throw new Ga4Error('Falha ao autenticar no Google Analytics com Conta de Serviço.', 'auth')
    tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
    return j.access_token
  }

  const oauth = oauthCredentials()
  if (oauth) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: oauth.refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const j = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number }
    if (!res.ok || !j.access_token) throw new Ga4Error('Falha ao autenticar no Google Analytics com OAuth.', 'auth')
    tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 }
    return j.access_token
  }

  throw new Ga4Error('Nenhuma credencial do Google Analytics encontrada (configure conta de serviço ou OAuth).', 'auth')
}

async function call<T>(property: string, method: string, body: unknown): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API}/properties/${property}:${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const j = await res.json().catch(() => ({})) as T & { error?: { message?: string; status?: string } }
  if (!res.ok) {
    const msg = j.error?.message ?? `Google Analytics ${res.status}`
    const st = j.error?.status ?? ''
    const isDisabled = msg.toLowerCase().includes('disabled') || msg.toLowerCase().includes('has not been used in project') || msg.toLowerCase().includes('enable it')
    const kind = isDisabled ? 'disabled' : res.status === 429 || st === 'RESOURCE_EXHAUSTED' ? 'quota' : res.status === 403 || st === 'PERMISSION_DENIED' ? 'access' : res.status === 404 ? 'notfound' : res.status === 401 ? 'auth' : 'other'
    throw new Ga4Error(msg, kind)
  }
  return j
}

const cache = new Map<string, { at: number; data: GaReport }>()
const TTL = 10 * 60_000

export async function fetchGa4(property: string, range: GaRange): Promise<GaReport> {
  const mode = ga4Mode()
  if (mode === 'demo') return mockGa4(property, range)
  const key = `${property}:${range.since}:${range.until}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const prev = previousRange(range)
  const [a, b, live] = await Promise.all([
    call<{ reports?: GaResponse[] }>(property, 'batchRunReports', { requests: batchOne(range, prev) }),
    call<{ reports?: GaResponse[] }>(property, 'batchRunReports', { requests: batchTwo(range) }),
    call<GaResponse>(property, 'runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }).then(parseLive).catch(() => null),
  ])
  const [sum, daily, src, camp, pages] = a.reports ?? []
  const [dev, city] = b.reports ?? []
  const { current, previous } = parseSummary(sum)
  const data: GaReport = {
    range, summary: current, previous, daily: parseDaily(daily),
    sources: parseRows(src, { pretty: prettySource }), campaigns: parseRows(camp, { hideNotSet: true }), pages: parseRows(pages), devices: parseRows(dev, { pretty: prettyDevice }), cities: parseRows(city, { hideNotSet: true }),
    live, source: 'live',
  }
  cache.set(key, { at: Date.now(), data })
  return data
}

export { cleanPropertyId }
