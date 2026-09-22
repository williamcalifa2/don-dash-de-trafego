import { beforeEach, describe, expect, it } from 'vitest'
import { describeFreshness, ownsFromSnapshots, readAdPreview, readAds, readAdsets, readMetrics, readPerformance, sliceDaily } from '@/lib/meta/read'
import { assembleMetrics } from '@/lib/meta'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import { defaultAccountState } from '@/lib/meta/limits'
import { requestRefresh } from '@/lib/meta/refresh'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { MemoryJobStore } from '@/lib/meta/queue'
import { cfgWith } from './helpers'

const MIN = 60_000
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0)
const cfg = cfgWith()
let snaps: MemorySnapshotStore
const lead = (n: number) => [{ action_type: 'onsite_conversion.lead_grouped', value: String(n) }]

beforeEach(async () => {
  snaps = new MemorySnapshotStore()
  await snaps.put('c1', 'account', '', { name: 'Dal Moro', currency: 'BRL' }, NOW - 10 * MIN)
  await snaps.put('c1', 'summary', 'last_7d', { row: { spend: '100', impressions: '1000', clicks: '50', actions: lead(5) }, prev: { spend: '80', actions: lead(4) } }, NOW - 10 * MIN)
  await snaps.put('c1', 'structure', 'campaigns', [{ id: '11', name: 'Camp A', effective_status: 'ACTIVE', daily_budget: '5000' }, { id: '12', name: 'Camp B', effective_status: 'PAUSED' }], NOW)
  await snaps.put('c1', 'campaign_insights', 'last_7d', [{ campaign_id: '11', spend: '60', impressions: '600', actions: lead(3) }], NOW)
  const days = Array.from({ length: 30 }, (_, i) => ({ date_start: new Date(NOW - (i + 1) * 86_400_000).toISOString().slice(0, 10), spend: String(i + 1), actions: lead(1) })).reverse()
  await snaps.put('c1', 'daily', 'last_30d', days, NOW)
})

describe('leitura do painel a partir do banco', () => {
  it('monta a mesma resposta do modo ao vivo (mesma função de montagem)', async () => {
    const r = await readMetrics(snaps, 'c1', 'act_1234567', 'last_7d', cfg, null, NOW)
    const live = assembleMetrics('act_1234567', 'last_7d', {
      account: { name: 'Dal Moro', currency: 'BRL' },
      summaryRow: { spend: '100', impressions: '1000', clicks: '50', actions: lead(5) }, prevRow: { spend: '80', actions: lead(4) },
      dailyRows: sliceDaily((await snaps.get<Array<Record<string, unknown>>>('c1', 'daily', 'last_30d'))!.payload, 'last_7d', new Date(NOW)),
      campaigns: [{ id: '11', name: 'Camp A', effective_status: 'ACTIVE', daily_budget: '5000', insight: { spend: '60', impressions: '600', actions: lead(3) } }, { id: '12', name: 'Camp B', effective_status: 'PAUSED' }],
    }, r.generated_at)
    const { freshness, ...rest } = r
    expect(rest).toEqual(live)
    expect(freshness.stale).toBe(false)
    expect(r.summary.spend).toBe(100); expect(r.summary.leads).toBe(5); expect(r.summary_prev?.leads).toBe(4)
    expect(r.campaigns.map(c => [c.name, c.leads, c.daily_budget])).toEqual([['Camp A', 3, 50], ['Camp B', 0, null]])
    expect(r.generated_at).toBe(new Date(NOW - 10 * MIN).toISOString()) // mostra a hora do dado, não a da leitura
  })

  it('série diária é fatiada pelo período (7 dias a partir dos 30)', async () => {
    const r7 = await readMetrics(snaps, 'c1', 'act_1234567', 'last_7d', cfg, null, NOW)
    expect(r7.daily?.dates).toHaveLength(7)
    expect((await readMetrics(snaps, 'c1', 'act_1234567', 'today', cfg, null, NOW)).daily).toBeUndefined()
  })

  it('sem dados ainda: resposta vazia com aviso claro (não quebra a tela)', async () => {
    const r = await readMetrics(new MemorySnapshotStore(), 'c9', 'act_1234567', 'last_7d', cfg, null, NOW)
    expect(r.freshness.pending).toBe(true)
    expect(r.error).toContain('sincronizados')
    expect(r.campaigns).toEqual([])
  })

  it('a leitura nunca chama a Meta (só o armazenamento)', async () => {
    const g = globalThis.fetch
    globalThis.fetch = (() => { throw new Error('rede proibida') }) as typeof fetch
    try { await readMetrics(snaps, 'c1', 'act_1234567', 'last_7d', cfg, null, NOW); await readPerformance(snaps, 'c1', 'last_7d', cfg, null, NOW) } finally { globalThis.fetch = g }
  })
})

describe('aviso de dado velho / conta em espera', () => {
  const st = (o = {}) => ({ ...defaultAccountState(), ...o })
  it('em dia: sem aviso', () => expect(describeFreshness(NOW - 20 * MIN, st(), cfg, NOW).note).toBeNull())
  it('velho sem motivo conhecido', () => {
    const f = describeFreshness(NOW - 4 * 60 * MIN, st(), cfg, NOW)
    expect(f.stale).toBe(true); expect(f.note).toContain('4 h')
  })
  it('conta bloqueada, pausada ou suspensa explica o motivo', () => {
    expect(describeFreshness(NOW - 20 * MIN, st({ blockedUntil: NOW + 30 * MIN }), cfg, NOW).note).toContain('reduzir o ritmo')
    expect(describeFreshness(NOW - 20 * MIN, st({ paused: true }), cfg, NOW).note).toContain('pausada')
    expect(describeFreshness(NOW - 20 * MIN, st({ suspended: true }), cfg, NOW).note).toContain('suspensa')
  })
  it('reincidência (freqMultiplier) alarga o que se considera "velho"', () => {
    expect(describeFreshness(NOW - 4 * 60 * MIN, st({ freqMultiplier: 4 }), cfg, NOW).stale).toBe(false)
  })
})

describe('drill-down sem laço por entidade', () => {
  beforeEach(async () => {
    await snaps.put('c1', 'structure', 'adsets', [{ id: '21', name: 'Conj 1', campaign_id: '11', effective_status: 'ACTIVE', daily_budget: '2000' }, { id: '22', name: 'Conj 2', campaign_id: '12' }], NOW)
    await snaps.put('c1', 'adset_insights', 'last_7d', [{ adset_id: '21', spend: '30', clicks: '10', actions: lead(2), cost_per_action_type: [{ action_type: 'lead', value: '15' }] }], NOW)
    await snaps.put('c1', 'structure', 'ads', [{ id: '31', name: 'Anúncio', adset_id: '21', effective_status: 'ACTIVE', creative: { name: 'Cr', thumbnail_url: 'https://cdn/x.jpg', image_url: 'https://cdn/big.jpg', object_type: 'SHARE' } }], NOW)
    await snaps.put('c1', 'ad_insights', 'last_7d', [{ ad_id: '31', ad_name: 'Anúncio', adset_name: 'Conj 1', campaign_id: '11', campaign_name: 'Camp A', spend: '12', impressions: '100', clicks: '4', actions: lead(1) }], NOW)
  })
  it('conjuntos de uma campanha, com números e orçamento', async () => {
    const a = await readAdsets(snaps, 'c1', '11', 'last_7d')
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ id: '21', spend: 30, leads: 2, cpl: 15, daily_budget: 20 })
  })
  it('anúncios de um conjunto, com criativo/miniatura', async () => {
    const ads = await readAds(snaps, 'c1', '21', 'last_7d')
    expect(ads[0]).toMatchObject({ id: '31', thumb: 'https://cdn/x.jpg', leads: 1, spend: 12 })
  })
  it('desempenho por anúncio', async () => {
    const p = await readPerformance(snaps, 'c1', 'last_7d', cfg, null, NOW)
    expect(p.rows[0]).toMatchObject({ ad_id: '31', meta_leads: 1, campaign_name: 'Camp A' })
  })
  it('posse conferida pela cópia local: só do próprio cliente', async () => {
    expect(await ownsFromSnapshots(snaps, 'c1', '21')).toBe(true)
    expect(await ownsFromSnapshots(snaps, 'c1', '999999')).toBe(false)
    expect(await ownsFromSnapshots(snaps, 'outro', '21')).toBe(false)
  })
  it('prévia do anúncio vem da miniatura guardada e escapa HTML; URL insegura vira vazio', async () => {
    expect(await readAdPreview(snaps, 'c1', '31')).toContain('src="https://cdn/big.jpg"')
    await snaps.put('c1', 'structure', 'ads', [{ id: '32', creative: { image_url: 'javascript:alert(1)' } }, { id: '33', creative: { image_url: 'https://a/"onerror="x' } }], NOW)
    expect(await readAdPreview(snaps, 'c1', '32')).toBe('')
    expect(await readAdPreview(snaps, 'c1', '33')).not.toContain('"onerror="')
  })
})

describe('botão Atualizar', () => {
  let store: MemoryLimitStore, jobs: MemoryJobStore, now = NOW
  const deps = (over = {}) => ({ store, jobs, config: () => cfgWith({ manualRefreshCooldownSec: 600, ...over }), now: () => now })
  beforeEach(async () => { store = new MemoryLimitStore(() => now); jobs = new MemoryJobStore(); now = NOW; await store.patchState('c1', { enabled: true }) })

  it('enfileira só o que venceu o TTL e respeita o resfriamento por conta', async () => {
    expect(await requestRefresh(deps(), 'c1')).toEqual({ queued: true })
    expect(jobs.jobs.map(j => j.kind).sort()).toEqual(['insights', 'leads'])
    now += 5 * MIN
    expect(await requestRefresh(deps(), 'c1')).toMatchObject({ queued: false, reason: 'cooldown', retryInSec: 300 })
    expect(jobs.jobs).toHaveLength(2)
  })
  it('dado fresco não enfileira nada', async () => {
    await store.patchState('c1', { lastSynced: { insights: now - MIN, leads: now - MIN } })
    expect(await requestRefresh(deps(), 'c1')).toMatchObject({ queued: false, reason: 'fresh' })
  })
  it('conta bloqueada, pausada, desligada ou DRY_RUN: não enfileira (o botão não fura limites)', async () => {
    await store.patchState('c1', { blockedUntil: now + 10 * MIN })
    expect(await requestRefresh(deps(), 'c1')).toMatchObject({ queued: false, reason: 'blocked' })
    await store.patchState('c1', { blockedUntil: null, paused: true })
    expect(await requestRefresh(deps(), 'c1')).toMatchObject({ reason: 'disabled' })
    await store.patchState('c1', { paused: false })
    expect(await requestRefresh(deps({ dryRun: true }), 'c1')).toMatchObject({ reason: 'disabled' })
    expect(jobs.jobs).toHaveLength(0)
  })
  it('cliques repetidos não empilham jobs', async () => {
    await requestRefresh(deps(), 'c1'); now += 11 * MIN
    expect(await requestRefresh(deps(), 'c1')).toMatchObject({ queued: false, reason: 'already_queued' })
    expect(jobs.jobs).toHaveLength(2)
  })
})
