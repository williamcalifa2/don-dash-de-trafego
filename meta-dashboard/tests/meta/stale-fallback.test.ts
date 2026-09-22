import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryLimitStore } from '@/lib/meta/memoryStore'
import type { MemorySnapshotStore } from '@/lib/meta/snapshots'

const NOW = Date.UTC(2026, 8, 21, 15, 0, 0)
vi.mock('@/lib/meta/stores', async () => {
  const { MemoryLimitStore } = await import('@/lib/meta/memoryStore')
  const { MemorySnapshotStore } = await import('@/lib/meta/snapshots')
  return { stores: { limit: new MemoryLimitStore(() => Date.UTC(2026, 8, 21, 15, 0, 0)), snaps: new MemorySnapshotStore(), jobs: {} } }
})

import { stores } from '@/lib/meta/stores'
const limit = stores.limit as unknown as MemoryLimitStore
const snaps = stores.snaps as unknown as MemorySnapshotStore

import { __resetStaleFallback, friendlyLiveError, metricsFallback, performanceFallback, remember } from '@/lib/meta/staleFallback'
import type { MetricsResponse } from '@/lib/meta'

const HOUR = 3_600_000
const row = { spend: '100', impressions: '1000', clicks: '50', actions: [] }

beforeEach(async () => {
  __resetStaleFallback(); snaps.data.clear(); limit.settings.clear(); limit.states.clear()
})

describe('painel do cliente não cai quando a consulta ao vivo falha', () => {
  it('sem nada guardado devolve null (o erro amigável é mostrado)', async () => {
    expect(await metricsFallback('c1', 'act_1', 'last_7d', NOW)).toBeNull()
    expect(await performanceFallback('c1', 'last_7d', NOW)).toBeNull()
  })

  it('usa a última resposta boa da instância e avisa que é dado antigo durante o kill switch', async () => {
    const data = { account_id: 'act_1', date_preset: 'last_7d', generated_at: 'x', summary: { spend: 100 } } as unknown as MetricsResponse
    remember('m:c1:last_7d', data, NOW - 2 * HOUR)
    await limit.setSetting('kill', { until: NOW + 20 * 60_000 })
    const r = await metricsFallback('c1', 'act_1', 'last_7d', NOW)
    expect(r).not.toBeNull()
    expect(r!.generated_at).toBe(new Date(NOW - 2 * HOUR).toISOString())
    expect(r!.freshness.note).toMatch(/pausa por proteção/)
    expect(r!.freshness.pending).toBe(false)
  })

  it('usa o snapshot do banco quando ele é mais novo que a memória', async () => {
    remember('m:c1:last_7d', { generated_at: 'velho' } as unknown as MetricsResponse, NOW - 5 * HOUR)
    await snaps.put('c1', 'summary', 'last_7d', { row, prev: null }, NOW - 1 * HOUR)
    const r = await metricsFallback('c1', 'act_1', 'last_7d', NOW)
    expect(r?.freshness.updatedAt).toBe(NOW - 1 * HOUR)
  })

  it('não usa dado com mais de 24 horas da memória', async () => {
    remember('m:c1:last_7d', { generated_at: 'x' } as unknown as MetricsResponse, NOW - 25 * HOUR)
    expect(await metricsFallback('c1', 'act_1', 'last_7d', NOW)).toBeNull()
  })

  it('o Funil também mostra o último dado bom', async () => {
    remember('p:c1:last_7d', [{ ad_id: '1', ad_name: 'A', adset_name: 'S', campaign_id: '9', campaign_name: 'C', spend: 1, impressions: 1, clicks: 1, meta_leads: 0, results: 0 }], NOW - HOUR)
    const r = await performanceFallback('c1', 'last_7d', NOW)
    expect(r?.rows).toHaveLength(1)
  })

  it('mensagem de erro amigável para pausa por proteção', () => {
    expect(friendlyLiveError('Chamada bloqueada: kill_switch')).toMatch(/pausa por proteção/)
    expect(friendlyLiveError('Chamada bloqueada: cooldown')).toMatch(/volta sozinha/)
    expect(friendlyLiveError('Token inválido')).toBe('Token inválido')
  })
})
