import { describe, expect, it } from 'vitest'
import { buildReport, usageTypeOf } from '@/lib/metaUsage'

describe('tipo de consulta', () => {
  it('reconhece cada família', () => {
    expect(usageTypeOf('act_#/activities')).toBe('historico')
    expect(usageTypeOf('act_#/insights')).toBe('insights')
    expect(usageTypeOf('act_#/campaigns')).toBe('estrutura')
    expect(usageTypeOf('act_#')).toBe('conta')
    expect(usageTypeOf('#/leads')).toBe('leads')
    expect(usageTypeOf('#/published_posts')).toBe('organico')
    expect(usageTypeOf('me/adaccounts')).toBe('acesso')
    expect(usageTypeOf('act_#/customconversions')).toBe('conversoes')
    expect(usageTypeOf('batch')).toBe('outros')
  })
})

describe('relatório de consumo', () => {
  const base = { client_id: 'c1', endpoint: 'act_#/insights', calls: 1, outcome: 'ok', dry_run: false, app_pct: 10, account_pct: 20 }
  it('soma só o que saiu de verdade e agrupa', () => {
    const r = buildReport([
      base, { ...base, calls: 4, endpoint: 'act_#/activities', client_id: 'c2' },
      { ...base, dry_run: true, calls: 50 }, { ...base, outcome: 'blocked_cap', calls: 9 }, { ...base, outcome: 'rate_limit', app_pct: 95 },
    ])
    expect(r.calls).toBe(6)
    expect(r.rateLimitErrors).toBe(1)
    expect(r.peakAppPct).toBe(95)
    expect(r.byType[0]).toMatchObject({ type: 'historico', calls: 4 })
    expect(r.byClient[0]).toEqual({ clientId: 'c2', calls: 4 })
  })
})
