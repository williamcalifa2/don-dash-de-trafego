import { beforeEach, describe, expect, it } from 'vitest'
import { accountHourlyCap, createLimitController, StoreNotMigrated, type LimitStore } from '@/lib/meta/limits'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { createMetaClient, type MetaCallContext, type MetaResult } from '@/lib/meta/client'
import type { UsageSnapshot } from '@/lib/meta/usage'
import { cfgWith, json } from './helpers'

const MIN = 60_000
let t = 1_800_000_000_000
const clock = () => t
let store: MemoryLimitStore
const cfg = cfgWith()
const pipe = (clientId = 'c1'): MetaCallContext => ({ origin: 'pipeline', purpose: 't', clientId, accountId: 'act_1234567' })
const legacy = (clientId = 'c1'): MetaCallContext => ({ ...pipe(clientId), origin: 'legacy' })
const REQ = { kind: 'account_edge', path: 'act_1234567/insights', calls: 1 }

function make(over: Partial<typeof cfg> = {}, s: LimitStore = store) {
  const alerts: string[] = []
  const c = createLimitController({ store: s, config: () => ({ ...cfg, ...over }), now: clock, notify: a => { alerts.push(a.kind) } })
  return { c, alerts }
}
const usage = (o: Partial<UsageSnapshot> = {}): UsageSnapshot => ({ app: null, buc: {}, adAccount: null, maxPct: 0, appMaxPct: 0, accountMaxPct: 0, regainMinutes: 0, ...o })
const okRes = (u?: UsageSnapshot): MetaResult => ({ ok: true, status: 200, data: {}, attempts: 1, usage: u })
const errRes = (code: number, u?: UsageSnapshot): MetaResult => ({ ok: false, status: 400, data: {}, attempts: 1, usage: u, error: { kind: code === 190 ? 'token' : 'rate_limit', code, status: 400, message: 'x' } })
const enable = (id = 'c1') => store.patchState(id, { enabled: true })

const goodToken = () => store.setSetting('token_check', { at: t, valid: true, appId: '1', type: 'USER', scopes: ['ads_read'], writeScopes: [], unaccepted: [], expiresAt: null })
beforeEach(async () => { t = 1_800_000_000_000; store = new MemoryLimitStore(clock); await goodToken() })

describe('gate: chaves e flags', () => {
  it('conta nova entra sozinha: sem chave "ligar", pipeline e painel passam', async () => {
    const { c } = make()
    expect((await c.gate(pipe(), REQ)).allow).toBe(true)
    expect((await c.gate(legacy(), REQ)).allow).toBe(true)
  })
  it('pausa por conta e pausa geral valem para todas as origens, sem deploy', async () => {
    const { c } = make(); await enable()
    await c.setAccountFlags('c1', { paused: true })
    expect(await c.gate(legacy(), REQ)).toEqual({ allow: false, reason: 'account_paused' })
    await c.setAccountFlags('c1', { paused: false })
    await c.pauseSystem()
    expect(await c.gate(legacy('outra'), REQ)).toEqual({ allow: false, reason: 'system_paused' })
    await c.resumeSystem()
    expect((await c.gate(pipe(), REQ)).allow).toBe(true)
  })
  it('falha ao ler o estado = não chama (gate lança e o cliente central bloqueia)', async () => {
    const broken = new MemoryLimitStore(clock); broken.getSetting = async () => { throw new Error('banco fora') }
    const { c } = make({}, broken)
    await expect(c.gate(pipe(), REQ)).rejects.toThrow('banco fora')
    const calls: string[] = []
    const client = createMetaClient({ config: () => cfg, fetchImpl: (async (u: string) => { calls.push(u); return json({}) }) as unknown as typeof fetch, getToken: () => 'T', gate: (x, r) => c.gate(x, r) })
    const r = await client.get('act_1234567/insights?fields=spend', pipe())
    expect(r.blocked).toBe('gate_error')
    expect(calls).toHaveLength(0)
  })
  it('tabelas não migradas: legacy segue, pipeline não roda', async () => {
    const s = new MemoryLimitStore(clock); s.getSetting = async () => { throw new StoreNotMigrated() }
    const { c } = make({}, s)
    expect((await c.gate(legacy(), REQ)).allow).toBe(true)
    expect(await c.gate(pipe(), REQ)).toEqual({ allow: false, reason: 'store_not_migrated' })
  })
})

describe('circuit breaker por conta', () => {
  it('erro de limite bloqueia só aquela conta (estimativa + margem) e as outras seguem', async () => {
    const { c, alerts } = make({ blockMarginSec: 120 }); await enable('c1'); await enable('c2')
    await c.onResult(pipe('c1'), errRes(17, usage({ regainMinutes: 10 })), { path: 'x', calls: 1 })
    const st = await store.getState('c1')
    expect(st.blockedUntil).toBe(t + (10 * 60 + 120) * 1000)
    expect(await c.gate(pipe('c1'), REQ)).toEqual({ allow: false, reason: 'account_blocked' })
    expect((await c.gate(pipe('c2'), REQ)).allow).toBe(true)
    expect(alerts).toContain('account_blocked')
    t += 13 * MIN
    expect((await c.gate(pipe('c1'), REQ)).allow).toBe(true)
  })

  it.each([17, 613, 80000, 80004, 80005])('código %i bloqueia a conta sem derrubar o app', async code => {
    const { c } = make(); await enable()
    await c.onResult(pipe(), errRes(code), { path: 'x', calls: 1 })
    expect((await store.getState('c1')).blockedUntil).not.toBeNull()
    expect(await store.getSetting('kill')).toBeNull()
  })

  it('sem estimativa da Meta usa a espera padrão da configuração', async () => {
    const { c } = make({ blockDefaultWaitSec: 900, blockMarginSec: 60 }); await enable()
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    expect((await store.getState('c1')).blockedUntil).toBe(t + 960_000)
  })

  it('uso acima do limiar (sem erro) também bloqueia; abaixo, não', async () => {
    const { c } = make({ usageThresholdPct: 60 }); await enable()
    await c.onResult(pipe(), okRes(usage({ accountMaxPct: 59, maxPct: 59 })), { path: 'x', calls: 1 })
    expect((await store.getState('c1')).blockedUntil).toBeNull()
    await c.onResult(pipe(), okRes(usage({ accountMaxPct: 61, maxPct: 61 })), { path: 'x', calls: 1 })
    expect((await store.getState('c1')).blockedUntil).not.toBeNull()
  })

  it('escalonamento: reincidência em 24h dobra a espera e reduz a frequência; 3 bloqueios suspendem', async () => {
    const { c, alerts } = make({ blockMarginSec: 0, blockDefaultWaitSec: 600 }); await enable()
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    let st = await store.getState('c1')
    expect(st.blockedUntil! - t).toBe(600_000)
    expect(st.freqMultiplier).toBe(1)

    t += 11 * MIN
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    st = await store.getState('c1')
    expect(st.blockedUntil! - t).toBe(1_200_000)   // dobrou
    expect(st.freqMultiplier).toBe(2)              // sincroniza menos
    expect(st.suspended).toBe(false)
    expect(alerts).toContain('block_recurrence')

    t += 21 * MIN
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    st = await store.getState('c1')
    expect(st.blockedUntil! - t).toBe(2_400_000)
    expect(st.suspended).toBe(true)
    expect(alerts).toContain('account_suspended')

    t += 24 * 60 * MIN // muito depois: suspensa continua até liberação manual
    expect(await c.gate(pipe(), REQ)).toEqual({ allow: false, reason: 'account_suspended' })
    await c.releaseAccount('c1')
    expect((await c.gate(pipe(), REQ)).allow).toBe(true)
  })

  it('bloqueios fora da janela de 24h não contam', async () => {
    const { c } = make({ blockMarginSec: 0, blockDefaultWaitSec: 600 }); await enable()
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    t += 25 * 60 * MIN
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    const st = await store.getState('c1')
    expect(st.blockedUntil! - t).toBe(600_000)
    expect(st.blockEvents).toHaveLength(1)
  })

  it('respostas em voo do mesmo episódio não contam como novo bloqueio', async () => {
    const { c } = make(); await enable()
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    await c.onResult(pipe(), errRes(17), { path: 'x', calls: 1 })
    expect((await store.getState('c1')).blockEvents).toHaveLength(1)
  })

  it('a espera nunca passa do máximo configurado', async () => {
    const { c } = make({ blockMaxWaitSec: 1000, blockDefaultWaitSec: 900, blockMarginSec: 0 }); await enable()
    await c.onResult(pipe(), errRes(17, usage({ regainMinutes: 600 })), { path: 'x', calls: 1 })
    expect((await store.getState('c1')).blockedUntil! - t).toBe(1_000_000)
  })
})

describe('kill switch global', () => {
  it('código 4 ISOLADO com o app longe do limite: só a conta que errou espera, o sistema segue', async () => {
    const { c, alerts } = make({ killSwitchMinutes: 30, softBlockMin: 10 }); await enable('c1'); await enable('c2')
    await c.onResult(pipe('c1'), errRes(4, usage({ appMaxPct: 3, maxPct: 3 })), { path: 'a/insights', calls: 1 })
    expect(alerts).not.toContain('kill_switch'); expect(alerts).toContain('account_blocked')
    expect(await c.gate(pipe('c1'), REQ)).toEqual({ allow: false, reason: 'account_blocked' })
    expect((await c.gate(pipe('c2'), REQ)).allow).toBe(true)
    const st = await store.getState('c1')
    expect(st.blockedUntil! - t).toBe(10 * MIN); expect(st.blockEvents).toHaveLength(0); expect(st.suspended).toBe(false) // não vira bloqueio "de verdade"
    expect(st.lastError).toMatch(/código 4/)
    t += 10 * MIN + 1
    expect((await c.gate(pipe('c1'), REQ)).allow).toBe(true)
  })

  it('erro código 4 grava código, subcódigo e mensagem da Meta no alerta', async () => {
    const seen: Array<{ kind: string; data?: unknown; message: string }> = []
    const cc = createLimitController({ store, config: () => ({ ...cfg }), now: clock, notify: a => { seen.push(a as never) } }); await enable('c1')
    const res = errRes(4, usage({ appMaxPct: 2 })); res.error = { ...res.error!, subcode: 1504022, message: 'Application request limit reached', type: 'OAuthException' }
    await cc.onResult(pipe('c1'), res, { path: 'act_1/insights', calls: 1 })
    const a = seen.find(x => x.kind === 'account_blocked')!
    expect(a.message).toContain('1504022'); expect(a.data).toMatchObject({ code: 4, subcode: 1504022, message: 'Application request limit reached', path: 'act_1/insights', appPct: 2 })
  })

  it('código 4 com uso do app alto, ou repetido em contas diferentes, pausa TUDO', async () => {
    const hi = make({ appErrorGlobalPct: 30 }); await enable('c1')
    await hi.c.onResult(pipe('c1'), errRes(4, usage({ appMaxPct: 35, maxPct: 35 })), { path: 'x', calls: 1 })
    expect(hi.alerts).toContain('kill_switch')
    store = new MemoryLimitStore(clock); await goodToken()
    const rep = make({ appErrorRepeat: 3, appErrorWindowMin: 60 }); await enable('c1'); await enable('c2'); await enable('c3')
    await rep.c.onResult(pipe('c1'), errRes(4, usage({ appMaxPct: 1 })), { path: 'x', calls: 1 })
    t += 5 * MIN; await rep.c.onResult(pipe('c2'), errRes(4, usage({ appMaxPct: 1 })), { path: 'x', calls: 1 })
    expect(rep.alerts).not.toContain('kill_switch')
    t += 5 * MIN; await rep.c.onResult(pipe('c3'), errRes(4, usage({ appMaxPct: 1 })), { path: 'x', calls: 1 })
    expect(rep.alerts).toContain('kill_switch') // 3 erros em 10 min: é limite de verdade
  })

  it('erros código 4 espaçados (fora da janela) não se acumulam', async () => {
    const { c, alerts } = make({ appErrorRepeat: 2, appErrorWindowMin: 60 }); await enable('c1'); await enable('c2')
    await c.onResult(pipe('c1'), errRes(4, usage({ appMaxPct: 1 })), { path: 'x', calls: 1 })
    t += 90 * MIN; await c.onResult(pipe('c2'), errRes(4, usage({ appMaxPct: 1 })), { path: 'x', calls: 1 })
    expect(alerts).not.toContain('kill_switch')
  })

  it('código 4 sem conta identificada: pausa TUDO (não há como isolar)', async () => {
    const { c, alerts } = make(); await enable('c1')
    await c.onResult({ origin: 'pipeline', purpose: 't' } as never, errRes(4, usage({ appMaxPct: 1 })), { path: 'x', calls: 1 })
    expect(alerts).toContain('kill_switch')
  })

  it('código 4 com o app no limite pausa TUDO por N minutos (todas as contas e origens)', async () => {
    const { c, alerts } = make({ killSwitchMinutes: 30 }); await enable('c1'); await enable('c2')
    await c.onResult(pipe('c1'), errRes(4, usage({ appMaxPct: 90, maxPct: 90 })), { path: 'x', calls: 1 })
    expect(alerts).toContain('kill_switch')
    for (const ctx of [pipe('c1'), pipe('c2'), legacy('c3')]) expect(await c.gate(ctx, REQ)).toEqual({ allow: false, reason: 'kill_switch' })
    t += 29 * MIN
    expect((await c.gate(pipe('c2'), REQ)).allow).toBe(false)
  })

  it('X-App-Usage acima do limiar aciona o kill switch mesmo sem erro', async () => {
    const { c } = make({ appUsageThresholdPct: 60 }); await enable()
    await c.onResult(pipe(), okRes(usage({ appMaxPct: 65, maxPct: 65 })), { path: 'x', calls: 1 })
    expect((await c.gate(pipe(), REQ)).allow).toBe(false)
  })

  it('retomada gradual: uma conta por vez, com intervalo', async () => {
    const { c } = make({ killSwitchMinutes: 30, resumeStepSec: 120 }); await enable('c1'); await enable('c2'); await enable('c3')
    await c.activateKill('teste')
    t += 30 * MIN + 1
    expect((await c.gate(pipe('c1'), REQ)).allow).toBe(true)                                  // primeira conta volta
    expect(await c.gate(pipe('c2'), REQ)).toEqual({ allow: false, reason: 'resuming' })       // segunda espera
    expect((await c.gate(pipe('c1'), REQ)).allow).toBe(true)                                   // a já admitida segue
    t += 121_000
    expect((await c.gate(pipe('c2'), REQ)).allow).toBe(true)
    expect(await c.gate(pipe('c3'), REQ)).toEqual({ allow: false, reason: 'resuming' })
    t += 121_000
    expect((await c.gate(pipe('c3'), REQ)).allow).toBe(true)
  })

  it('kill nunca é encurtado por um novo acionamento', async () => {
    const { c } = make({ killSwitchMinutes: 30 })
    await c.activateKill('a'); const first = (await store.getSetting<{ until: number }>('kill'))!.until
    t += 10 * MIN; await c.activateKill('b')
    expect((await store.getSetting<{ until: number }>('kill'))!.until).toBeGreaterThan(first)
  })

  it('limite sem conta identificada vira pausa geral curta (na dúvida, não chama)', async () => {
    const { c } = make()
    await c.onResult({ origin: 'legacy', purpose: 'x' }, errRes(17), { path: 'x', calls: 1 })
    expect((await c.gate(legacy('qualquer'), REQ)).allow).toBe(false)
  })
})

describe('token', () => {
  it('token inválido pausa o sistema todo e alerta; nada insiste', async () => {
    const { c, alerts } = make(); await enable()
    await c.onResult(pipe(), errRes(190), { path: 'x', calls: 1 })
    expect(alerts).toContain('token_failure')
    expect(await c.gate(pipe(), REQ)).toEqual({ allow: false, reason: 'system_paused' })
    await c.resumeSystem()
    expect((await c.gate(pipe(), REQ)).allow).toBe(true)
  })
})

describe('tetos e orçamento', () => {
  it('orçamento interno = % da quota estimada pelos anúncios ativos, limitado pelo teto absoluto', () => {
    const base = cfgWith({ internalBudgetPct: 40, budgetBase: 300, budgetPerActiveAd: 40, maxCallsPerAccountHour: 60 })
    expect(accountHourlyCap(base, 0)).toBe(60)   // 40% de 300 = 120, limitado pelo teto 60
    expect(accountHourlyCap({ ...base, maxCallsPerAccountHour: 1000 }, 0)).toBe(120)
    expect(accountHourlyCap({ ...base, maxCallsPerAccountHour: 1000 }, 10)).toBe(280)  // 40% de 700
  })

  it('teto por conta/hora adia o resto para o próximo ciclo (um batch conta N)', async () => {
    const { c } = make({ maxCallsPerAccountHour: 10 }); await enable()
    for (let i = 0; i < 8; i++) store.usage.push({ clientId: 'c1', endpoint: 'x', calls: 1, outcome: 'ok', dryRun: false, origin: 'pipeline', at: t - i * MIN })
    expect((await c.gate(pipe(), { ...REQ, calls: 2 })).allow).toBe(true)
    expect(await c.gate(pipe(), { ...REQ, calls: 3 })).toEqual({ allow: false, reason: 'cap_account_hour' })
    t += 61 * MIN // a hora passa
    expect((await c.gate(pipe(), { ...REQ, calls: 3 })).allow).toBe(true)
  })

  it('teto por app/hora vale para todas as contas; dry_run e bloqueadas não contam', async () => {
    const { c } = make({ maxCallsPerAppHour: 5 }); await enable('c1'); await enable('c2')
    for (let i = 0; i < 3; i++) store.usage.push({ clientId: 'c2', endpoint: 'x', calls: 1, outcome: 'ok', dryRun: false, origin: 'pipeline', at: t })
    store.usage.push({ clientId: 'c2', endpoint: 'x', calls: 50, outcome: 'dry_run', dryRun: true, origin: 'pipeline', at: t })
    store.usage.push({ clientId: 'c2', endpoint: 'x', calls: 50, outcome: 'blocked_account_blocked', dryRun: false, origin: 'pipeline', at: t })
    expect((await c.gate(pipe('c1'), { ...REQ, calls: 2 })).allow).toBe(true)
    expect(await c.gate(pipe('c1'), { ...REQ, calls: 3 })).toEqual({ allow: false, reason: 'cap_app_hour' })
  })

  it('tetos duros valem só para o pipeline: o painel antigo não é barrado por eles (segue sob breaker/kill)', async () => {
    const { c } = make({ maxCallsPerAccountHour: 10, maxCallsPerAppHour: 10 }); await enable()
    for (let i = 0; i < 50; i++) store.usage.push({ clientId: 'c1', endpoint: 'x', calls: 1, outcome: 'ok', dryRun: false, origin: 'legacy', at: t })
    expect((await c.gate(legacy(), REQ)).allow).toBe(true)
    expect(await c.gate(pipe(), REQ)).toEqual({ allow: false, reason: 'cap_app_hour' })
    await c.blockAccount('c1', 10, 'teste')
    expect(await c.gate(legacy(), REQ)).toEqual({ allow: false, reason: 'account_blocked' }) // breaker continua valendo
  })

  it('alerta de orçamento só para o pipeline (tráfego do painel antigo não polui)', async () => {
    const { c, alerts } = make({ maxCallsPerAccountHour: 10, budgetAlertPct: 50 }); await enable()
    for (let i = 0; i < 9; i++) store.usage.push({ clientId: 'c1', endpoint: 'x', calls: 1, outcome: 'ok', dryRun: false, origin: 'legacy', at: t })
    await c.onResult(legacy(), okRes(), { path: 'x', calls: 1 })
    expect(alerts).not.toContain('budget_usage')
  })

  it('alerta quando a conta passa de 50% do orçamento interno (uma vez por janela)', async () => {
    const { c, alerts } = make({ maxCallsPerAccountHour: 10, budgetAlertPct: 50 }); await enable()
    for (let i = 0; i < 6; i++) store.usage.push({ clientId: 'c1', endpoint: 'x', calls: 1, outcome: 'ok', dryRun: false, origin: 'pipeline', at: t })
    await c.onResult(pipe(), okRes(), { path: 'x', calls: 1 })
    await c.onResult(pipe(), okRes(), { path: 'x', calls: 1 })
    expect(alerts.filter(a => a === 'budget_usage')).toHaveLength(1)
  })
})

describe('integração cliente + controle', () => {
  it('bloqueio real: depois de um erro de limite, a conta não faz nenhuma chamada de rede', async () => {
    const { c } = make(); await enable()
    let n = 0
    const client = createMetaClient({
      config: () => cfg, getToken: () => 'T', sleep: async () => {}, random: () => 0.5,
      fetchImpl: (async () => { n++; return json({ error: { code: 17, message: 'limite' } }, { status: 400 }) }) as unknown as typeof fetch,
      gate: (x, r) => c.gate(x, r), onResult: (x, r, m) => c.onResult(x, r, m), record: e => c.record(e),
    })
    const first = await client.get('act_1234567/insights?fields=spend', pipe())
    expect(first.error?.kind).toBe('rate_limit')
    for (let i = 0; i < 5; i++) {
      const r = await client.get(`act_1234567/insights?fields=spend&date_preset=today&limit=${10 + i}`, pipe())
      expect(r.blocked).toBe('account_blocked')
    }
    expect(n).toBe(1)
    expect(store.usage.filter(u => u.outcome === 'rate_limit')).toHaveLength(1)
  })
})

describe('validação do token (essential) não fica presa nos tetos nem na pausa', () => {
  it('passa mesmo com o teto por hora estourado e com o sistema pausado; as demais chamadas seguem barradas', async () => {
    const { c } = make({ maxCallsPerAppHour: 5 })
    for (let i = 0; i < 6; i++) await store.insertUsage({ endpoint: 'x', calls: 1, outcome: 'ok', dryRun: false, origin: 'pipeline', at: t - MIN })
    const tokenCtx: MetaCallContext = { origin: 'pipeline', purpose: 'token_check', essential: true }
    expect((await c.gate(pipe(), REQ))).toEqual({ allow: false, reason: 'cap_app_hour' })
    expect((await c.gate(tokenCtx, { kind: 'debug_token', path: 'debug_token', calls: 1 })).allow).toBe(true)
    await c.pauseSystem('token_invalid')
    expect((await c.gate(tokenCtx, { kind: 'debug_token', path: 'debug_token', calls: 1 })).allow).toBe(true)
    expect((await c.gate(pipe(), REQ)).allow).toBe(false)
  })
})
