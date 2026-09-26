import { describe, expect, it } from 'vitest'
import { isAwaitingData, refreshReasonText, shouldCacheMetrics } from '@/lib/metricsState'
import { describeFreshness } from '@/lib/meta/read'
import { metaConfig } from '@/lib/meta/config'

describe('resposta de métricas sem leitura', () => {
  it('período sem cópia é "sem leitura" e não pode virar zero de mentira', () => {
    const f = describeFreshness(null, null, metaConfig(), Date.now())
    expect(f.pending).toBe(true)
    expect(isAwaitingData({ freshness: f, summary: { spend: 0 } })).toBe(true)
  })
  it('resposta com dado de verdade não é "sem leitura"', () => {
    const f = describeFreshness(Date.now() - 60_000, null, metaConfig(), Date.now())
    expect(isAwaitingData({ freshness: f, summary: { spend: 120 } })).toBe(false)
    expect(isAwaitingData({ summary: { spend: 120 } })).toBe(false) // modo ao vivo não tem freshness
    expect(isAwaitingData(null)).toBe(false)
  })
  it('só guarda no cache o que é número de verdade', () => {
    expect(shouldCacheMetrics({ summary: {}, freshness: { pending: true } }, true)).toBe(false)
    expect(shouldCacheMetrics({ summary: {}, freshness: { pending: false } }, true)).toBe(true)
    expect(shouldCacheMetrics({ summary: {} }, false)).toBe(false)
    expect(shouldCacheMetrics({ freshness: { pending: false } }, true)).toBe(false)
  })
  it('dado antigo continua valendo (só avisa que está velho)', () => {
    const cfg = metaConfig()
    const f = describeFreshness(Date.now() - cfg.ttlInsightsMin * 60_000 * 10, null, cfg, Date.now())
    expect(f.stale).toBe(true)
    expect(f.pending).toBe(false)
    expect(isAwaitingData({ freshness: f, summary: {} })).toBe(false)
  })
})

describe('motivo da busca que não rodou', () => {
  it('explica em português', () => {
    expect(refreshReasonText('disabled')).toMatch(/DRY_RUN/)
    expect(refreshReasonText('cap_app_hour')).toMatch(/limite de leituras/i)
    expect(refreshReasonText('rate_limit')).toMatch(/ritmo/)
    expect(refreshReasonText(undefined)).toBeNull()
    expect(refreshReasonText('algo_novo')).toContain('algo_novo')
  })
})
