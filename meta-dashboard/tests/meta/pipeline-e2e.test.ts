import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLimitController } from '@/lib/meta/limits'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { MemoryJobStore } from '@/lib/meta/queue'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import { runCycle, type OrchDeps } from '@/lib/meta/orchestrator'
import { createMetaClient, MetaPolicyError, type MetaResult } from '@/lib/meta/client'
import { readMetrics } from '@/lib/meta/read'
import { buildStatus } from '@/lib/meta/status'
import { runRetention } from '@/lib/meta/retention'
import { runTokenCheck } from '@/lib/meta/tokenCheck'
import type { Account } from '@/lib/meta/collectors'
import { cfgWith, json } from './helpers'

const MIN = 60_000
let t = Date.UTC(2026, 8, 21, 15, 0, 0)
let store: MemoryLimitStore, jobs: MemoryJobStore, snaps: MemorySnapshotStore
const accs: Account[] = [{ clientId: 'c1', slug: 'dalmoro', adAccountId: 'act_1234567' }, { clientId: 'c2', slug: 'becker', adAccountId: 'act_7654321' }]
const lead = (n: number) => [{ action_type: 'onsite_conversion.lead_grouped', value: String(n) }]

/** "Meta" simulada por trás do cliente central de verdade (allowlist, gate, breaker, usage). */
function world(over: { cfg?: Parameters<typeof cfgWith>[0]; respond?: (url: string) => Response | undefined } = {}) {
  const cfg = cfgWith({ phase: 3, maxPagesPerJob: 50, jobStaggerMaxSec: 0, ...over.cfg })
  const urls: string[] = []
  const alerts: string[] = []
  const limits = createLimitController({ store, config: () => cfg, now: () => t, notify: a => { alerts.push(a.kind) } })
  const fetchImpl = vi.fn(async (url: string) => {
    urls.push(url)
    const custom = over.respond?.(url); if (custom) return custom
    const u = new URL(url); const p = u.pathname.replace(/^\/v[\d.]+\//, '')
    if (p === 'debug_token') return json({ data: { is_valid: true, app_id: '1', scopes: ['ads_read', 'leads_retrieval'] } })
    if (p.endsWith('/insights')) {
      const level = u.searchParams.get('level')
      const row = { spend: '10', impressions: '100', clicks: '5', actions: lead(2), date_start: '2026-09-20' }
      if (level === 'campaign') return json({ data: [{ ...row, campaign_id: '11' }] })
      if (level === 'adset') return json({ data: [{ ...row, campaign_id: '11', adset_id: '21' }] })
      if (level === 'ad') return json({ data: [{ ...row, campaign_id: '11', adset_id: '21', ad_id: '31', ad_name: 'A' }] })
      return json({ data: [row] })
    }
    if (p.endsWith('/customconversions')) return json({ data: [{ id: '777', name: 'Lead qualificado' }] })
    if (p.endsWith('/campaigns')) return json({ data: [{ id: '11', name: 'Camp', effective_status: 'ACTIVE', daily_budget: '5000' }] })
    if (p.endsWith('/adsets')) return json({ data: [{ id: '21', name: 'Conj', campaign_id: '11', effective_status: 'ACTIVE' }] })
    if (p.endsWith('/ads')) return json({ data: [{ id: '31', name: 'A', adset_id: '21', effective_status: 'ACTIVE', creative: { thumbnail_url: 'https://cdn/x.jpg' } }] })
    if (/^act_\d+$/.test(p)) return json({ name: 'Conta', currency: 'BRL', account_status: 1 })
    return json({ error: { code: 100, message: 'inesperado' } }, { status: 400 })
  })
  const client = createMetaClient({
    config: () => cfg, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, random: () => 0.5, now: () => t, getToken: () => 'TOKEN_E2E_123456',
    gate: (c, r) => limits.gate(c, r), onResult: (c, r, m) => limits.onResult(c, r, m), record: e => limits.record(e),
  })
  const get = async <T,>(path: string, ctx: Parameters<OrchDeps['collect']['get']>[1] & { essential?: boolean }): Promise<MetaResult<T>> => {
    try { return await client.get<T>(path, { origin: 'pipeline', ...ctx }) } catch (e) {
      if (e instanceof MetaPolicyError) return { ok: false, status: 0, data: {} as T, attempts: 0, blocked: `policy:${e.reason}`, error: { kind: 'client', status: 0, message: e.message } }
      throw e
    }
  }
  const d: OrchDeps = {
    cfg, now: () => t, random: () => 0, jobs, state: store, limits,
    accounts: async () => accs,
    collect: { cfg, now: () => t, get, snaps, state: store, syncLeads: async () => ({ imported: 0 }) },
    checkToken: () => runTokenCheck({ token: 'EAAtokenlongodeteste', get: p => get(p, { purpose: 'token_check', essential: true }) as never, store, limits, config: () => cfg, now: () => t }),
  }
  return { d, cfg, urls, alerts, fetchImpl, limits }
}
const cycle = async (d: OrchDeps, n = 1) => { let r; for (let i = 0; i < n; i++) { r = await runCycle(d, 'test'); t += 10 * MIN } return r! }

beforeEach(() => { t = Date.UTC(2026, 8, 21, 15, 0, 0); store = new MemoryLimitStore(() => t); jobs = new MemoryJobStore(); snaps = new MemorySnapshotStore() })

describe('pipeline de ponta a ponta (Meta simulada atrás do cliente central)', () => {
  it('ciclos de cron: enfileira, coleta, grava, e o painel lê do banco sem nenhuma chamada à Meta', async () => {
    const w = world()
    await store.patchState('c2', { paused: true })
    await cycle(w.d, 6)
    expect(await snaps.get('c1', 'summary', 'last_7d')).not.toBeNull()
    expect(await snaps.get('c1', 'structure', 'ads')).not.toBeNull()
    expect(await snaps.get('c2', 'summary', 'last_7d')).toBeNull() // conta pausada não sincroniza

    const before = w.fetchImpl.mock.calls.length
    const r = await readMetrics(snaps, 'c1', 'act_1234567', 'last_7d', w.cfg, await store.getState('c1'), t)
    expect(w.fetchImpl.mock.calls.length).toBe(before) // leitura = zero chamadas
    expect(r.account_name).toBe('Conta'); expect(r.summary.leads).toBe(2); expect(r.campaigns[0]).toMatchObject({ name: 'Camp', leads: 2, daily_budget: 50 })
  })

  it('todas as chamadas: GET, dentro da allowlist, token só no cabeçalho, host da Meta', async () => {
    const w = world()
    await store.patchState('c1', { enabled: true })
    await cycle(w.d, 6)
    expect(w.urls.length).toBeGreaterThan(10)
    for (const u of w.urls) { expect(u).toMatch(/^https:\/\/graph\.facebook\.com\/v20\.0\//); expect(u).not.toContain('TOKEN_E2E'); expect(u).not.toContain('access_token') }
    for (const c of w.fetchImpl.mock.calls) expect(((c as unknown[])[1] as RequestInit).method).toBe('GET')
  })

  it('com cron a cada 10 min, a maioria dos ciclos não faz nenhuma chamada (TTL manda)', async () => {
    const w = world()
    await store.patchState('c2', { paused: true })
    const perCycle: number[] = []
    for (let i = 0; i < 12; i++) { const before = w.fetchImpl.mock.calls.length; await cycle(w.d, 1); perCycle.push(w.fetchImpl.mock.calls.length - before) }
    const zero = perCycle.filter(n => n === 0).length
    expect(zero, perCycle.join(',')).toBeGreaterThanOrEqual(6)
    expect(Math.max(...perCycle)).toBeLessThanOrEqual(60) // e nenhum ciclo faz uma rajada
  })

  it('erro de limite numa conta: só ela é bloqueada, some das chamadas, alerta sai, a outra segue', async () => {
    let hit = false
    const w = world({ respond: url => (url.includes('act_1234567/') && url.includes('/insights') && !hit ? (hit = true, json({ error: { code: 17, message: 'User request limit reached' } }, { status: 400 })) : undefined) })
    await store.patchState('c1', { enabled: true }); await store.patchState('c2', { enabled: true })
    await cycle(w.d, 4)
    const st = await store.getState('c1')
    expect(st.blockedUntil).not.toBeNull()
    expect(w.alerts).toContain('account_blocked')
    const callsToC1 = () => w.urls.filter(u => u.includes('act_1234567/')).length
    const c1Before = callsToC1()
    await cycle(w.d, 2)
    expect(callsToC1()).toBe(c1Before) // enquanto bloqueada: zero chamadas
    expect(await snaps.get('c2', 'summary', 'last_7d')).not.toBeNull()
  })

  it('erro de app-level (código 4): kill switch, nenhuma conta chama, retomada gradual depois', async () => {
    let armed = true
    const w = world({ cfg: { killSwitchMinutes: 30, resumeStepSec: 120 }, respond: url => (armed && url.includes('/insights') ? json({ error: { code: 4, message: 'Application request limit reached' } }, { status: 400 }) : undefined) })
    await store.patchState('c1', { enabled: true }); await store.patchState('c2', { enabled: true })
    await cycle(w.d, 3)
    expect(w.alerts).toContain('kill_switch')
    armed = false
    const n = w.fetchImpl.mock.calls.length
    await cycle(w.d, 1)
    expect(w.fetchImpl.mock.calls.length).toBe(n) // ainda dentro dos 30 min: nada sai
    await cycle(w.d, 4)                           // passou a janela: volta, mas gradualmente
    expect(w.fetchImpl.mock.calls.length).toBeGreaterThan(n)
  })

  it('DRY_RUN em todas as contas: prevê o volume, não chama a Meta (exceto a validação do token) e não grava dado', async () => {
    const w = world({ cfg: { dryRun: true, phase: 0 } })
    await cycle(w.d, 6)
    const meaningful = w.urls.filter(u => !u.includes('debug_token'))
    expect(meaningful, meaningful.join('\n')).toHaveLength(0)
    const s = await store.usageSummary(t - 24 * 60 * MIN)
    expect(s.calls).toBe(1) // só a validação diária do token (debug_token)
    expect(s.dryRunCalls).toBeGreaterThan(20)
    expect(snaps.data.size).toBe(0)
  })

  it('token com escopo de escrita: o pipeline real não roda (nenhuma chamada além da validação)', async () => {
    const w = world({ respond: url => (url.includes('debug_token') ? json({ data: { is_valid: true, scopes: ['ads_read', 'ads_management'] } }) : undefined) })
    await store.patchState('c1', { enabled: true })
    const r = await cycle(w.d, 3)
    expect(r.skipped).toContain('token_write_scope')
    expect(w.urls.filter(u => !u.includes('debug_token'))).toHaveLength(0)
    expect(w.alerts).toContain('token_write_scope')
  })

  it('token inválido/expirado: pausa geral e não insiste', async () => {
    const w = world({ respond: () => json({ error: { code: 190, message: 'Token expired' } }, { status: 400 }) })
    await store.patchState('c1', { enabled: true })
    await cycle(w.d, 4)
    expect(w.alerts).toContain('token_failure')
    // Só revalida o token (no máximo 1 consulta por ciclo, e só a cada 5 min); nenhuma outra chamada sai enquanto está inválido.
    expect(w.urls.length).toBeLessThanOrEqual(4)
    expect(w.urls.filter(u => !u.includes('debug_token'))).toHaveLength(0)
  })

  it('status e critério de avanço de fase refletem o uso observado; retenção roda 1x por dia', async () => {
    const w = world()
    await store.patchState('c1', { enabled: true })
    await cycle(w.d, 6)
    const s = await buildStatus({ cfg: w.cfg, now: () => t, state: store, jobs, accounts: async () => accs })
    expect(s.observation.rateLimitErrors).toBe(0); expect(s.observation.readyToAdvance).toBe(true)
    expect(s.accounts.list.find(a => a.slug === 'dalmoro')!.callsLastHour).toBeGreaterThan(0)

    store.usage.push({ clientId: 'c1', endpoint: 'x', calls: 1, outcome: 'rate_limit', dryRun: false, origin: 'pipeline', at: t })
    expect((await buildStatus({ cfg: w.cfg, now: () => t, state: store, jobs, accounts: async () => accs })).observation.readyToAdvance).toBe(false)

    const purge = vi.fn(async () => 3)
    const dep = { cfg: cfgWith({ leadsRetentionDays: 400 }), now: () => t, state: store, jobs, purgeLeads: purge }
    expect((await runRetention(dep)).leadsPurged).toBe(3)
    expect((await runRetention(dep)).ran).toBe(false)
    expect(purge).toHaveBeenCalledWith(t - 400 * 86_400_000)
  })

  it('sem nenhum dado observado, não diz que pode avançar de fase', async () => {
    const s = await buildStatus({ cfg: cfgWith(), now: () => t, state: store, jobs, accounts: async () => accs })
    expect(s.observation.hasData).toBe(false); expect(s.observation.readyToAdvance).toBe(false)
  })

  it('retenção de leads desligada por padrão: nunca apaga dado pessoal sem configurar', async () => {
    const purge = vi.fn(async () => 1)
    const r = await runRetention({ cfg: cfgWith(), now: () => t, state: store, jobs, purgeLeads: purge })
    expect(r.leadsPurged).toBe(0); expect(purge).not.toHaveBeenCalled()
  })
})

describe('avisos exibidos no status', () => {
  it('mostra só as últimas 24 h e esconde os já resolvidos (escrita aceita, token voltou)', async () => {
    const st = new MemoryLimitStore(() => t)
    const cfgOk = cfgWith({ acceptedWriteScopes: ['ads_management'] })
    await st.setSetting('token_check', { at: t, valid: true, appId: '1', type: 'USER', scopes: ['ads_management'], writeScopes: ['ads_management'], unaccepted: ['ads_management'], expiresAt: null })
    await st.insertAlert({ level: 'critical', kind: 'token_write_scope', message: 'antigo' })
    await st.insertAlert({ level: 'critical', kind: 'token_failure', message: 'antigo2' })
    await st.insertAlert({ level: 'warning', kind: 'account_blocked', message: 'conta bloqueada' })
    await st.insertAlert({ level: 'warning', kind: 'budget_usage', message: 'ruído' })
    const s = await buildStatus({ cfg: cfgOk, now: () => t, state: st, jobs: new MemoryJobStore(), accounts: async () => [] })
    expect(s.alerts.map(a => a.kind)).toEqual(['account_blocked'])
    // aviso de token com escrita volta a aparecer se o escopo NÃO estiver aceito
    const s2 = await buildStatus({ cfg: cfgWith(), now: () => t, state: st, jobs: new MemoryJobStore(), accounts: async () => [] })
    expect(s2.alerts.map(a => a.kind)).toContain('token_write_scope')
    // e alertas velhos (> 24 h) somem
    const s3 = await buildStatus({ cfg: cfgOk, now: () => t + 25 * 3_600_000, state: st, jobs: new MemoryJobStore(), accounts: async () => [] })
    expect(s3.alerts).toEqual([])
  })
})
