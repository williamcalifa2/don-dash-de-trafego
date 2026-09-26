import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentTimeRange } from '@/lib/meta'
import { leadsInPeriod } from '@/lib/leadUtils'
import { presetRangeBr } from '@/lib/ecomFunnel'
import { rangeFor } from '@/lib/googleAds/gaql'

const NOW = Date.parse('2026-09-25T15:00:00Z') // sexta, 12h em Brasília
const lead = (iso: string) => ({ created_at: iso }) as never

describe('períodos novos nas demais telas', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(() => vi.useRealTimers())

  it('métricas da Meta: mesmo intervalo dos períodos novos', () => {
    expect(currentTimeRange('this_week', NOW)).toEqual({ since: '2026-09-21', until: '2026-09-25' })
    expect(currentTimeRange('yesterday', NOW)).toEqual({ since: '2026-09-24', until: '2026-09-24' })
    expect(currentTimeRange('last_month', NOW)).toEqual({ since: '2026-08-01', until: '2026-08-31' })
  })
  it('leads do CRM: ontem, semana e mês passado', () => {
    const leads = [lead('2026-09-24T14:00:00Z'), lead('2026-09-25T14:00:00Z'), lead('2026-09-22T14:00:00Z'), lead('2026-08-15T14:00:00Z'), lead('2026-09-16T14:00:00Z')]
    expect(leadsInPeriod(leads, 'yesterday')).toHaveLength(1)
    expect(leadsInPeriod(leads, 'today_yesterday')).toHaveLength(2)
    expect(leadsInPeriod(leads, 'this_week')).toHaveLength(3)
    expect(leadsInPeriod(leads, 'last_week')).toHaveLength(1) // 16/09
    expect(leadsInPeriod(leads, 'last_month')).toHaveLength(1) // 15/08
    expect(leadsInPeriod(leads, 'yesterday', 1)).toHaveLength(0)
  })
  it('funil do e-commerce: janela do período novo', () => {
    const y = presetRangeBr('yesterday', NOW)
    expect(y.since).toBe('2026-09-24T03:00:00.000Z')
    expect(y.until).toBe('2026-09-25T03:00:00.000Z')
    expect(presetRangeBr('this_week', NOW).until).toBeNull() // inclui hoje: vai até agora
    expect(presetRangeBr('last_week', NOW).since).toBe('2026-09-14T03:00:00.000Z')
  })
  it('Google Ads aceita os mesmos períodos', () => {
    expect(rangeFor('yesterday', new Date(NOW))).toEqual({ since: '2026-09-24', until: '2026-09-24' })
    expect(rangeFor('last_week', new Date(NOW))).toEqual({ since: '2026-09-14', until: '2026-09-20' })
  })
})
