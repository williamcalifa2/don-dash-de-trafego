/**
 * Cliente central da Meta: o ÚNICO ponto de saída para graph.facebook.com.
 *
 * Garantias em código:
 *  - somente leitura: GET; POST só para /batch e só com sub-requisições GET;
 *  - allowlist de endpoints, campos e parâmetros (ver allowlist.ts);
 *  - token sempre no cabeçalho Authorization, nunca na URL;
 *  - timeout em toda chamada; retry só para falha de rede/5xx transitório (nunca para limite, permissão ou token);
 *  - headers de uso (X-App-Usage, X-Business-Use-Case-Usage, X-Ad-Account-Usage) lidos em toda resposta;
 *  - DRY_RUN: registra o que seria chamado, sem chamar;
 *  - falha segura: sem token, sem permissão da política ou com o gate negando, não chama.
 */
import { readMetaConfig, metaConfig, type MetaConfig } from './config'
import { assertReadOnly, MetaPolicyError, parseRequest, type AllowedRequest } from './allowlist'
import { classifyError, parseUsage, type MetaErrorInfo, type UsageSnapshot } from './usage'
import { redact } from './redact'

export type Origin = 'pipeline' | 'legacy'

export interface MetaCallContext {
  /** 'pipeline' = worker novo (obedece DRY_RUN e fases). 'legacy' = caminho antigo disparado pelo painel (removido na virada). */
  origin: Origin
  purpose: string
  /** act_123... (para tetos, breaker e auditoria) */
  accountId?: string | null
  clientId?: string | null
  /** token alternativo (ex.: token de página). Padrão: META_ACCESS_TOKEN */
  token?: string
  /** Só valida o token (debug_token): não é barrada por DRY_RUN nem pela exigência de token validado. */
  essential?: boolean
}

export type GateDecision = { allow: true } | { allow: false; reason: string }

export interface UsageEntry {
  clientId?: string | null
  accountId?: string | null
  endpoint: string
  status?: number
  calls: number
  outcome: string
  errorCode?: number
  usage?: UsageSnapshot
  dryRun: boolean
  origin: Origin
  at: number
}

export interface MetaResult<T = Record<string, unknown>> {
  ok: boolean
  status: number
  data: T
  error?: MetaErrorInfo
  usage?: UsageSnapshot
  dryRun?: boolean
  /** motivo pelo qual a chamada nem saiu (gate, DRY_RUN não conta) */
  blocked?: string
  attempts: number
}

export interface MetaClientDeps {
  config: () => MetaConfig
  fetchImpl: typeof fetch
  sleep: (ms: number) => Promise<void>
  random: () => number
  now: () => number
  getToken: () => string | undefined
  /** Política dinâmica (circuit breaker, kill switch, tetos). Falhar aqui = não chamar. */
  gate?: (ctx: MetaCallContext, req: { kind: string; path: string; calls: number }) => Promise<GateDecision> | GateDecision
  record?: (entry: UsageEntry) => Promise<void> | void
  onResult?: (ctx: MetaCallContext, result: MetaResult, meta: { path: string; calls: number }) => Promise<void> | void
}

const defaultDeps: MetaClientDeps = {
  config: metaConfig,
  fetchImpl: (...a) => fetch(...a),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  random: Math.random,
  now: Date.now,
  getToken: () => process.env.META_ACCESS_TOKEN?.trim() || undefined, // espaço ou quebra de linha colados junto com o token não podem invalidá-lo
}

interface SendSpec {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  isBatchRoot: boolean
  batchItems?: Array<{ method?: string }>
}

const empty = <T,>(): T => ({} as T)

export function createMetaClient(overrides: Partial<MetaClientDeps> = {}) {
  const deps: MetaClientDeps = { ...defaultDeps, ...overrides }
  const inflight = new Map<string, Promise<MetaResult<never>>>()

  const backoffMs = (cfg: MetaConfig, attempt: number) =>
    Math.round(Math.min(cfg.backoffMaxMs, cfg.backoffBaseMs * 2 ** attempt) * (0.5 + deps.random() * 0.5))

  async function safeRecord(entry: UsageEntry) {
    try { await deps.record?.(entry) } catch { /* auditoria nunca derruba a chamada, mas também nunca a libera */ }
  }

  /** Última barreira antes da rede: reconfere método e destino. */
  async function send(spec: SendSpec, cfg: MetaConfig, signal: AbortSignal): Promise<Response> {
    assertReadOnly(spec.method, spec.isBatchRoot, spec.batchItems)
    const host = new URL(spec.url).origin
    if (host !== new URL(cfg.graphBaseUrl).origin) throw new MetaPolicyError('host_not_allowed', 'Destino fora do host configurado da Meta')
    return deps.fetchImpl(spec.url, { method: spec.method, headers: spec.headers, body: spec.body, signal, cache: 'no-store' })
  }

  async function execute<T>(
    spec: SendSpec, cfg: MetaConfig, ctx: MetaCallContext, meta: { kind: string; path: string; calls: number },
  ): Promise<MetaResult<T>> {
    const base = { clientId: ctx.clientId, accountId: ctx.accountId, endpoint: meta.path, calls: meta.calls, origin: ctx.origin, at: deps.now() }
    const blockedResult = async (reason: string): Promise<MetaResult<T>> => {
      await safeRecord({ ...base, outcome: `blocked_${reason}`, dryRun: false })
      return { ok: false, status: 0, data: empty<T>(), blocked: reason, attempts: 0,
        error: { kind: 'client', status: 0, message: `Chamada bloqueada: ${reason}` } }
    }

    // Falha segura: sem token, não chama.
    const token = ctx.token ?? deps.getToken()
    if (!token) return blockedResult('no_token')
    if (ctx.origin === 'legacy' && !cfg.legacyLive) return blockedResult('legacy_disabled')

    let decision: GateDecision
    try { decision = deps.gate ? await deps.gate(ctx, meta) : { allow: true } } catch { decision = { allow: false, reason: 'gate_error' } }
    if (!decision.allow) return blockedResult(decision.reason)

    if (ctx.origin === 'pipeline' && cfg.dryRun && !(ctx.essential && meta.kind === 'debug_token')) {
      await safeRecord({ ...base, outcome: 'dry_run', dryRun: true })
      return { ok: true, status: 0, data: empty<T>(), dryRun: true, attempts: 0 }
    }

    const headers = { ...spec.headers, Authorization: `Bearer ${token}` }
    let res: Response | null = null
    let attempts = 0
    for (let attempt = 0; attempt <= cfg.netRetries; attempt++) {
      attempts = attempt + 1
      try {
        res = await send({ ...spec, headers }, cfg, AbortSignal.timeout(cfg.timeoutMs))
        if (cfg.retryStatuses.includes(res.status) && attempt < cfg.netRetries) { await deps.sleep(backoffMs(cfg, attempt)); continue }
        break
      } catch (e) {
        if (e instanceof MetaPolicyError) throw e
        res = null
        if (attempt < cfg.netRetries) { await deps.sleep(backoffMs(cfg, attempt)); continue }
      }
    }

    if (!res) {
      const result: MetaResult<T> = { ok: false, status: 0, data: empty<T>(), attempts,
        error: { kind: 'transient', status: 0, message: 'Falha de rede ao falar com a Meta' } }
      await safeRecord({ ...base, outcome: 'network_error', dryRun: false })
      await deps.onResult?.(ctx, result as MetaResult, meta)
      return result
    }

    const usage = parseUsage(name => res!.headers.get(name))
    const text = await res.text().catch(() => '')
    let data: unknown = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = {} }

    if (res.ok) {
      const result: MetaResult<T> = { ok: true, status: res.status, data: data as T, usage, attempts }
      await safeRecord({ ...base, status: res.status, outcome: 'ok', usage, dryRun: false })
      await deps.onResult?.(ctx, result as MetaResult, meta)
      return result
    }
    const error = classifyError(res.status, data, cfg)
    const result: MetaResult<T> = { ok: false, status: res.status, data: data as T, error, usage, attempts }
    await safeRecord({ ...base, status: res.status, outcome: error.kind === 'rate_limit' ? 'rate_limit' : `error_${error.kind}`, errorCode: error.code, usage, dryRun: false })
    await deps.onResult?.(ctx, result as MetaResult, meta)
    return result
  }

  function urlFor(cfg: MetaConfig, req: AllowedRequest): string {
    const qs = new URLSearchParams(req.query).toString()
    return `${cfg.graphBaseUrl}/${cfg.apiVersion}/${req.path}${qs ? `?${qs}` : ''}`
  }

  function singleFlight<T>(key: string, run: () => Promise<MetaResult<T>>): Promise<MetaResult<T>> {
    const hit = inflight.get(key)
    if (hit) return hit as unknown as Promise<MetaResult<T>>
    const p = run().finally(() => inflight.delete(key))
    inflight.set(key, p as unknown as Promise<MetaResult<never>>)
    return p
  }

  /** GET na Graph API. Lança MetaPolicyError se o pedido violar a allowlist (nada sai). */
  async function get<T = Record<string, unknown>>(pathWithQuery: string, ctx: MetaCallContext): Promise<MetaResult<T>> {
    const cfg = deps.config()
    let req: AllowedRequest
    try {
      req = parseRequest(pathWithQuery, cfg)
    } catch (e) {
      if (e instanceof MetaPolicyError) {
        await safeRecord({ clientId: ctx.clientId, accountId: ctx.accountId, endpoint: redact(pathWithQuery.split('?')[0]).slice(0, 200), calls: 0, outcome: `blocked_policy:${e.reason}`, dryRun: false, origin: ctx.origin, at: deps.now() })
      }
      throw e
    }
    const key = `${ctx.origin}|${ctx.accountId ?? ''}|${(ctx.token ?? '').slice(-6)}|${req.path}?${new URLSearchParams(Object.entries(req.query).sort()).toString()}`
    return singleFlight<T>(key, () => execute<T>({ method: 'GET', url: urlFor(cfg, req), headers: { Accept: 'application/json' }, isBatchRoot: false }, cfg, ctx, { kind: req.kind, path: req.path, calls: 1 }))
  }

  /** Várias leituras em uma requisição /batch. Toda sub-requisição precisa passar na allowlist e ser GET. */
  async function batch<T = Record<string, unknown>>(paths: string[], ctx: MetaCallContext): Promise<MetaResult<Array<MetaResult<T>>>> {
    const cfg = deps.config()
    if (paths.length === 0 || paths.length > cfg.batchMax) throw new MetaPolicyError('batch_size', `Batch deve ter entre 1 e ${cfg.batchMax} itens`)
    const items = paths.map(p => {
      const r = parseRequest(p, cfg)
      const qs = new URLSearchParams(r.query).toString()
      return { method: 'GET' as const, relative_url: `${r.path}${qs ? `?${qs}` : ''}` }
    })
    const body = new URLSearchParams({ batch: JSON.stringify(items), include_headers: 'false' }).toString()
    const outer = await execute<unknown>(
      { method: 'POST', url: `${cfg.graphBaseUrl}/${cfg.apiVersion}/`, headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body, isBatchRoot: true, batchItems: items },
      cfg, ctx, { kind: 'batch', path: 'batch', calls: items.length },
    )
    if (!outer.ok) return { ...outer, data: [] as Array<MetaResult<T>> }
    const arr = Array.isArray(outer.data) ? outer.data as Array<{ code?: number; body?: string }> : []
    const parts: Array<MetaResult<T>> = items.map((_, i) => {
      const part = arr[i]
      let parsed: unknown = {}
      try { parsed = part?.body ? JSON.parse(part.body) : {} } catch { parsed = {} }
      const status = part?.code ?? 0
      return status >= 200 && status < 300
        ? { ok: true, status, data: parsed as T, attempts: 1 }
        : { ok: false, status, data: parsed as T, attempts: 1, error: classifyError(status, parsed, cfg) }
    })
    return { ...outer, data: parts }
  }

  return { get, batch }
}

export { MetaPolicyError } from './allowlist'
export { readMetaConfig }
