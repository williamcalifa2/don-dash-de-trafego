import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectInsights, collectLeads, collectStructure, type Account, type CollectDeps } from '@/lib/meta/collectors'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import type { MetaResult } from '@/lib/meta/client'
import { cfgWith } from './helpers'

const MIN = 60_000
let t = Date.UTC(2026, 8, 21, 15, 0, 0)
let store: MemoryLimitStore, snaps: MemorySnapshotStore
const acc: Account = { clientId: 'c1', slug: 's', adAccountId: 'act_1234567' }
const res = <T,>(data: T, over: Partial<MetaResult<T>> = {}): MetaResult<T> => ({ ok: true, status: 200, data, attempts: 1, ...over })

function deps(get: CollectDeps['get'], cfg = {}, extra: Partial<CollectDeps> = {}): CollectDeps {
  return { cfg: cfgWith(cfg), now: () => t, get, snaps, state: store, ...extra }
}
beforeEach(() => { t = Date.UTC(2026, 8, 21, 15, 0, 0); store = new MemoryLimitStore(() => t); snaps = new MemorySnapshotStore() })

const router = (paths: string[]) => vi.fn(async (p: string) => {
  paths.push(p)
  if (p.includes('level=')) return res({ data: [{ ad_id: '1' }] })
  if (p.includes('/campaigns') || p.includes('/adsets')) return res({ data: [{ id: '10', effective_status: 'ACTIVE' }] })
  if (p.includes('/ads?')) return res({ data: [{ id: '20', effective_status: 'ACTIVE' }, { id: '21', effective_status: 'PAUSED' }] })
  if (p.includes('/insights')) return res({ data: [{ spend: '1' }] })
  return res({ name: 'Conta', currency: 'BRL', account_status: 1 })
}) as unknown as CollectDeps['get']

describe('coletor de insights', () => {
  it('usa só consultas no nível da conta (nenhum laço por campanha/conjunto/anúncio) e grava snapshots', async () => {
    const paths: string[] = []
    const out = await collectInsights(deps(router(paths), { maxPagesPerJob: 50 }), acc)
    expect(out.status).toBe('done')
    // 2 presets quentes x 5 + diário 1 = 11 chamadas; frios ficam para depois? não: nunca sincronizados => também entram
    expect(paths.every(p => p.startsWith('act_1234567/'))).toBe(true)
    expect(paths.filter(p => /^\d/.test(p))).toHaveLength(0)
    expect(paths.some(p => p.includes('level=ad'))).toBe(true)
    expect(await snaps.get('c1', 'summary', 'last_7d')).not.toBeNull()
    expect(await snaps.get('c1', 'ad_insights', 'today')).not.toBeNull()
    expect(await snaps.get('c1', 'daily', 'last_30d')).not.toBeNull()
    expect((await store.getState('c1')).lastSynced['insights:last_7d']).toBe(t)
  })

  it('dentro do TTL não faz nenhuma chamada; períodos frios esperam mais que os quentes', async () => {
    const paths: string[] = []
    const d = deps(router(paths), { maxPagesPerJob: 50 })
    await collectInsights(d, acc)
    paths.length = 0
    t += 44 * MIN
    expect((await collectInsights(d, acc)).status).toBe('done'); expect(paths).toHaveLength(0)

    t += 2 * MIN // 46 min: quentes vencem, frios (4x) não
    await collectInsights(d, acc)
    expect(paths.some(p => p.includes('date_preset=today'))).toBe(true)
    expect(paths.some(p => p.includes('date_preset=last_7d'))).toBe(true)
    expect(paths.some(p => p.includes('date_preset=last_14d'))).toBe(false)
    expect(paths.some(p => p.includes('date_preset=last_30d&fields') || p.includes('preset=last_30d&level'))).toBe(false)
  })

  it('DRY_RUN: registra as chamadas previstas, não grava dados e usa relógio próprio', async () => {
    let dry = 0
    const get: CollectDeps['get'] = async () => { dry++; return { ok: true, status: 0, data: {} as never, dryRun: true, attempts: 0 } }
    const out = await collectInsights(deps(get, { dryRun: true, maxPagesPerJob: 50 }), acc)
    expect(out.status).toBe('dry')
    expect(dry).toBe(5 * 5 + 1 + 3 * 5) // 5 períodos (hoje, 7, 14, 30 e mês) x 5 + diário + público (3 períodos x 5 recortes)
    expect(snaps.data.size).toBe(0)
    const st = await store.getState('c1')
    expect(st.lastSynced['dry_insights:today']).toBe(t)
    expect(st.lastSynced['insights:today']).toBeUndefined()
  })

  it('conta bloqueada/limite no meio: adia, para de chamar e não grava dado pela metade', async () => {
    let n = 0
    const get: CollectDeps['get'] = async () => {
      n++
      return n === 3 ? { ok: false, status: 0, data: {} as never, attempts: 0, blocked: 'account_blocked', error: { kind: 'client', status: 0, message: 'x' } } : res({ data: [] }) as never
    }
    const out = await collectInsights(deps(get), acc)
    expect(out).toMatchObject({ status: 'deferred', reason: 'account_blocked' })
    expect(n).toBe(3)
    expect(await snaps.get('c1', 'summary', 'today')).toBeNull()
    expect((await store.getState('c1')).lastSynced['insights:today']).toBeUndefined()
  })

  it('erro de limite da Meta vira adiamento; token inválido vira falha (sem retry aqui)', async () => {
    const rl: CollectDeps['get'] = async () => ({ ok: false, status: 400, data: {} as never, attempts: 1, error: { kind: 'rate_limit', code: 17, status: 400, message: 'limite' } })
    expect((await collectInsights(deps(rl), acc)).status).toBe('deferred')
    const tk: CollectDeps['get'] = async () => ({ ok: false, status: 400, data: {} as never, attempts: 1, error: { kind: 'token', code: 190, status: 400, message: 'token' } })
    expect((await collectInsights(deps(tk), acc)).status).toBe('failed')
  })

  it('teto de páginas por job: guarda o parcial + cursor e retoma no próximo ciclo sem repetir páginas', async () => {
    const seen: string[] = []
    const get: CollectDeps['get'] = async (p: string) => {
      seen.push(p)
      if (p.includes('level=campaign') && p.includes('date_preset=today')) {
        const after = /after=([^&]+)/.exec(p)?.[1]
        if (!after) return res({ data: [{ campaign_id: 'A' }], paging: { cursors: { after: 'P2' }, next: 'x' } }) as never
        if (after === 'P2') return res({ data: [{ campaign_id: 'B' }], paging: { cursors: { after: 'P3' }, next: 'x' } }) as never
        if (after === 'P3') return res({ data: [{ campaign_id: 'C' }], paging: { cursors: { after: 'P4' }, next: 'x' } }) as never
        return res({ data: [{ campaign_id: 'D' }], paging: { cursors: { after: 'P5' } } }) as never
      }
      return res({ data: [] }) as never
    }
    // teto de 3 páginas: a 4ª página das campanhas fica para o próximo ciclo
    const cfg = { maxPagesPerJob: 3 }
    const first = await collectInsights(deps(get, cfg), acc)
    expect(first).toMatchObject({ status: 'deferred', reason: 'page_limit' })
    expect((await snaps.get('c1', 'partial', 'campaigns:today'))!.payload).toHaveLength(3)
    expect((await store.getState('c1')).cursors['campaigns:today']).toBe('P4')
    expect(await snaps.get('c1', 'summary', 'today')).toBeNull()

    seen.length = 0
    const second = await collectInsights(deps(get, { maxPagesPerJob: 50 }), acc)
    expect(second.status).toBe('done')
    expect(seen.find(p => p.includes('level=campaign') && p.includes('date_preset=today'))).toContain('after=P4') // retomou do cursor
    expect(seen.filter(p => p.includes('level=campaign') && p.includes('date_preset=today') && !p.includes('after='))).toHaveLength(0)
    expect((await snaps.get<unknown[]>('c1', 'campaign_insights', 'today'))!.payload).toHaveLength(4)
    expect(await snaps.get('c1', 'partial', 'campaigns:today')).toBeNull()
    expect((await store.getState('c1')).cursors['campaigns:today']).toBeUndefined()
  })

  it('teto de páginas entre períodos: grava os períodos completos, adia o resto e retoma sem refazer', async () => {
    const paths: string[] = []
    const d = deps(router(paths), { maxPagesPerJob: 8 })
    const first = await collectInsights(d, acc)
    expect(first).toMatchObject({ status: 'deferred', reason: 'page_limit' })
    expect(await snaps.get('c1', 'summary', 'today')).not.toBeNull()
    expect(await snaps.get('c1', 'summary', 'last_7d')).not.toBeNull()
    expect(await snaps.get('c1', 'summary', 'last_14d')).toBeNull()
    paths.length = 0
    const second = await collectInsights(d, acc)
    expect(paths.some(p => p.includes('date_preset=today'))).toBe(false) // não refez o que já estava pronto
    expect(paths.some(p => p.includes('date_preset=last_14d'))).toBe(true)
    expect(['done', 'deferred']).toContain(second.status)
  })

  it('campos e níveis pedidos passam pela allowlist', async () => {
    const { parseRequest } = await import('@/lib/meta/allowlist')
    const paths: string[] = []
    await collectInsights(deps(router(paths), { maxPagesPerJob: 50 }), acc)
    await collectStructure(deps(router(paths)), acc)
    const cfg = cfgWith()
    for (const p of paths) expect(() => parseRequest(p, cfg), p).not.toThrow()
  })
})

describe('público (plataforma, dispositivo, hora, idade/gênero, região)', () => {
  const aud = (paths: string[]) => vi.fn(async (p: string) => {
    paths.push(p)
    if (p.includes('breakdowns=publisher_platform')) return res({ data: [{ publisher_platform: 'instagram', impressions: '10', reach: '8' }] })
    return router([])(p, {} as never)
  }) as unknown as CollectDeps['get']

  it('busca 5 recortes por período (7, 14 e 30 dias), só no nível da conta, e guarda por período', async () => {
    const paths: string[] = []
    const out = await collectInsights(deps(aud(paths), { maxPagesPerJob: 50 }), acc)
    expect(out.status).toBe('done')
    const b = paths.filter(p => p.includes('breakdowns='))
    expect(b).toHaveLength(15)
    expect(b.every(p => p.startsWith('act_1234567/insights?'))).toBe(true)
    expect(b.some(p => p.includes('date_preset=today'))).toBe(false) // hoje fica de fora
    const snap = await snaps.get<{ platform: unknown[]; device: unknown[]; hour: unknown[]; agegender: unknown[]; region: unknown[] }>('c1', 'audience', 'last_7d')
    expect(Object.keys(snap!.payload).sort()).toEqual(['agegender', 'device', 'hour', 'platform', 'region'])
    expect(snap!.payload.platform).toHaveLength(1)
  })

  it('atualiza raramente: dentro do TTL do público não repete os recortes', async () => {
    const paths: string[] = []
    const d = deps(aud(paths), { maxPagesPerJob: 50 })
    await collectInsights(d, acc)
    paths.length = 0; t += 60 * MIN // insights vence (45 min), público (3 h) não
    await collectInsights(d, acc)
    expect(paths.filter(p => p.includes('breakdowns='))).toHaveLength(0)
    t += 3 * 60 * MIN
    await collectInsights(d, acc)
    expect(paths.filter(p => p.includes('breakdowns=')).length).toBeGreaterThan(0)
  })

  it('bloqueio no meio do público adia sem desfazer o que já foi gravado', async () => {
    let n = 0
    const get: CollectDeps['get'] = async (p: string) => {
      if (p.includes('breakdowns=')) { n++; if (n === 3) return { ok: false, status: 0, data: {} as never, attempts: 0, blocked: 'account_blocked', error: { kind: 'client', status: 0, message: 'x' } } }
      return router([])(p, {} as never) as never
    }
    const out = await collectInsights(deps(get, { maxPagesPerJob: 50 }), acc)
    expect(out).toMatchObject({ status: 'deferred', reason: 'account_blocked' })
    expect(await snaps.get('c1', 'summary', 'last_7d')).not.toBeNull() // o essencial já estava salvo
    expect(await snaps.get('c1', 'audience', 'last_7d')).toBeNull()      // público incompleto não é gravado
  })
})

describe('série diária incremental', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 8, 21) - n * 86_400_000).toISOString().slice(0, 10)
  const mk = (paths: string[]) => vi.fn(async (p: string) => {
    paths.push(p)
    if (p.includes('time_increment=1')) {
      const recent = p.includes('last_3d')
      const n = recent ? 3 : 30
      return res({ data: Array.from({ length: n }, (_, i) => ({ date_start: day(n - i), spend: recent ? '999' : '1' })) })
    }
    return res({ data: [] })
  }) as unknown as CollectDeps['get']

  it('primeira vez busca 30 dias; nos ciclos seguintes só os últimos 3 dias, mesclados na série', async () => {
    const paths: string[] = []
    const d = deps(mk(paths), { maxPagesPerJob: 50 })
    await collectInsights(d, acc)
    expect(paths.filter(p => p.includes('time_increment=1')).every(p => p.includes('last_30d'))).toBe(true)
    expect((await snaps.get<unknown[]>('c1', 'daily', 'last_30d'))!.payload).toHaveLength(30)

    paths.length = 0; t += 50 * MIN // 16:50 UTC = 13:50 SP: horário comercial
    await collectInsights(d, acc)
    const dailyCalls = paths.filter(p => p.includes('time_increment=1'))
    expect(dailyCalls).toHaveLength(1); expect(dailyCalls[0]).toContain('last_3d')
    const merged = (await snaps.get<Array<{ date_start: string; spend: string }>>('c1', 'daily', 'last_30d'))!.payload
    expect(merged).toHaveLength(30) // não cresceu: mesclou por data
    expect(merged.filter(r => r.spend === '999')).toHaveLength(3) // os 3 últimos dias foram atualizados
  })

  it('a série completa é refeita 1x por dia, fora do horário comercial; passou de 36 h refaz em qualquer horário', async () => {
    const paths: string[] = []
    const d = deps(mk(paths), { maxPagesPerJob: 50 })
    await collectInsights(d, acc) // 12:00 SP
    paths.length = 0

    t += 25 * 60 * MIN // 13:00 SP do dia seguinte: horário comercial, ainda < 36 h
    await collectInsights(d, acc)
    expect(paths.find(p => p.includes('time_increment=1'))).toContain('last_3d')

    paths.length = 0; t += 10 * 60 * MIN // 23:00 SP: fora do horário e > 24 h da última completa
    await collectInsights(d, acc)
    expect(paths.find(p => p.includes('time_increment=1'))).toContain('last_30d')

    // sem coleta completa por > 36 h: refaz mesmo em horário comercial
    const st = await store.getState('c1')
    await store.patchState('c1', { lastSynced: { ...st.lastSynced, 'insights:daily_full': t - 40 * 60 * MIN, 'insights:daily': t - 50 * MIN } })
    paths.length = 0; t += 60 * MIN
    await store.patchState('c1', { lastSynced: { ...(await store.getState('c1')).lastSynced, 'insights:daily': t - 50 * MIN } })
    await collectInsights(d, acc)
    expect(paths.find(p => p.includes('time_increment=1'))).toContain('last_30d')
  })
})

describe('coletor de estrutura (incremental)', () => {
  it('primeira vez completa; depois filtra por updated_time e mescla; conta anúncios ativos', async () => {
    const paths: string[] = []
    const d = deps(router(paths))
    expect((await collectStructure(d, acc)).status).toBe('done')
    expect(paths.every(p => !p.includes('filtering'))).toBe(true)
    expect((await store.getState('c1')).activeAds).toBe(1)
    expect((await snaps.get<unknown[]>('c1', 'structure', 'ads'))!.payload).toHaveLength(2)

    paths.length = 0; t += 9 * 60 * MIN
    const inc = vi.fn(async (p: string) => { paths.push(p); return p.includes('/ads?') ? res({ data: [{ id: '20', effective_status: 'PAUSED' }, { id: '22', effective_status: 'ACTIVE' }] }) : res({ data: [] }) }) as unknown as CollectDeps['get']
    await collectStructure(deps(inc), acc)
    expect(paths.filter(p => p.includes('/campaigns') || p.includes('/adsets') || p.includes('/ads?')).every(p => p.includes('filtering'))).toBe(true)
    const merged = (await snaps.get<Array<{ id: string; effective_status: string }>>('c1', 'structure', 'ads'))!.payload
    expect(merged.map(x => x.id).sort()).toEqual(['20', '21', '22'])
    expect(merged.find(x => x.id === '20')!.effective_status).toBe('PAUSED')
    expect((await store.getState('c1')).activeAds).toBe(1) // 22 ativo; 20 pausou; 21 pausado
  })

  it('a cada 24 h volta a fazer a varredura completa', async () => {
    const paths: string[] = []
    const d = deps(router(paths))
    await collectStructure(d, acc); paths.length = 0
    t += 25 * 60 * MIN
    await collectStructure(d, acc)
    expect(paths.some(p => p.includes('filtering'))).toBe(false)
  })
})

describe('coletor de leads', () => {
  it('só busca o que é novo desde a última coleta, com sobreposição pequena', async () => {
    const syncLeads = vi.fn(async () => ({ imported: 2 }))
    await store.patchState('c1', { lastSynced: { leads: t - 30 * MIN } })
    const out = await collectLeads(deps(vi.fn() as never, {}, { syncLeads }), acc)
    expect(out.status).toBe('done')
    const since = (syncLeads.mock.calls[0] as unknown as [Account, { sinceEpochSec: number }])[1].sinceEpochSec
    expect(since).toBe(Math.floor((t - 30 * MIN - 10 * MIN) / 1000))
    expect((await store.getState('c1')).lastSynced.leads).toBe(t)
  })
  it('erro não avança o relógio (o próximo ciclo busca de novo, sem perder lead)', async () => {
    const syncLeads = vi.fn(async () => ({ imported: 0, error: 'sem permissão' }))
    const out = await collectLeads(deps(vi.fn() as never, {}, { syncLeads }), acc)
    expect(out.status).toBe('failed')
    expect((await store.getState('c1')).lastSynced.leads).toBeUndefined()
  })
  it('bloqueio vira adiamento; DRY_RUN só registra a previsão', async () => {
    const blocked = vi.fn(async () => ({ imported: 0, blocked: 'account_blocked' }))
    expect((await collectLeads(deps(vi.fn() as never, {}, { syncLeads: blocked }), acc)).status).toBe('deferred')
    const never = vi.fn()
    const dry = await collectLeads(deps(vi.fn() as never, { dryRun: true }, { syncLeads: never }), acc)
    expect(dry.status).toBe('dry'); expect(never).not.toHaveBeenCalled()
  })
})

describe('atualização manual (admin e equipe)', () => {
  it('ignora a validade só do período pedido e da série diária; não mexe nos outros nem no público', async () => {
    const paths: string[] = []
    const d = deps(router(paths), { maxPagesPerJob: 50 })
    await collectInsights(d, acc) // tudo fresco
    paths.length = 0
    t += 1 * MIN // dentro do TTL: sem força não faria nada
    expect((await collectInsights(d, acc)).status).toBe('done'); expect(paths).toHaveLength(0)

    const out = await collectInsights(d, acc, { force: ['last_14d'] })
    expect(out.status).toBe('done')
    expect(paths.some(p => p.includes('date_preset=last_14d'))).toBe(true)
    expect(paths.some(p => p.includes('date_preset=last_7d'))).toBe(false)
    expect(paths.some(p => p.includes('date_preset=today'))).toBe(false)
    expect(paths.some(p => p.includes('time_increment=1'))).toBe(true)
    expect(paths.some(p => p.includes('breakdowns='))).toBe(false)
    expect((await store.getState('c1')).lastSynced['insights:last_14d']).toBe(t)
  })

  it('o freio continua valendo: bloqueio da Meta adia em vez de forçar', async () => {
    const get: CollectDeps['get'] = async () => res({} as never, { ok: false, status: 0, blocked: 'account_blocked', error: { kind: 'client', status: 0, message: 'x' } })
    const out = await collectInsights(deps(get, { maxPagesPerJob: 50 }), acc, { force: ['last_7d'] })
    expect(out.status).not.toBe('done')
  })
})
