import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateAutopilot, initialAutopilot, runtimeFor, type AutopilotState, type Health, type Observation } from '@/lib/meta/autopilot'
import { autoReleaseSuspended, runCycle, type OrchDeps } from '@/lib/meta/orchestrator'
import { createLimitController } from '@/lib/meta/limits'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { MemoryJobStore } from '@/lib/meta/queue'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import type { Account } from '@/lib/meta/collectors'
import { cfgWith } from './helpers'

const H = 3_600_000
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0)
const cfg = cfgWith({ autopilot: true, autopilotStageHours: 48, advancePeakPct: 30, usageThresholdPct: 60 })
const clean: Observation = { hasData: true, rateLimitErrors: 0, peakAccountPct: 7, peakAppPct: 2 }
const healthy: Health = { tokenOk: true, killActive: false, suspendedCount: 0, allFresh: true }
const at = (phase: number, hoursAgo: number, cutover = false): AutopilotState => ({ phase, since: NOW - hoursAgo * H, cutover, lastEval: 0 })

describe('máquina de estados do piloto automático', () => {
  it('nasce em simulação (fase 0, painel antigo ligado)', () => {
    expect(runtimeFor(initialAutopilot(NOW))).toEqual({ dryRun: true, phase: 0, legacyLive: true })
  })

  it('só avança depois de 48 h limpas; antes disso fica onde está', () => {
    expect(evaluateAutopilot(at(0, 47), clean, healthy, cfg, NOW).state.phase).toBe(0)
    const r = evaluateAutopilot(at(0, 48), clean, healthy, cfg, NOW)
    expect(r.state).toMatchObject({ phase: 1, since: NOW }); expect(r.event).toMatchObject({ kind: 'advance', from: 0, to: 1 })
  })

  it('percorre 0 -> 1 -> 2 -> 3 e, na fase 3 estável com dados frescos, faz o corte', () => {
    let st = at(0, 48)
    for (const expected of [1, 2, 3]) { st = evaluateAutopilot(st, clean, healthy, cfg, NOW).state; expect(st.phase).toBe(expected); st = { ...st, since: NOW - 48 * H } }
    const r = evaluateAutopilot(st, clean, healthy, cfg, NOW)
    expect(r.event?.kind).toBe('cutover'); expect(runtimeFor(r.state)).toEqual({ dryRun: false, phase: 3, legacyLive: false })
  })

  it('sem dados frescos em todas as contas, não faz o corte', () => {
    expect(evaluateAutopilot(at(3, 60), clean, { ...healthy, allFresh: false }, cfg, NOW).state.cutover).toBe(false)
  })

  it.each([
    ['sem dados observados', { ...clean, hasData: false }, healthy],
    ['uso acima de 30%', { ...clean, peakAccountPct: 35 }, healthy],
    ['token com problema', clean, { ...healthy, tokenOk: false }],
  ])('não avança: %s', (_n, obs, h) => {
    expect(evaluateAutopilot(at(1, 100), obs as Observation, h as Health, cfg, NOW).state.phase).toBe(1)
  })

  it.each([
    ['erro de limite da Meta', { ...clean, rateLimitErrors: 1 }, healthy],
    ['kill switch', clean, { ...healthy, killActive: true }],
    ['conta suspensa', clean, { ...healthy, suspendedCount: 1 }],
    ['uso no limiar de bloqueio', { ...clean, peakAccountPct: 61 }, healthy],
  ])('recua uma etapa e reinicia a observação: %s', (_n, obs, h) => {
    const r = evaluateAutopilot(at(2, 10), obs as Observation, h as Health, cfg, NOW)
    expect(r.state).toMatchObject({ phase: 1, since: NOW }); expect(r.event).toMatchObject({ kind: 'regress', from: 2, to: 1 })
  })

  it('problema depois do corte (limite da Meta, kill switch): o corte fica; o painel segue lendo o banco, sem voltar ao modo ao vivo', () => {
    const r = evaluateAutopilot(at(3, 10, true), { ...clean, rateLimitErrors: 2 }, { ...healthy, killActive: true }, cfg, NOW)
    expect(r.state).toMatchObject({ phase: 3, cutover: true }); expect(r.event).toBeUndefined()
    expect(runtimeFor(r.state).legacyLive).toBe(false)
  })

  it('já na simulação, um problema só reinicia o relógio (nunca fica abaixo de 0)', () => {
    const r = evaluateAutopilot(at(0, 30), { ...clean, rateLimitErrors: 1 }, healthy, cfg, NOW)
    expect(r.state.phase).toBe(0); expect(r.state.since).toBe(NOW); expect(r.event).toBeUndefined()
  })
})

describe('piloto automático no ciclo do cron', () => {
  let store: MemoryLimitStore, t: number
  const accs: Account[] = [1, 2, 3].map(i => ({ clientId: `c${i}`, slug: `s${i}`, adAccountId: `act_100000${i}` }))
  const mk = (over = {}): { d: OrchDeps; alerts: string[] } => {
    const c = cfgWith({ autopilot: true, phase: 0, dryRun: true, ...over })
    const alerts: string[] = []
    const limits = createLimitController({ store, config: () => c, now: () => t, notify: a => { alerts.push(a.kind) } })
    const d: OrchDeps = {
      cfg: c, now: () => t, random: () => 0, jobs: new MemoryJobStore(), state: store, limits, accounts: async () => accs,
      collect: { cfg: c, now: () => t, get: (async () => ({ ok: true, status: 200, data: {}, attempts: 1 })) as never, snaps: new MemorySnapshotStore(), state: store },
      checkToken: async () => { const r = { at: t, valid: true, appId: '1', type: 'USER', scopes: ['ads_read'], writeScopes: [], unaccepted: [], expiresAt: null }; await store.setSetting('token_check', r); return r },
      collectors: { insights: async () => ({ status: 'dry', calls: 5 }), structure: async () => ({ status: 'dry', calls: 4 }), leads: async () => ({ status: 'dry', calls: 3 }) },
    }
    return { d, alerts }
  }
  beforeEach(() => { t = NOW; store = new MemoryLimitStore(() => t) })

  it('sem ninguém mexer: começa em simulação, e depois de 48 h com dados avança sozinho para a fase 1 (uma conta)', async () => {
    const { d, alerts } = mk()
    const usage = (n: number) => store.usage.push({ clientId: 'c1', endpoint: 'plan:x', calls: n, outcome: 'dry_run', dryRun: true, origin: 'pipeline', at: t })
    const r0 = await runCycle(d, 'a')
    expect(r0.autopilot).toMatchObject({ phase: 0, cutover: false }); expect(r0.owned).toEqual([])
    usage(50); t += 49 * H
    usage(50)
    const r1 = await runCycle(d, 'a')
    expect(r1.autopilot).toMatchObject({ phase: 1 })
    expect(alerts).toContain('autopilot_advance')
    expect(d.cfg.dryRun).toBe(false) // já opera de verdade neste mesmo ciclo
    expect(r1.owned).toEqual(['c1']) // fase 1: uma conta, escolhida sozinha (ordem estável)
  })

  it('erro de limite na fase 1 recua sozinho para a simulação e avisa', async () => {
    const { d, alerts } = mk()
    await store.setSetting('autopilot', { phase: 1, since: NOW - 10 * H, cutover: false, lastEval: 0 })
    store.usage.push({ clientId: 'c1', endpoint: 'x', calls: 1, outcome: 'rate_limit', dryRun: false, origin: 'pipeline', at: NOW - H })
    const r = await runCycle(d, 'a')
    expect(r.autopilot).toMatchObject({ phase: 0 }); expect(alerts).toContain('autopilot_regress')
    expect(d.cfg.dryRun).toBe(true)
  })

  it('avalia no máximo 1x por hora (não fica remexendo no estado a cada 10 min)', async () => {
    const { d } = mk()
    await runCycle(d, 'a')
    const first = (await store.getSetting<AutopilotState>('autopilot'))!.lastEval
    t += 10 * 60_000; await runCycle(d, 'b')
    expect((await store.getSetting<AutopilotState>('autopilot'))!.lastEval).toBe(first)
    t += 60 * 60_000; await runCycle(d, 'c')
    expect((await store.getSetting<AutopilotState>('autopilot'))!.lastEval).toBeGreaterThan(first)
  })

  it('kill switch com o sistema parado ainda faz o piloto recuar', async () => {
    const { d } = mk()
    await store.setSetting('autopilot', { phase: 2, since: NOW - 30 * H, cutover: false, lastEval: 0 })
    await d.limits.activateKill('teste')
    const r = await runCycle(d, 'a')
    expect(r.skipped).toBe('kill switch ativo'); expect(r.autopilot).toMatchObject({ phase: 1 })
  })

  it('piloto desligado (META_AUTOPILOT=false): não mexe no modo', async () => {
    const { d } = mk({ autopilot: false })
    expect((await runCycle(d, 'a')).autopilot).toBeUndefined()
    expect(await store.getSetting('autopilot')).toBeNull()
  })
})

describe('conta suspensa volta sozinha, em observação', () => {
  it('só depois de 24 h do último bloqueio; mantém o histórico para escalar mais rápido se repetir', async () => {
    const store = new MemoryLimitStore(() => NOW)
    const c = cfgWith({ suspendAutoReleaseHours: 24 })
    const limits = createLimitController({ store, config: () => c, now: () => NOW })
    const accs: Account[] = [{ clientId: 'c1', slug: 's', adAccountId: 'act_1000001' }]
    const d = { cfg: c, now: () => NOW, state: store, limits, accounts: async () => accs } as unknown as OrchDeps
    await store.patchState('c1', { suspended: true, blockEvents: [NOW - 30 * H, NOW - 26 * H, NOW - 10 * H], freqMultiplier: 8 })
    expect(await autoReleaseSuspended(d)).toEqual([])          // 10 h: cedo demais
    await store.patchState('c1', { blockEvents: [NOW - 60 * H, NOW - 50 * H, NOW - 25 * H] })
    expect(await autoReleaseSuspended(d)).toEqual(['c1'])
    const st = await store.getState('c1')
    expect(st.suspended).toBe(false); expect(st.blockEvents).toEqual([NOW - 25 * H]); expect(st.freqMultiplier).toBe(8)
    expect(await autoReleaseSuspended({ ...d, cfg: cfgWith({ suspendAutoReleaseHours: 0 }) } as OrchDeps)).toEqual([]) // 0 = manual
  })
})

describe('config efetiva', () => {
  it('o modo do piloto automático sobrepõe as variáveis; desligado, valem as variáveis', async () => {
    const { baseMetaConfig, metaConfig, resetMetaConfigForTests, setRuntimeOverride } = await import('@/lib/meta/config')
    resetMetaConfigForTests()
    expect(baseMetaConfig().autopilot).toBe(true); expect(metaConfig().dryRun).toBe(true) // ainda sem estado carregado: modo seguro
    setRuntimeOverride({ dryRun: false, phase: 2, legacyLive: false })
    expect(metaConfig()).toMatchObject({ dryRun: false, phase: 2, legacyLive: false })
    process.env.META_AUTOPILOT = 'false'; resetMetaConfigForTests(); setRuntimeOverride({ dryRun: false, phase: 3, legacyLive: false })
    expect(metaConfig()).toMatchObject({ dryRun: true, phase: 0, legacyLive: true }) // piloto desligado ignora o override
    delete process.env.META_AUTOPILOT; resetMetaConfigForTests()
  })
})
