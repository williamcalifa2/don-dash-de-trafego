import { vi } from 'vitest'
import { readMetaConfig, type MetaConfig } from '@/lib/meta/config'
import { createMetaClient, type MetaClientDeps, type UsageEntry } from '@/lib/meta/client'

export const cfgWith = (over: Partial<MetaConfig> = {}): MetaConfig => ({
  ...readMetaConfig({}),
  dryRun: false,
  autopilot: false, // os testes de piloto automático ligam explicitamente
  timeoutMs: 200,
  ...over,
})

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
}

export interface Harness {
  client: ReturnType<typeof createMetaClient>
  fetchMock: ReturnType<typeof vi.fn>
  sleep: ReturnType<typeof vi.fn>
  records: UsageEntry[]
}

/** Cliente com rede simulada, sleep instantâneo e token de teste. */
export function harness(responder: (url: string, init: RequestInit) => Response | Promise<Response>, over: Partial<MetaClientDeps> & { cfg?: Partial<MetaConfig> } = {}): Harness {
  const { cfg, ...deps } = over
  const config = cfgWith(cfg)
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => responder(String(url), init ?? {}))
  const sleep = vi.fn(async () => {})
  const records: UsageEntry[] = []
  const client = createMetaClient({
    config: () => config,
    fetchImpl: fetchMock as unknown as typeof fetch,
    sleep,
    random: () => 0.5,
    getToken: () => 'TOKEN_DE_TESTE_123456',
    record: e => { records.push(e) },
    ...deps,
  })
  return { client, fetchMock, sleep, records }
}

export const ctx = (over: Partial<{ origin: 'pipeline' | 'legacy'; accountId: string; clientId: string; token: string }> = {}) => ({
  origin: 'pipeline' as const, purpose: 'teste', accountId: 'act_1234567', clientId: 'c1', ...over,
})
