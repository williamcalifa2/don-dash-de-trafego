import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateToken, runTokenCheck, tokenBlocksPipeline, TOKEN_KEY, type TokenReport } from '@/lib/meta/tokenCheck'
import { createLimitController } from '@/lib/meta/limits'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { createMetaClient } from '@/lib/meta/client'
import { cfgWith, ctx, json } from './helpers'

const T = 1_800_000_000_000
const DAY = 86_400_000
let store: MemoryLimitStore
const cfg = cfgWith({ acceptedWriteScopes: [] })
const debug = (d: Record<string, unknown>) => async () => ({ ok: true, status: 200, attempts: 1, data: { data: d } })

function setup(config = cfg) {
  const alerts: string[] = []
  const limits = createLimitController({ store, config: () => config, now: () => T, notify: a => { alerts.push(a.kind) } })
  const run = (get: Parameters<typeof runTokenCheck>[0]['get'], token: string | undefined = 'EAAtokenlongodeteste') =>
    runTokenCheck({ token, get, store, limits, config: () => config, now: () => T })
  return { limits, alerts, run }
}
beforeEach(() => { store = new MemoryLimitStore(() => T) })

describe('avaliação do token', () => {
  it('detecta escopos de escrita e respeita os aceitos', () => {
    const d = { data: { is_valid: true, scopes: ['ads_read', 'ads_management', 'pages_manage_ads', 'leads_retrieval'] } }
    expect(evaluateToken(d, cfg, T).unaccepted).toEqual(['ads_management', 'pages_manage_ads'])
    expect(evaluateToken(d, { ...cfg, acceptedWriteScopes: ['ads_management', 'pages_manage_ads'] }, T).unaccepted).toEqual([])
    expect(evaluateToken({ data: { is_valid: true, scopes: ['ads_read', 'leads_retrieval'] } }, cfg, T).writeScopes).toEqual([])
  })
})

describe('validação diária', () => {
  it('escopo de escrita não aceito: alerta crítico e o pipeline fica travado', async () => {
    const { run, alerts } = setup()
    const r = await run(debug({ is_valid: true, scopes: ['ads_read', 'ads_management'] }))
    expect(r.unaccepted).toEqual(['ads_management'])
    expect(alerts).toContain('token_write_scope')
    expect(tokenBlocksPipeline(await store.getSetting<TokenReport>(TOKEN_KEY), cfg, T)).toBe('token_write_scope')
  })

  it('token somente leitura passa e libera o pipeline', async () => {
    const { run, alerts } = setup()
    await run(debug({ is_valid: true, scopes: ['ads_read', 'read_insights'] }))
    expect(alerts).toEqual([])
    expect(tokenBlocksPipeline(await store.getSetting<TokenReport>(TOKEN_KEY), cfg, T)).toBeNull()
  })

  it('token inválido pausa o sistema todo e alerta', async () => {
    const { run, alerts, limits } = setup()
    await run(debug({ is_valid: false }))
    expect(alerts).toContain('token_failure')
    expect((await store.getSetting<{ paused: boolean }>('system_paused'))?.paused).toBe(true)
    expect((await limits.gate({ origin: 'legacy', purpose: 'x', clientId: 'c1' }, { kind: 'k', path: 'p', calls: 1 })).allow).toBe(false)
  })

  it('alerta N dias antes de expirar', async () => {
    const { run, alerts } = setup()
    await run(debug({ is_valid: true, scopes: ['ads_read'], expires_at: (T + 8 * DAY) / 1000 }))
    expect(alerts).toContain('token_expiring')
  })

  it('sem alerta de expiração quando falta tempo de sobra', async () => {
    const { run, alerts } = setup()
    await run(debug({ is_valid: true, scopes: ['ads_read'], expires_at: (T + 40 * DAY) / 1000 }))
    expect(alerts).not.toContain('token_expiring')
  })

  it('alerta 60 dias antes da desativação da versão da API', async () => {
    const soon = new Date(T + 45 * DAY).toISOString().slice(0, 10)
    const { run, alerts } = setup(cfgWith({ apiDeprecationDate: soon, apiDeprecationWarnDays: 60 }))
    await run(debug({ is_valid: true, scopes: ['ads_read'] }))
    expect(alerts).toContain('api_version_deprecation')
  })

  it('falha de rede na validação: não libera o pipeline', async () => {
    const { run } = setup()
    const r = await run(async () => ({ ok: false, status: 0, attempts: 3, data: {}, error: { kind: 'transient', status: 0, message: 'rede' } }))
    expect(r.valid).toBe(false)
    expect(tokenBlocksPipeline(await store.getSetting<TokenReport>(TOKEN_KEY), cfg, T)).toBe('token_invalid')
  })
})

describe('regra do gate para o pipeline', () => {
  const req = { kind: 'account_edge', path: 'x', calls: 1 }
  it('sem validação, validação velha ou inválida: pipeline não chama; a validação em si passa', async () => {
    const { limits } = setup()
    await limits.setAccountFlags('c1', { enabled: true })
    const ctxp = { origin: 'pipeline' as const, purpose: 'x', clientId: 'c1' }
    expect(await limits.gate(ctxp, req)).toEqual({ allow: false, reason: 'token_unchecked' })
    expect((await limits.gate({ ...ctxp, clientId: undefined, essential: true }, { ...req, kind: 'debug_token' })).allow).toBe(true)

    await store.setSetting(TOKEN_KEY, { at: T - 40 * 3_600_000, valid: true, scopes: [], writeScopes: [], unaccepted: [], expiresAt: null, appId: null, type: null })
    expect(await limits.gate(ctxp, req)).toEqual({ allow: false, reason: 'token_check_stale' })

    await store.setSetting(TOKEN_KEY, { at: T, valid: true, scopes: [], writeScopes: [], unaccepted: [], expiresAt: null, appId: null, type: null })
    expect((await limits.gate(ctxp, req)).allow).toBe(true)
  })
})

describe('aceitar escopo de escrita depois da validação', () => {
  it('libera o pipeline sem nova chamada à Meta e sem "não aceitos" no relatório recalculado', async () => {
    const { run } = setup()
    const r = await run(debug({ is_valid: true, scopes: ['ads_read', 'ads_management'] }))
    expect(tokenBlocksPipeline(r, cfg, T)).toBe('token_write_scope')
    const later = { ...cfg, acceptedWriteScopes: ['ads_management'] }
    expect(tokenBlocksPipeline(r, later, T)).toBeNull()
    const { unacceptedNow } = await import('@/lib/meta/tokenCheck')
    expect(unacceptedNow(r, later)).toEqual([]); expect(unacceptedNow(r, cfg)).toEqual(['ads_management'])
  })
})

describe('DRY_RUN e a validação do token', () => {
  it('debug_token com essential roda mesmo em DRY_RUN; outras chamadas do pipeline não', async () => {
    let n = 0
    const client = createMetaClient({ config: () => cfgWith({ dryRun: true }), getToken: () => 'TOK', fetchImpl: (async () => { n++; return json({ data: { is_valid: true } }) }) as unknown as typeof fetch })
    const a = await client.get('debug_token?input_token=EAAtokenlongodeteste', { ...ctx(), essential: true })
    expect(a.dryRun).toBeUndefined(); expect(n).toBe(1)
    const b = await client.get('act_1234567/insights?fields=spend', { ...ctx(), essential: true })
    expect(b.dryRun).toBe(true); expect(n).toBe(1)
    const c = await client.get('debug_token?input_token=EAAtokenlongodeteste', ctx())
    expect(c.dryRun).toBe(true); expect(n).toBe(1)
  })
})
