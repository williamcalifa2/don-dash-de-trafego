/**
 * Adaptador dos caminhos que o painel ainda usa para consultar a Meta ao vivo (origin 'legacy').
 * Tudo passa pelo cliente central (allowlist, somente leitura, token no cabeçalho, timeout, uso registrado).
 * Some quando o painel passar a ler só do banco (etapa 5) e META_LEGACY_LIVE for desligado.
 */
import { MetaPolicyError, type MetaResult, type Origin } from './client'
import { meta } from './instance'
import { metaConfig } from './config'

export interface LegacyOpts { accountId?: string | null; clientId?: string | null; token?: string; purpose?: string; origin?: Origin }

// Resfriamento em memória, só até o controle de limites persistente (etapa 2) assumir: após erro de limite, nada sai por um tempo.
let cooldownUntil = 0
export const metaCooldownMinutes = () => (Date.now() < cooldownUntil ? Math.ceil((cooldownUntil - Date.now()) / 60_000) : 0)
export const __resetLegacyCooldown = () => { cooldownUntil = 0; cache.clear(); inflight.clear() }

/**
 * Várias telas abertas (do mesmo cliente ou de clientes diferentes) pedem as mesmas coisas. Aqui a mesma consulta vira UMA chamada:
 * pedidos iguais ao mesmo tempo compartilham a resposta em andamento, e respostas boas ficam guardadas por META_LEGACY_CACHE_SEC.
 * O cache vale por instância do servidor (não é compartilhado entre instâncias) e nunca guarda erro. Leads e webhooks ficam de fora.
 */
const cache = new Map<string, { at: number; clientId: string; value: MetaResult<unknown> }>()
const inflight = new Map<string, Promise<MetaResult<unknown>>>()
const CACHE_MAX = 600
const cacheable = (opts: LegacyOpts) => !/^(leads|webhook)/.test(opts.purpose ?? '')
const cacheKey = (kind: string, path: string, opts: LegacyOpts) => `${kind}|${opts.clientId ?? ''}|${opts.accountId ?? ''}|${opts.token ? `T${opts.token.slice(-8)}` : ''}|${path}`

async function shared<T>(kind: string, path: string, opts: LegacyOpts, run: () => Promise<MetaResult<T>>): Promise<MetaResult<T>> {
  const ttl = metaConfig().legacyCacheSec * 1000
  if (ttl <= 0 || !cacheable(opts)) return run()
  const key = cacheKey(kind, path, opts)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value as MetaResult<T>
  const pending = inflight.get(key)
  if (pending) return pending as Promise<MetaResult<T>>
  const p = run().then(r => {
    if (r.ok) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
      cache.set(key, { at: Date.now(), clientId: opts.clientId ?? '', value: r })
    }
    return r as MetaResult<unknown>
  }).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p as Promise<MetaResult<T>>
}

/** "Atualizar": descarta o que está guardado deste cliente para a próxima leitura ir buscar de novo. */
export function invalidateLegacyCache(clientId: string): number {
  let n = 0
  for (const [k, v] of cache) if (v.clientId === clientId) { cache.delete(k); n++ }
  return n
}

function policyFailure<T>(e: MetaPolicyError): MetaResult<T> {
  return { ok: false, status: 0, data: {} as T, attempts: 0, blocked: `policy:${e.reason}`, error: { kind: 'client', status: 0, message: e.message } }
}

function coolingDown<T>(): MetaResult<T> {
  return { ok: false, status: 0, data: {} as T, attempts: 0, blocked: 'cooldown',
    error: { kind: 'rate_limit', status: 0, message: `O Meta pediu para reduzir o ritmo das consultas. Nova tentativa em cerca de ${metaCooldownMinutes()} min.` } }
}

function noteResult(r: MetaResult<unknown>) {
  if (r.error?.kind === 'rate_limit') {
    const cfg = metaConfig()
    const minutes = Math.max(5, r.usage?.regainMinutes ?? 0)
    cooldownUntil = Math.max(cooldownUntil, Date.now() + minutes * 60_000 + cfg.blockMarginSec * 1000)
  }
}

export function legacyGet<T = Record<string, unknown>>(path: string, opts: LegacyOpts = {}): Promise<MetaResult<T>> {
  return shared<T>('g', path, opts, () => legacyGetNow<T>(path, opts))
}

async function legacyGetNow<T>(path: string, opts: LegacyOpts): Promise<MetaResult<T>> {
  if (metaCooldownMinutes() > 0) return coolingDown<T>()
  try {
    const r = await meta.get<T>(path, { origin: opts.origin ?? 'legacy', purpose: opts.purpose ?? 'painel', accountId: opts.accountId, clientId: opts.clientId, token: opts.token })
    noteResult(r)
    return r
  } catch (e) {
    if (e instanceof MetaPolicyError) return policyFailure<T>(e)
    throw e
  }
}

export function legacyBatch<T = Record<string, unknown>>(paths: string[], opts: LegacyOpts = {}): Promise<MetaResult<Array<MetaResult<T>>>> {
  return shared('b', paths.join(','), opts, () => legacyBatchNow<T>(paths, opts))
}

async function legacyBatchNow<T>(paths: string[], opts: LegacyOpts): Promise<MetaResult<Array<MetaResult<T>>>> {
  if (metaCooldownMinutes() > 0) return coolingDown<Array<MetaResult<T>>>()
  try {
    const r = await meta.batch<T>(paths, { origin: opts.origin ?? 'legacy', purpose: opts.purpose ?? 'painel', accountId: opts.accountId, clientId: opts.clientId, token: opts.token })
    noteResult(r)
    return r
  } catch (e) {
    if (e instanceof MetaPolicyError) return policyFailure<Array<MetaResult<T>>>(e)
    throw e
  }
}

/** Segue os cursores (paging.cursors.after) até o teto de páginas da configuração. */
export async function legacyPaged<T = Record<string, unknown>>(
  path: string, opts: LegacyOpts = {},
): Promise<{ ok: boolean; rows: T[]; error?: MetaResult['error']; truncated: boolean; blocked?: string }> {
  const cfg = metaConfig()
  const rows: T[] = []
  let after: string | undefined
  for (let page = 0; page < cfg.maxPagesPerJob; page++) {
    const p = after ? `${path}${path.includes('?') ? '&' : '?'}after=${encodeURIComponent(after)}` : path
    const r = await legacyGet<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(p, opts)
    if (!r.ok) return { ok: false, rows, error: r.error, truncated: false, blocked: r.blocked }
    rows.push(...(r.data.data ?? []))
    after = r.data.paging?.next ? r.data.paging.cursors?.after : undefined
    if (!after) return { ok: true, rows, truncated: false }
  }
  return { ok: true, rows, truncated: true }
}

export const errMsg = (r: { error?: { message?: string } }, fallback = 'Erro na API do Meta') => r.error?.message ?? fallback
