import { describe, expect, it } from 'vitest'
import { dashboardPresets, extraRange, periodQuery, prevExtraRange } from '@/lib/periodsMeta'

// Sexta, 25/09/2026, 12h em Brasília
const NOW = Date.parse('2026-09-25T15:00:00Z')

describe('períodos no formato da Meta', () => {
  it('ontem, hoje e ontem, 28 dias', () => {
    expect(extraRange('yesterday', NOW)).toEqual({ since: '2026-09-24', until: '2026-09-24' })
    expect(extraRange('today_yesterday', NOW)).toEqual({ since: '2026-09-24', until: '2026-09-25' })
    expect(extraRange('last_28d', NOW)).toEqual({ since: '2026-08-28', until: '2026-09-24' })
  })
  it('a semana começa na segunda', () => {
    expect(extraRange('this_week', NOW)).toEqual({ since: '2026-09-21', until: '2026-09-25' })
    expect(extraRange('last_week', NOW)).toEqual({ since: '2026-09-14', until: '2026-09-20' })
  })
  it('em um domingo, esta semana é a que começou na segunda anterior', () => {
    const sunday = Date.parse('2026-09-27T15:00:00Z')
    expect(extraRange('this_week', sunday)).toEqual({ since: '2026-09-21', until: '2026-09-27' })
  })
  it('usa a data de Brasília depois da meia-noite UTC', () => {
    expect(extraRange('yesterday', Date.parse('2026-09-26T01:30:00Z'))).toEqual({ since: '2026-09-24', until: '2026-09-24' })
  })
  it('período anterior tem o mesmo tamanho', () => {
    expect(prevExtraRange('yesterday', NOW)).toEqual({ since: '2026-09-23', until: '2026-09-23' })
    expect(prevExtraRange('today_yesterday', NOW)).toEqual({ since: '2026-09-22', until: '2026-09-23' })
    expect(prevExtraRange('this_week', NOW)).toEqual({ since: '2026-09-14', until: '2026-09-18' }) // seg a sex, como esta semana até hoje
    expect(prevExtraRange('last_week', NOW)).toEqual({ since: '2026-09-07', until: '2026-09-13' })
    expect(prevExtraRange('last_28d', NOW)).toEqual({ since: '2026-07-31', until: '2026-08-27' })
    expect(prevExtraRange('today', NOW)).toBeNull()
  })
  it('consulta: nome quando a Meta conhece, datas quando não', () => {
    expect(periodQuery('last_7d', null)).toBe('date_preset=last_7d')
    expect(periodQuery('last_28d', extraRange('last_28d', NOW))).toBe('date_preset=last_28d')
    expect(decodeURIComponent(periodQuery('this_week', extraRange('this_week', NOW)))).toBe('time_range={"since":"2026-09-21","until":"2026-09-25"}')
  })
  it('lista na ordem da Meta e com o nome dos meses', () => {
    const l = dashboardPresets(NOW)
    expect(l.map(p => p.value)).toEqual(['today', 'yesterday', 'today_yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'this_week', 'last_week', 'this_month', 'last_month'])
    expect(l.find(p => p.value === 'this_month')?.label).toBe('Este mês (Setembro)')
    expect(l.find(p => p.value === 'last_month')?.label).toBe('Mês passado (Agosto)')
    expect(dashboardPresets(Date.parse('2026-01-10T15:00:00Z')).find(p => p.value === 'last_month')?.label).toBe('Mês passado (Dezembro)')
  })
})
