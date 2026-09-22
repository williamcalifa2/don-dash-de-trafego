/** Liga o orquestrador às peças reais (Supabase, cliente da Meta, leads). Único lugar que monta as dependências de produção. */
import { randomUUID } from 'node:crypto'
import { getSupabaseServer } from '../supabase'
import { tenantBySlug } from '../tenant'
import { syncLeads } from '../metaLeads'
import { MetaPolicyError, type MetaCallContext, type MetaResult } from './client'
import { metaConfig } from './config'
import { meta, limits } from './instance'
import { stores } from './stores'
import { runTokenCheck, tokenFingerprint } from './tokenCheck'
import { runCycle, type CycleReport, type OrchDeps } from './orchestrator'
import type { Account, CollectDeps } from './collectors'
import type { OrganicDeps } from './organic'

export { stores }

export async function listAccounts(): Promise<Account[]> {
  const db = getSupabaseServer()
  if (!db) return []
  const { data } = await db.from('clients').select('slug').order('slug')
  const out: Account[] = []
  for (const { slug } of (data ?? []) as Array<{ slug: string }>) {
    const t = await tenantBySlug(slug)
    if (t?.adAccountId) out.push({ clientId: t.clientId, slug: t.slug, adAccountId: t.adAccountId, pageId: t.pageId })
  }
  return out
}

export async function pipelineGet<T = Record<string, unknown>>(path: string, ctx: Pick<MetaCallContext, 'accountId' | 'clientId' | 'purpose' | 'token'> & { essential?: boolean }): Promise<MetaResult<T>> {
  try {
    return await meta.get<T>(path, { origin: 'pipeline', ...ctx })
  } catch (e) {
    if (e instanceof MetaPolicyError) return { ok: false, status: 0, data: {} as T, attempts: 0, blocked: `policy:${e.reason}`, error: { kind: 'client', status: 0, message: e.message } }
    throw e
  }
}

export async function pipelineBatch<T = Record<string, unknown>>(paths: string[], ctx: Pick<MetaCallContext, 'accountId' | 'clientId' | 'purpose' | 'token'>): Promise<MetaResult<Array<MetaResult<T>>>> {
  try {
    return await meta.batch<T>(paths, { origin: 'pipeline', ...ctx })
  } catch (e) {
    if (e instanceof MetaPolicyError) return { ok: false, status: 0, data: [], attempts: 0, blocked: `policy:${e.reason}`, error: { kind: 'client', status: 0, message: e.message } }
    throw e
  }
}

/** Orgânico (Página e Instagram): token próprio, fora da fila de anúncios. */
export function organicDeps(): OrganicDeps {
  return { now: Date.now, get: pipelineGet, batch: pipelineBatch, snaps: stores.snaps, state: stores.limit, // Sem token próprio do orgânico, usa o de anúncios (a conta é a mesma).
    token: process.env.META_ORGANIC_TOKEN?.trim() || process.env.META_ACCESS_TOKEN?.trim() || undefined }
}

export function collectDeps(): CollectDeps {
  return {
    cfg: metaConfig(), now: Date.now, get: pipelineGet, snaps: stores.snaps, state: stores.limit,
    syncLeads: async (acc, opts) => {
      const t = await tenantBySlug(acc.slug)
      if (!t) return { imported: 0, error: 'cliente não encontrado' }
      const r = await syncLeads(t, 2, { origin: 'pipeline', sinceEpochSec: opts.sinceEpochSec })
      return { imported: r.imported, error: r.error, blocked: r.blocked, truncated: r.truncated, noPage: r.noPage }
    },
  }
}

export const checkToken = () => runTokenCheck({
  token: process.env.META_ACCESS_TOKEN?.trim() || undefined,
  get: p => pipelineGet(p, { purpose: 'token_check', essential: true }) as Promise<MetaResult<{ data?: Record<string, unknown> }>>,
  store: stores.limit, limits: limits(), config: metaConfig,
})

export function orchDeps(): OrchDeps {
  return {
    cfg: metaConfig(), now: Date.now, random: Math.random,
    jobs: stores.jobs, state: stores.limit, limits: limits(),
    accounts: listAccounts, collect: collectDeps(), checkToken, tokenFingerprint: () => tokenFingerprint(process.env.META_ACCESS_TOKEN?.trim()),
  }
}

export async function runPipelineCycle(): Promise<CycleReport> {
  const d = orchDeps()
  let cached: Account[] | undefined // uma leitura de contas por ciclo, não por job
  d.accounts = async () => (cached ??= await listAccounts())
  return runCycle(d, randomUUID())
}

export async function purgeLeadsBefore(beforeMs: number): Promise<number> {
  const db = getSupabaseServer()
  if (!db) return 0
  const { data, error } = await db.from('leads').delete().lt('created_at', new Date(beforeMs).toISOString()).select('id')
  if (error) throw new Error('Falha ao aplicar a retenção de leads')
  return (data ?? []).length
}

export async function statusNow() {
  const { buildStatus } = await import('./status')
  const { eventStore } = await import('./webhookRunner')
  return buildStatus({ cfg: metaConfig(), now: Date.now, state: stores.limit, jobs: stores.jobs, events: eventStore, accounts: listAccounts })
}
