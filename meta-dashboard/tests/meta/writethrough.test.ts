import { describe, expect, it } from 'vitest'
import { writeThroughMetrics } from '@/lib/meta/writeThrough'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import type { RawMetrics } from '@/lib/meta'

const raw = (over: Partial<RawMetrics> = {}): RawMetrics => ({ account: {}, summaryRow: { spend: '10' }, prevRow: { spend: '8' }, dailyRows: [{ date_start: '2026-09-20', spend: '5' }], campaigns: [], ...over })

describe('o que o painel do cliente lê ao vivo também vai para o banco (cards do admin)', () => {
  it('grava o resumo do período e junta os dias na série diária, sem duplicar', async () => {
    const s = new MemorySnapshotStore()
    await s.put('c1', 'daily', 'last_30d', [{ date_start: '2026-09-19', spend: '1' }, { date_start: '2026-09-20', spend: '2' }], 1)
    await writeThroughMetrics(s, 'c1', 'last_7d', raw(), 100)
    expect((await s.get('c1', 'summary', 'last_7d'))?.payload).toEqual({ row: { spend: '10' }, prev: { spend: '8' } })
    const daily = (await s.get<Array<{ date_start: string; spend: string }>>('c1', 'daily', 'last_30d'))!
    expect(daily.payload).toEqual([{ date_start: '2026-09-19', spend: '1' }, { date_start: '2026-09-20', spend: '5' }]) // o dia repetido é atualizado
    expect(daily.fetchedAt).toBe(100)
  })
  it('"hoje" só atualiza o resumo de hoje e não entra na série diária (que termina ontem)', async () => {
    const s = new MemorySnapshotStore()
    await writeThroughMetrics(s, 'c1', 'today', raw({ dailyRows: [{ date_start: '2026-09-21', spend: '3' }] }), 100)
    expect(await s.get('c1', 'summary', 'today')).not.toBeNull()
    expect(await s.get('c1', 'daily', 'last_30d')).toBeNull()
  })
  it('sem dados do período não grava nada', async () => {
    const s = new MemorySnapshotStore()
    await writeThroughMetrics(s, 'c1', 'last_7d', raw({ summaryRow: undefined }), 100)
    expect(s.data.size).toBe(0)
  })
  it('a série diária guarda no máximo 30 dias', async () => {
    const s = new MemorySnapshotStore()
    const days = Array.from({ length: 40 }, (_, i) => ({ date_start: `2026-08-${String(i + 1).padStart(2, '0')}`.replace('2026-08-3', '2026-09-0').replace('2026-08-4', '2026-09-1'), spend: '1' }))
    await writeThroughMetrics(s, 'c1', 'last_30d', raw({ dailyRows: days }), 100)
    expect(((await s.get<unknown[]>('c1', 'daily', 'last_30d'))!.payload).length).toBeLessThanOrEqual(30)
  })
})

import { refreshCards } from '@/lib/meta/refreshCards'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import type { CollectDeps, Account } from '@/lib/meta/collectors'
import type { MetaResult } from '@/lib/meta/client'
import { cfgWith } from './helpers'

describe('"Atualizar tudo" do admin', () => {
  const NOW = Date.UTC(2026, 8, 21, 15)
  const accs: Account[] = [1, 2, 3].map(i => ({ clientId: `c${i}`, slug: `s${i}`, adAccountId: `act_100000${i}` }))
  const res = <T,>(data: T, over: Partial<MetaResult<T>> = {}): MetaResult<T> => ({ ok: true, status: 200, data, attempts: 1, ...over })
  const make = (get: CollectDeps['get']) => { const snaps = new MemorySnapshotStore(), state = new MemoryLimitStore(() => NOW); return { snaps, state, d: { cfg: cfgWith(), now: () => NOW, get, snaps, state } as CollectDeps } }

  it('grava o total de hoje e junta os dias na série de cada conta, com 2 consultas por conta', async () => {
    let calls = 0
    const { d, snaps, state } = make((async (p: string) => { calls++; return res({ data: p.includes('time_increment') ? [{ date_start: '2026-09-20', spend: '7' }] : [{ spend: '3' }] }) }) as CollectDeps['get'])
    const r = await refreshCards(d, accs)
    expect(r).toMatchObject({ total: 3, refreshed: 3, failed: 0, skipped: 0 }); expect(calls).toBe(18) // 5 períodos + série diária, por conta
    expect((await snaps.get('c2', 'summary', 'today'))?.payload).toEqual({ row: { spend: '3' }, prev: null })
    expect((await snaps.get('c2', 'summary', 'this_month'))?.payload).toEqual({ row: { spend: '3' }, prev: null })
    expect((await snaps.get<unknown[]>('c2', 'daily', 'last_30d'))?.payload).toEqual([{ date_start: '2026-09-20', spend: '7' }])
    expect((await state.getState('c2')).lastSynced['insights:today']).toBe(NOW)
  })

  it('conta pausada é pulada; pausa geral (kill switch) para tudo e devolve o motivo', async () => {
    const paused = make((async () => res({ data: [] })) as CollectDeps['get']); await paused.state.patchState('c1', { paused: true })
    expect(await refreshCards(paused.d, accs)).toMatchObject({ skipped: 1, refreshed: 2 })
    let n = 0
    const blocked = make((async () => { n++; return res({}, { ok: false, blocked: 'kill_switch', error: { kind: 'client', status: 0, message: 'x' } }) }) as CollectDeps['get'])
    const r = await refreshCards(blocked.d, accs)
    expect(r.stopped).toBe('kill_switch'); expect(r.refreshed).toBe(0); expect(n).toBeLessThanOrEqual(4) // não insiste
  })

  it('erro em uma conta não impede as outras', async () => {
    const { d } = make((async (p: string) => (p.includes('act_1000002') ? res({}, { ok: false, status: 400, error: { kind: 'client', status: 400, message: 'x' } }) : res({ data: [{ spend: '1' }] }))) as CollectDeps['get'])
    expect(await refreshCards(d, accs)).toMatchObject({ refreshed: 2, failed: 1 })
  })
})

import { applySummaries, totalsOfRow } from '@/lib/adminSummary'

describe('cards do admin usam o resumo de cada período (o mesmo do painel do cliente)', () => {
  const NOW = Date.UTC(2026, 8, 21, 15)
  const row = (spend: string, conv: number) => ({ spend, impressions: '1000', clicks: '50', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(conv) }] })

  it('totais de uma linha de resumo: investimento, cliques e resultados', () => {
    expect(totalsOfRow(row('12.5', 4), NOW)).toMatchObject({ spend: 12.5, clicks: 50, impressions: 1000, conversations: 4, results: 4 })
    expect(totalsOfRow(null, NOW).spend).toBe(0)
  })

  it('sem série diária, o resumo sozinho preenche o card e define o tipo de resultado', () => {
    const r = applySummaries(null, { last_7d: { row: row('30', 9), at: NOW - 5 * 60_000 } }, NOW, 7)!
    expect(r.periods[7]).toMatchObject({ spend: 30, conversations: 9 })
    expect(r.kind).toBe('conversa')
    expect(r.periods.today.spend).toBe(0) // período sem resumo fica zerado, sem inventar
  })

  it('o período escolhido sempre usa o resumo; os outros só se forem recentes (menos de 6 h)', () => {
    const sums = { today: { row: row('5', 1), at: NOW - 7 * 3_600_000 }, last_7d: { row: row('30', 9), at: NOW - 60_000 } }
    const base = applySummaries(null, {}, NOW, 7) // sem nada: null
    expect(base).toBeNull()
    const antiga = applySummaries(applySummaries(null, { last_14d: { row: row('1', 1), at: NOW } }, NOW, 14), sums, NOW, 'today')!
    expect(antiga.periods.today.spend).toBe(5) // escolhido: vale mesmo velho
    const r7 = applySummaries(antiga, sums, NOW, 7)!
    expect(r7.periods[7].spend).toBe(30)
    expect(r7.periods.today.spend).toBe(5) // "hoje" velho (7 h) não é reaplicado quando não é o escolhido: fica o que já estava
  })
})

describe('"Atualizar tudo": conta sem série diária recebe 30 dias', () => {
  it('sem série guardada pede last_30d; com série, só os últimos dias (last_7d)', async () => {
    const NOW2 = Date.UTC(2026, 8, 21, 15)
    const paths: string[] = []
    const snaps = new MemorySnapshotStore(), state = new MemoryLimitStore(() => NOW2)
    await snaps.put('c2', 'daily', 'last_30d', [{ date_start: '2026-09-19', spend: '1' }], 1)
    const d = { cfg: cfgWith(), now: () => NOW2, snaps, state, get: (async (p: string) => { paths.push(p); return { ok: true, status: 200, attempts: 1, data: { data: [{ date_start: '2026-09-20', spend: '2' }] } } }) as unknown as CollectDeps['get'] } as CollectDeps
    await refreshCards(d, [{ clientId: 'c1', slug: 's1', adAccountId: 'act_1000001' }, { clientId: 'c2', slug: 's2', adAccountId: 'act_1000002' }])
    const dailyPaths = paths.filter(p => p.includes('time_increment'))
    expect(dailyPaths.find(p => p.startsWith('act_1000001'))).toContain('date_preset=last_30d')
    expect(dailyPaths.find(p => p.startsWith('act_1000002'))).toContain('date_preset=last_7d')
  })
})
