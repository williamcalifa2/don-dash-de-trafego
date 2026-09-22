/**
 * Validação diária do token: válido? de qual app? quais escopos? quando expira?
 * - escopo de escrita não aceito explicitamente (META_ACCEPTED_WRITE_SCOPES) = o pipeline NÃO roda (alerta crítico);
 * - token inválido = pausa geral e alerta; nada insiste;
 * - alerta N dias antes de o token expirar e M dias antes de a versão da API ser desativada.
 */
import crypto from 'node:crypto'
import type { MetaConfig } from './config'
import type { LimitController, LimitStore } from './limits'
import type { MetaResult } from './client'

export interface TokenReport {
  at: number
  valid: boolean
  appId: string | null
  type: string | null
  scopes: string[]
  writeScopes: string[]
  /** escopos de escrita presentes e NÃO aceitos na configuração */
  unaccepted: string[]
  /** ms; null = não expira / desconhecido */
  expiresAt: number | null
  error?: string
  /** impressão digital do token verificado (não é o token): para notar quando ele foi trocado */
  fp?: string
}

/** Identifica o token sem guardá-lo: 8 caracteres do hash. */
export const tokenFingerprint = (token: string | undefined): string | undefined => (token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 8) : undefined)

export const TOKEN_KEY = 'token_check'

export function evaluateToken(
  data: { data?: { is_valid?: boolean; app_id?: string; type?: string; scopes?: string[]; expires_at?: number; data_access_expires_at?: number; error?: { message?: string } } } | undefined,
  cfg: Pick<MetaConfig, 'writeScopes' | 'acceptedWriteScopes'>, now: number,
): TokenReport {
  const d = data?.data
  const scopes = d?.scopes ?? []
  const writeScopes = scopes.filter(s => cfg.writeScopes.includes(s))
  return {
    at: now, valid: !!d?.is_valid, appId: d?.app_id ?? null, type: d?.type ?? null, scopes, writeScopes,
    unaccepted: writeScopes.filter(s => !cfg.acceptedWriteScopes.includes(s)),
    expiresAt: d?.expires_at ? d.expires_at * 1000 : null,
    ...(d?.is_valid ? {} : { error: d?.error?.message ?? 'A Meta respondeu que o token não é válido.' }),
  }
}

export interface TokenCheckDeps {
  token: string | undefined
  get: (path: string) => Promise<MetaResult<{ data?: Record<string, unknown> }>>
  store: LimitStore
  limits: Pick<LimitController, 'raise' | 'pauseSystem'>
  config: () => MetaConfig
  now?: () => number
}

const DAY = 86_400_000

export async function runTokenCheck(deps: TokenCheckDeps): Promise<TokenReport> {
  const cfg = deps.config(); const now = (deps.now ?? Date.now)()
  const fail = async (error: string): Promise<TokenReport> => {
    const r: TokenReport = { at: now, valid: false, appId: null, type: null, scopes: [], writeScopes: [], unaccepted: [], expiresAt: null, error, fp: tokenFingerprint(deps.token) }
    await deps.store.setSetting(TOKEN_KEY, r)
    return r
  }

  await checkApiVersion(deps, cfg, now)
  if (!deps.token) return fail('META_ACCESS_TOKEN ausente')
  const res = await deps.get(`debug_token?input_token=${encodeURIComponent(deps.token)}`)
  if (!res.ok) {
    // Chamada que nem chegou à Meta (pausa, teto, kill switch...) não é prova de token inválido: mantém o último resultado conhecido.
    if (res.blocked) {
      const prev = await deps.store.getSetting<TokenReport>(TOKEN_KEY)
      if (prev) return prev
    }
    return fail(res.blocked ? `bloqueado: ${res.blocked}` : (res.error?.message ?? 'falha ao validar'))
  }

  const r = { ...evaluateToken(res.data as never, cfg, now), fp: tokenFingerprint(deps.token) }
  await deps.store.setSetting(TOKEN_KEY, r)

  if (!r.valid) {
    await deps.limits.pauseSystem('token_invalid')
    await deps.limits.raise({ level: 'critical', kind: 'token_failure', message: 'O token da Meta está inválido ou expirou. As chamadas foram pausadas.' })
  } else if (r.unaccepted.length) {
    await deps.limits.raise({ level: 'critical', kind: 'token_write_scope', message: `O token tem escopo de ESCRITA (${r.unaccepted.join(', ')}). As sincronizações não iniciam. Gere um token só de leitura ou aceite o risco em META_ACCEPTED_WRITE_SCOPES.`, data: { scopes: r.unaccepted } })
  }
  if (r.valid && r.expiresAt) {
    const daysLeft = Math.floor((r.expiresAt - now) / DAY)
    if (daysLeft <= cfg.tokenExpiryAlertDays) await deps.limits.raise({ level: daysLeft <= 3 ? 'critical' : 'warning', kind: 'token_expiring', message: `O token da Meta expira em ${Math.max(daysLeft, 0)} dia(s). Gere um novo antes disso.` })
  }
  return r
}

async function checkApiVersion(deps: TokenCheckDeps, cfg: MetaConfig, now: number) {
  if (!cfg.apiDeprecationDate) return
  const daysLeft = Math.floor((Date.parse(cfg.apiDeprecationDate) - now) / DAY)
  if (Number.isFinite(daysLeft) && daysLeft <= cfg.apiDeprecationWarnDays) {
    await deps.limits.raise({ level: daysLeft <= 14 ? 'critical' : 'warning', kind: 'api_version_deprecation', message: `A versão ${cfg.apiVersion} da Graph API deixa de funcionar em ${Math.max(daysLeft, 0)} dia(s). Teste a versão nova em DRY_RUN antes de trocar META_API_VERSION.` })
  }
}

/** Regra do gate do pipeline: só chama com token validado recentemente, válido e sem escopo de escrita não aceito. */
/** Escopos de escrita que a configuração ATUAL ainda não aceita (recalculado; aceitar um escopo não exige nova validação). */
export const unacceptedNow = (r: Pick<TokenReport, 'writeScopes'>, cfg: Pick<MetaConfig, 'acceptedWriteScopes'>) => r.writeScopes.filter(s => !cfg.acceptedWriteScopes.includes(s))

export function tokenBlocksPipeline(report: TokenReport | null, cfg: Pick<MetaConfig, 'tokenCheckMaxAgeHours' | 'acceptedWriteScopes'>, now: number): string | null {
  if (!report) return 'token_unchecked'
  if (now - report.at > cfg.tokenCheckMaxAgeHours * 3_600_000) return 'token_check_stale'
  if (!report.valid) return 'token_invalid'
  if (unacceptedNow(report, cfg).length) return 'token_write_scope'
  return null
}
