import type { MetaConfig } from './config'
import { redact } from './redact'

export interface BucEntry {
  type?: string
  call_count: number
  total_cputime: number
  total_time: number
  estimated_time_to_regain_access: number
}

export interface UsageSnapshot {
  app: { call_count: number; total_cputime: number; total_time: number } | null
  buc: Record<string, BucEntry[]>
  adAccount: { util_pct: number; reset_seconds: number; tier?: string } | null
  /** maior percentual entre app, BUC e conta */
  maxPct: number
  appMaxPct: number
  /** maior percentual de BUC/conta (por conta de anúncio) */
  accountMaxPct: number
  /** maior tempo estimado (minutos) para recuperar acesso */
  regainMinutes: number
}

const parseJson = (raw: string | null): unknown => {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function parseUsage(get: (name: string) => string | null): UsageSnapshot {
  const appRaw = parseJson(get('x-app-usage')) as Record<string, unknown> | null
  const bucRaw = parseJson(get('x-business-use-case-usage')) as Record<string, Array<Record<string, unknown>>> | null
  const adRaw = parseJson(get('x-ad-account-usage')) as Record<string, unknown> | null

  const app = appRaw ? { call_count: n(appRaw.call_count), total_cputime: n(appRaw.total_cputime), total_time: n(appRaw.total_time) } : null
  const buc: Record<string, BucEntry[]> = {}
  if (bucRaw && typeof bucRaw === 'object') {
    for (const [id, entries] of Object.entries(bucRaw)) {
      if (!Array.isArray(entries)) continue
      buc[id] = entries.map(e => ({
        type: typeof e.type === 'string' ? e.type : undefined,
        call_count: n(e.call_count), total_cputime: n(e.total_cputime), total_time: n(e.total_time),
        estimated_time_to_regain_access: n(e.estimated_time_to_regain_access),
      }))
    }
  }
  const adAccount = adRaw ? { util_pct: n(adRaw.acc_id_util_pct), reset_seconds: n(adRaw.reset_time_duration), tier: typeof adRaw.ads_api_access_tier === 'string' ? adRaw.ads_api_access_tier : undefined } : null

  const appMaxPct = app ? Math.max(app.call_count, app.total_cputime, app.total_time) : 0
  const bucEntries = Object.values(buc).flat()
  const accountMaxPct = Math.max(0, adAccount?.util_pct ?? 0, ...bucEntries.map(e => Math.max(e.call_count, e.total_cputime, e.total_time)))
  const regainMinutes = Math.max(0, ...bucEntries.map(e => e.estimated_time_to_regain_access))
  return { app, buc, adAccount, maxPct: Math.max(appMaxPct, accountMaxPct), appMaxPct, accountMaxPct, regainMinutes }
}

export type MetaErrorKind = 'rate_limit' | 'token' | 'permission' | 'transient' | 'client' | 'unknown'

export interface MetaErrorInfo {
  kind: MetaErrorKind
  code?: number
  subcode?: number
  status: number
  message: string
  type?: string
}

const TOKEN_CODES = new Set([190, 102, 458, 459, 460, 463, 464, 467])

/** Classifica o erro da Meta. Só "limite", "permissão" e "token" mudam o comportamento; nenhum deles tem retry. */
export function classifyError(status: number, body: unknown, cfg: Pick<MetaConfig, 'rateLimitCodes' | 'retryStatuses'>): MetaErrorInfo {
  const e = (body && typeof body === 'object' ? (body as { error?: Record<string, unknown> }).error : undefined) ?? {}
  const code = typeof e.code === 'number' ? e.code : undefined
  const subcode = typeof e.error_subcode === 'number' ? e.error_subcode : undefined
  const message = redact(typeof e.message === 'string' ? e.message : `Erro HTTP ${status}`)
  const type = typeof e.type === 'string' ? e.type : undefined
  const base = { code, subcode, status, message, type }
  if (status === 429 || (code !== undefined && cfg.rateLimitCodes.includes(code))) return { kind: 'rate_limit', ...base }
  if (code !== undefined && TOKEN_CODES.has(code)) return { kind: 'token', ...base }
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) return { kind: 'permission', ...base }
  if (cfg.retryStatuses.includes(status) || code === 1 || code === 2) return { kind: 'transient', ...base }
  if (status >= 400 && status < 500) return { kind: 'client', ...base }
  return { kind: 'unknown', ...base }
}
