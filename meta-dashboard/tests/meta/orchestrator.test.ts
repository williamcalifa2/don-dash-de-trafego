import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLimitController } from '@/lib/meta/limits'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { MemoryJobStore } from '@/lib/meta/queue'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import { configWarnings, effectiveIntervalMs, enqueueDue, inBusinessHours, isDue, runCycle, workQueue, type CycleReport, type OrchDeps } from '@/lib/meta/orchestrator'
import type { Account, CollectOutcome } from '@/lib/meta/collectors'
import { defaultAccountState } from '@/lib/meta/limits'
import { cfgWith } from './helpers'

const MIN = 60_000
// 2026-09-21 15:00 UTC = 12:00 em São Paulo (horário comercial)
const NOON = Date.UTC(2026, 8, 21, 15, 0, 0)
let t = NOON
let store: MemoryLimitStore, jobs: MemoryJobStore
const accounts = (n: number): Account[] => Array.from({ length: n }, (_, i) => ({ clientId: `c${i + 1}`, slug: `s${i + 1}`, adAccountId: `act_${1000000 + i}` }))

function deps(over: { cfg?: Parameters<typeof cfgWith>[0]; accs?: Account[]; collectors?: OrchDeps['collectors']; random?: () => number } = {}): { d: OrchDeps; alerts: string[] } {
  const cfg = cfgWith({ phase: 3, ...over.cfg })
  const alerts: string[] = []
  const limits = createLimitController({ store, config: () => cfg, now: () => t, notify: a => { alerts.push(a.kind) } })
  const d: OrchDeps = {
    cfg, now: () => t, random: over.random ?? (() => 0.5), jobs, state: store, limits,
    accounts: async () => over.accs ?? accounts(3),
    collect: { cfg, now: () => t, get: vi.fn() as never, snaps: new MemorySnapshotStore(), state: store },
    checkToken: async () => { const r = { at: t, valid: true, appId: '1', type: 'USER', scopes: ['ads_read'], writeScopes: [], unaccepted: [], expiresAt: null }; await store.setSetting('token_check', r); return r },
    collectors: over.collectors,
  }
  return { d, alerts }
}
const ok = (calls = 1): CollectOutcome => ({ status: 'done', calls })
const enableAll = async (n: number) => { for (let i = 1; i <= n; i++) await store.patchState(`c${i}`, { enabled: true }) }
const emptyReport = (): CycleReport => ({ enqueued: 0, processed: 0, outcomes: [], dead: 0, warnings: [], owned: [] })

beforeEach(() => { t = NOON; store = new MemoryLimitStore(() => t); jobs = new MemoryJobStore() })

describe('TTL e frequência adaptativa', () => {
  const cfg = cfgWith()
  const st = (over = {}) => ({ ...defaultAccountState(), ...over })
  it('só fica devido depois do TTL do tipo', () => {
    const s = st({ lastSynced: { insights: NOON - 44 * MIN } })
    expect(isDue(cfg, 'insights', s, NOON)).toBe(false)
    expect(isDue(cfg, 'insights', st({ lastSynced: { insights: NOON - 46 * MIN } }), NOON)).toBe(true)
    expect(isDue(cfg, 'structure', st({ lastSynced: { structure: NOON - 7 * 60 * MIN } }), NOON)).toBe(false)
    expect(isDue(cfg, 'insights', st(), NOON)).toBe(true) // nunca sincronizou
  })
  it('fora do horário comercial o intervalo cresce; dentro, não', () => {
    const night = Date.UTC(2026, 8, 21, 5, 0, 0) // 02:00 em SP
    expect(inBusinessHours(cfg, NOON)).toBe(true)
    expect(inBusinessHours(cfg, night)).toBe(false)
    expect(effectiveIntervalMs(cfg, 'insights', st(), night)).toBe(effectiveIntervalMs(cfg, 'insights', st(), NOON) * cfg.offHoursIntervalMultiplier)
  })
  it('reincidência (freqMultiplier), conta perto do limiar e conta sem anúncios ativos espaçam mais', () => {
    const base = effectiveIntervalMs(cfg, 'insights', st(), NOON)
    expect(effectiveIntervalMs(cfg, 'insights', st({ freqMultiplier: 4 }), NOON)).toBe(base * 4)
    expect(effectiveIntervalMs(cfg, 'insights', st({ lastUsage: { maxPct: 50, appMaxPct: 0, accountMaxPct: 50, regainMinutes: 0, at: NOON } }), NOON)).toBe(base * 2)
    expect(effectiveIntervalMs(cfg, 'insights', st({ activeAds: 0 }), NOON)).toBe(cfg.idleAccountCheckHours * 60 * MIN)
  })
  it('avisa quando o TTL é menor que o intervalo do cron', () => {
    expect(configWarnings(cfgWith({ ttlLeadsReconcileMin: 5 }), 10).join(' ')).toContain('menor TTL')
    expect(configWarnings(cfgWith({ dryRun: true }), 10)).toEqual([])
    expect(configWarnings(cfgWith({ dryRun: false, phase: 0 }), 10).join(' ')).toContain('fase 0')
  })
})

describe('enfileiramento', () => {
  it('não enfileira nada quando tudo está dentro do TTL (ciclo sem chamadas)', async () => {
    await enableAll(3)
    for (const id of ['c1', 'c2', 'c3']) await store.patchState(id, { lastSynced: { insights: t - MIN, structure: t - MIN, leads: t - MIN } })
    const { d } = deps()
    expect(await enqueueDue(d)).toBe(0)
  })

  it('dedupe: ciclos repetidos não duplicam jobs pendentes', async () => {
    await enableAll(1)
    const { d } = deps({ accs: accounts(1) })
    expect(await enqueueDue(d)).toBe(3)
    expect(await enqueueDue(d)).toBe(0)
    expect(jobs.jobs).toHaveLength(3)
  })

  it('escalona: cada job ganha atraso aleatório dentro da janela configurada', async () => {
    await enableAll(1)
    const { d } = deps({ accs: accounts(1), random: () => 0.75, cfg: { jobStaggerMaxSec: 240 } })
    await enqueueDue(d)
    for (const j of jobs.jobs) expect(j.runAfter).toBe(t + 180_000)
    expect(await jobs.claim(t, 120_000, 2)).toBeNull() // ainda não venceu
  })

  it('proteção contra rajada: após uma pane (tudo vencido) o ciclo enfileira no máximo N jobs', async () => {
    await enableAll(10)
    const { d } = deps({ accs: accounts(10), cfg: { maxEnqueuePerCycle: 4 } })
    expect(await enqueueDue(d)).toBe(4)
    expect(jobs.jobs).toHaveLength(4)
  })

  it('só contas habilitadas, dentro do limite da fase; fase 0 não roda nada de verdade', async () => {
    await enableAll(4)
    const p1 = deps({ accs: accounts(4), cfg: { phase: 1, phaseMaxAccounts: { 1: 1, 2: 5, 3: 10000 } } })
    await enqueueDue(p1.d)
    expect(new Set(jobs.jobs.map(j => j.clientId)).size).toBe(1)

    jobs = new MemoryJobStore()
    const p0 = deps({ accs: accounts(4), cfg: { phase: 0 } })
    expect(await enqueueDue(p0.d)).toBe(0)
  })

  it('conta pausada, suspensa ou bloqueada não entra na fila (todas as outras entram sozinhas)', async () => {
    await store.patchState('c2', { paused: true })
    await store.patchState('c3', { suspended: true })
    await store.patchState('c4', { blockedUntil: t + 10 * MIN })
    const { d } = deps({ accs: accounts(4).slice(1) })
    expect(await enqueueDue(d)).toBe(0)
  })

  it('DRY_RUN considera todas as contas (para prever o volume) e usa relógio separado', async () => {
    const { d } = deps({ accs: accounts(2), cfg: { dryRun: true, phase: 0, maxEnqueuePerCycle: 4 } })
    expect(await enqueueDue(d)).toBe(4)
    for (const j of jobs.jobs) await jobs.complete(j.id, t)
    await store.patchState('c1', { lastSynced: { dry_insights: t, dry_structure: t, dry_leads: t } })
    await store.patchState('c2', { lastSynced: { dry_insights: t, dry_structure: t, dry_leads: t } })
    expect(await enqueueDue(d)).toBe(0)
  })
})

describe('trava do cron e reinício', () => {
  it('ciclos sobrepostos: o segundo é ignorado enquanto o primeiro segura a trava', async () => {
    await enableAll(1)
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    const collectors = { insights: async () => { await held; return ok() }, structure: async () => ok(), leads: async () => ok() }
    const { d } = deps({ accs: accounts(1), collectors, random: () => 0 })
    await runCycle(d, 'A')          // 1º: enfileira (jobs vencem depois)
    t += 1000
    const first = runCycle(d, 'A')   // 2º ciclo do dono A: processa e fica preso
    await new Promise(r => setTimeout(r, 5))
    const second = await runCycle(d, 'B')
    expect(second.skipped).toContain('anterior')
    release(); await first
    expect((await runCycle(d, 'B')).skipped).toBeUndefined() // trava liberada
  })

  it('trava vencida (ciclo que morreu) não bloqueia para sempre', async () => {
    await store.tryLock('cron', 240_000, 'morto')
    const { d } = deps()
    t += 241_000
    expect((await runCycle(d, 'novo')).skipped).toBeUndefined()
  })

  it('reinício/deploy com tudo vencido: nenhum burst; jobs saem escalonados e respeitando a concorrência', async () => {
    await enableAll(10)
    const running: number[] = []; let live = 0; let peak = 0
    const slow = async () => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 2)); live--; running.push(1); return ok() }
    const collectors = { insights: slow, structure: slow, leads: slow }
    const { d } = deps({ accs: accounts(10), collectors, cfg: { maxEnqueuePerCycle: 4, jobStaggerMaxSec: 240, workerGlobalConcurrency: 2 }, random: () => 0.9 })
    const r1 = await runCycle(d, 'x')
    expect(r1.enqueued).toBe(4)
    expect(r1.processed).toBe(0)          // recém-enfileirados, ainda dentro do atraso aleatório
    t += 5 * MIN
    const r2 = await runCycle(d, 'x')
    expect(r2.processed).toBe(4)          // processa só o que estava na fila
    expect(r2.enqueued).toBe(4)           // e mais um lote pequeno, nunca todas as 30
    expect(peak).toBeLessThanOrEqual(2)
    expect(jobs.jobs.filter(j => j.status === 'pending').length).toBeLessThanOrEqual(4)
  })

  it('sistema pausado, kill switch ou token inválido: o ciclo não faz nada', async () => {
    await enableAll(1)
    const { d } = deps({ accs: accounts(1) })
    await d.limits.pauseSystem()
    expect((await runCycle(d, 'a')).skipped).toBe('sistema pausado')
    await d.limits.resumeSystem(); await d.limits.activateKill('t')
    expect((await runCycle(d, 'a')).skipped).toBe('kill switch ativo')
    expect(jobs.jobs).toHaveLength(0)

    const bad = deps({ accs: accounts(1) })
    await store.setSetting('kill', { until: 0, since: 0, reason: '' })
    bad.d.checkToken = async () => { const r = { at: t, valid: true, appId: '1', type: 'USER', scopes: ['ads_management'], writeScopes: ['ads_management'], unaccepted: ['ads_management'], expiresAt: null }; await store.setSetting('token_check', r); return r }
    await store.setSetting('token_check', null)
    expect((await runCycle(bad.d, 'a')).skipped).toBe('token: token_write_scope')
    expect(jobs.jobs).toHaveLength(0)
  })
})

describe('worker', () => {
  const claimOne = async (kind: 'insights' | 'structure' | 'leads' = 'insights') => { await jobs.enqueue('c1', kind, t, t) }

  it('1 job por conta por vez e concorrência global', async () => {
    await jobs.enqueue('c1', 'insights', t, t); await jobs.enqueue('c1', 'structure', t, t); await jobs.enqueue('c2', 'insights', t, t); await jobs.enqueue('c3', 'insights', t, t)
    const a = await jobs.claim(t, 120_000, 2)
    const b = await jobs.claim(t, 120_000, 2)
    expect(a!.clientId).not.toBe(b!.clientId)              // duas contas diferentes
    expect(await jobs.claim(t, 120_000, 2)).toBeNull()      // teto global de 2
    await jobs.complete(a!.id, t)
    const c = await jobs.claim(t, 120_000, 2)
    expect(c!.clientId).not.toBe(b!.clientId)               // nunca 2 da mesma conta
  })

  it('adiado (conta bloqueada) não gasta tentativa e respeita blocked_until', async () => {
    await claimOne(); await store.patchState('c1', { blockedUntil: t + 30 * MIN })
    const collectors = { insights: async (): Promise<CollectOutcome> => ({ status: 'deferred', reason: 'account_blocked', calls: 0 }), structure: async () => ok(), leads: async () => ok() }
    const { d } = deps({ accs: accounts(1), collectors })
    await workQueue(d, emptyReport(), t)
    const j = jobs.jobs[0]
    expect(j.status).toBe('pending'); expect(j.attempts).toBe(0)
    expect(j.runAfter).toBeGreaterThanOrEqual(t + 30 * MIN)
    // e não é pego de novo antes da hora (sem laço)
    const r = emptyReport(); await workQueue(d, r, t); expect(r.processed).toBe(0)
  })

  it('adiamento nunca volta imediatamente (piso com jitter)', async () => {
    await claimOne()
    const collectors = { insights: async (): Promise<CollectOutcome> => ({ status: 'deferred', reason: 'cap_account_hour', calls: 0 }), structure: async () => ok(), leads: async () => ok() }
    const { d } = deps({ accs: accounts(1), collectors, random: () => 0 })
    await workQueue(d, emptyReport(), t)
    expect(jobs.jobs[0].runAfter).toBeGreaterThanOrEqual(t + d.cfg.resumeStepSec * 1000)
  })

  it('falha com backoff exponencial; esgotou tentativas = dead-letter + alerta, sem reprocessar sozinho', async () => {
    await claimOne()
    const collectors = { insights: async (): Promise<CollectOutcome> => ({ status: 'failed', error: 'boom', calls: 1 }), structure: async () => ok(), leads: async () => ok() }
    const { d, alerts } = deps({ accs: accounts(1), collectors, cfg: { jobMaxAttempts: 3, jobRetryBaseSec: 300 }, random: () => 1 })
    await enableAll(1)
    await workQueue(d, emptyReport(), t)
    expect(jobs.jobs[0]).toMatchObject({ status: 'pending', attempts: 1 }); expect(jobs.jobs[0].runAfter).toBe(t + 300_000)
    t += 301_000; await workQueue(d, emptyReport(), t)
    expect(jobs.jobs[0].runAfter).toBe(t + 600_000)             // dobrou
    t += 601_000
    const rep = emptyReport(); await workQueue(d, rep, t)
    expect(jobs.jobs[0].status).toBe('dead'); expect(rep.dead).toBe(1)
    expect(alerts).toContain('dead_letter')

    // muito tempo depois, com o tipo vencido: NÃO cria job novo por conta própria
    t += 10 * 60 * MIN
    expect(await enqueueDue(d)).toBeLessThanOrEqual(2) // structure/leads podem entrar, insights não
    expect(jobs.jobs.filter(j => j.kind === 'insights')).toHaveLength(1)
    expect(jobs.jobs.find(j => j.kind === 'insights')!.status).toBe('dead')
    // só a ação manual reabre
    expect(await jobs.requeueDead(jobs.jobs[0].id, t)).toBe(true)
    expect(jobs.jobs[0]).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('exceção do coletor vira falha controlada (não derruba o ciclo)', async () => {
    await claimOne()
    const collectors = { insights: async (): Promise<CollectOutcome> => { throw new Error('bug') }, structure: async () => ok(), leads: async () => ok() }
    const { d } = deps({ accs: accounts(1), collectors })
    const rep = emptyReport(); await workQueue(d, rep, t)
    expect(rep.outcomes[0].status).toBe('failed')
  })

  it('lease vencido (worker morreu): job volta à fila; sem tentativas restantes vai para dead', async () => {
    await claimOne(); const j = await jobs.claim(t, 1000, 2)
    expect(j).not.toBeNull()
    t += 5000
    expect(await jobs.reapExpired(t, 3)).toBe(1)
    expect(jobs.jobs[0].status).toBe('pending')
    jobs.jobs[0].status = 'running'; jobs.jobs[0].attempts = 3; jobs.jobs[0].lockedUntil = t - 1
    await jobs.reapExpired(t, 3)
    expect(jobs.jobs[0].status).toBe('dead')
  })

  it('respeita o orçamento de tempo do worker', async () => {
    for (let i = 1; i <= 3; i++) await jobs.enqueue(`c${i}`, 'insights', t, t)
    const collectors = { insights: async () => { t += 30_000; return ok() }, structure: async () => ok(), leads: async () => ok() }
    const { d } = deps({ accs: accounts(3), collectors, cfg: { workerBudgetSec: 45, workerGlobalConcurrency: 5 } })
    const rep = emptyReport(); await workQueue(d, rep, t)
    expect(rep.processed).toBe(2) // 30s + 30s passa de 45s: para
  })
})

describe('recuperação sozinha (token trocado e jobs mortos)', () => {
  it('pausa por token inválido: quando o token volta a valer, o sistema retoma sozinho', async () => {
    const { d, alerts } = deps({ accs: accounts(1) })
    await enableAll(1)
    await store.setSetting('system_paused', { paused: true, reason: 'token_invalid', at: t - 60 * MIN })
    await store.setSetting('token_check', { at: t - 10 * MIN, valid: false, appId: null, type: null, scopes: [], writeScopes: [], unaccepted: [], expiresAt: null, error: 'expirou' })
    const r = await runCycle(d, 'x')
    expect(r.skipped).toBeUndefined()
    expect((await store.getSetting<{ paused: boolean }>('system_paused'))?.paused).toBe(false)
    expect(alerts).toContain('token_recovered')
  })

  it('pausa por token inválido com token ainda inválido: continua pausado (sem insistir mais que a cada 5 min)', async () => {
    const { d } = deps({ accs: accounts(1) })
    let checks = 0
    d.checkToken = async () => { checks++; const r = { at: t, valid: false, appId: null, type: null, scopes: [], writeScopes: [], unaccepted: [], expiresAt: null }; await store.setSetting('token_check', r); return r }
    await store.setSetting('system_paused', { paused: true, reason: 'token_invalid', at: t - 60 * MIN })
    await store.setSetting('token_check', { at: t - 10 * MIN, valid: false, appId: null, type: null, scopes: [], writeScopes: [], unaccepted: [], expiresAt: null })
    expect((await runCycle(d, 'x')).skipped).toBe('sistema pausado')
    t += 2 * MIN
    await runCycle(d, 'x')
    expect(checks).toBe(1)
  })

  it('pausa manual não é desfeita sozinha, mesmo com token válido', async () => {
    const { d } = deps({ accs: accounts(1) })
    await store.setSetting('system_paused', { paused: true, reason: 'manual', at: t })
    expect((await runCycle(d, 'x')).skipped).toBe('sistema pausado')
  })

  it('token trocado (impressão digital diferente) é revalidado na hora, sem esperar 24 h', async () => {
    const { d } = deps({ accs: accounts(1) })
    let checks = 0
    const inner = d.checkToken
    d.checkToken = async () => { checks++; return inner() }
    d.tokenFingerprint = () => 'novo'
    await store.setSetting('token_check', { at: t - 5 * MIN, valid: true, appId: '1', type: 'USER', scopes: [], writeScopes: [], unaccepted: [], expiresAt: null, fp: 'antigo' })
    await runCycle(d, 'x')
    expect(checks).toBe(1)
  })

  it('job que morreu volta sozinho para a fila depois de um tempo', async () => {
    const { d } = deps({ accs: accounts(1) })
    await jobs.enqueue('c1', 'leads', t, t)
    const job = await jobs.claim(t, 60_000, 5)
    await jobs.fail(job!.id, 'A Meta negou permissão', null, t)
    expect((await jobs.counts()).dead).toBe(1)
    const { retryStaleDead } = await import('@/lib/meta/orchestrator')
    expect(await retryStaleDead(d)).toBe(0) // ainda cedo
    t += 31 * MIN
    expect(await retryStaleDead(d)).toBe(1)
    expect((await jobs.counts()).dead).toBe(0)
  })
})
