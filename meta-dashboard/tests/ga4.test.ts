import { describe, expect, it } from 'vitest'
import { batchOne, batchTwo, cleanPropertyId, derive, parseDaily, parseLive, parseRows, parseSummary, prettyDevice, prettySource, type GaResponse } from '@/lib/ga4/report'
import { mockGa4 } from '@/lib/ga4/mock'

const cell = (v: string) => ({ value: v })

describe('propriedade do GA4', () => {
  it('aceita só números, com ou sem o prefixo', () => {
    expect(cleanPropertyId('123456789')).toBe('123456789')
    expect(cleanPropertyId(' properties/987654321 ')).toBe('987654321')
    expect(cleanPropertyId('G-ABC123')).toBe('')
    expect(cleanPropertyId('12')).toBe('')
    expect(cleanPropertyId(null)).toBe('')
  })
})

describe('leitura do GA4', () => {
  it('resumo do período atual e do anterior', () => {
    const res: GaResponse = {
      dimensionHeaders: [{ name: 'dateRange' }],
      rows: [
        { dimensionValues: [cell('anterior')], metricValues: ['80', '60', '30', '0.4', '40', '4'].map(cell) },
        { dimensionValues: [cell('atual')], metricValues: ['100', '75', '40', '0.55', '62', '8'].map(cell) },
      ],
    }
    const { current, previous } = parseSummary(res)
    expect(current).toMatchObject({ sessions: 100, users: 75, newUsers: 40, keyEvents: 8 })
    expect(current.engagementRate).toBeCloseTo(55)
    expect(current.conversionRate).toBeCloseTo(8)
    expect(previous.sessions).toBe(80)
  })
  it('sem eventos-chave ou sessões não divide por zero', () => {
    expect(derive({ sessions: 0, users: 0, newUsers: 0, engagementRate: 0, avgSessionSec: 0, keyEvents: 0 }).conversionRate).toBe(0)
    expect(parseSummary(undefined).current.sessions).toBe(0)
  })
  it('dia a dia em ordem e com a data legível', () => {
    const d = parseDaily({ rows: [{ dimensionValues: [cell('20260902')], metricValues: [cell('10'), cell('1')] }, { dimensionValues: [cell('20260901')], metricValues: [cell('20'), cell('2')] }] })
    expect(d.map(x => x.date)).toEqual(['2026-09-01', '2026-09-02'])
    expect(d[0].sessions).toBe(20)
  })
  it('linhas: nomes legíveis e campanhas sem UTM ficam de fora', () => {
    const res: GaResponse = { rows: [
      { dimensionValues: [cell('(direct) / (none)')], metricValues: ['50', '2', '40', '0.5'].map(cell) },
      { dimensionValues: [cell('facebook / cpc')], metricValues: ['30', '5', '25', '0.7'].map(cell) },
      { dimensionValues: [cell('(not set)')], metricValues: ['9', '0', '9', '0.1'].map(cell) },
    ] }
    expect(parseRows(res, { pretty: prettySource }).map(r => r.label)).toEqual(['Direto', 'facebook / cpc', 'Não informado'])
    expect(parseRows(res, { hideNotSet: true }).map(r => r.label)).toEqual(['Direto', 'facebook / cpc'])
    expect(parseRows(res)[1]).toMatchObject({ sessions: 30, keyEvents: 5, users: 25 })
    expect(parseRows(res)[1].engagementRate).toBeCloseTo(70)
  })
  it('dispositivo e tempo real', () => {
    expect(prettyDevice('mobile')).toBe('Celular')
    expect(prettyDevice('outro')).toBe('outro')
    expect(parseLive({ rows: [{ metricValues: [cell('7')] }] })).toBe(7)
    expect(parseLive({ rows: [] })).toBe(0)
    expect(parseLive(undefined)).toBeNull()
  })
})

describe('consultas ao GA4', () => {
  const r = { since: '2026-09-01', until: '2026-09-07' }, prev = { since: '2026-08-25', until: '2026-08-31' }
  it('primeiro lote tem 5 relatórios, o resumo com os dois intervalos nomeados', () => {
    const b = batchOne(r, prev)
    expect(b).toHaveLength(5)
    expect(b[0].dateRanges.map(x => (x as { name?: string }).name)).toEqual(['atual', 'anterior'])
  })
  it('segundo lote: dispositivo e cidade', () => { expect(batchTwo(r)).toHaveLength(2) })
})

describe('dados de exemplo', () => {
  it('são estáveis e fecham as contas', () => {
    const range = { since: '2026-09-01', until: '2026-09-07' }
    const a = mockGa4('123456789', range)
    expect(mockGa4('123456789', range).summary).toEqual(a.summary)
    expect(a.daily).toHaveLength(7)
    expect(a.summary.sessions).toBe(a.daily.reduce((n, d) => n + d.sessions, 0))
    expect(a.source).toBe('demo')
  })
})
