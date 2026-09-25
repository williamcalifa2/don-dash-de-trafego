import { describe, expect, it } from 'vitest'
import { campaignsQuery, cleanCustomerId, derive, parseCampaigns, parseDaily, parseSummary, previousRange, rangeFor } from '@/lib/googleAds/gaql'
import { mockGoogle } from '@/lib/googleAds/mock'

const NOW = new Date('2026-09-25T15:00:00Z') // 12h em Brasília

describe('períodos do Google Ads', () => {
  it('hoje e últimos 7 dias contam com o dia de hoje', () => {
    expect(rangeFor('today', NOW)).toEqual({ since: '2026-09-25', until: '2026-09-25' })
    expect(rangeFor('last_7d', NOW)).toEqual({ since: '2026-09-19', until: '2026-09-25' })
  })
  it('mês corrente vai do dia 1 até hoje; mês passado fecha o mês', () => {
    expect(rangeFor('this_month', NOW)).toEqual({ since: '2026-09-01', until: '2026-09-25' })
    expect(rangeFor('last_month', NOW)).toEqual({ since: '2026-08-01', until: '2026-08-31' })
  })
  it('usa a data de Brasília depois da meia-noite UTC', () => {
    expect(rangeFor('today', new Date('2026-09-26T01:30:00Z')).since).toBe('2026-09-25')
  })
  it('período anterior tem o mesmo tamanho e termina na véspera', () => {
    expect(previousRange({ since: '2026-09-19', until: '2026-09-25' })).toEqual({ since: '2026-09-12', until: '2026-09-18' })
  })
})

describe('leitura das linhas', () => {
  it('converte micros em moeda e calcula as taxas', () => {
    const s = parseSummary([{ metrics: { costMicros: '150000000', impressions: '10000', clicks: '250', conversions: 5, conversionsValue: 600 } }])
    expect(s.spend).toBe(150)
    expect(s.ctr).toBeCloseTo(2.5)
    expect(s.cpc).toBeCloseTo(0.6)
    expect(s.cpa).toBe(30)
    expect(s.roas).toBe(4)
  })
  it('sem cliques nem conversões não divide por zero', () => {
    const s = derive({ spend: 10, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 })
    expect([s.ctr, s.cpc, s.cpa]).toEqual([0, 0, 0])
    expect(parseSummary([]).spend).toBe(0)
  })
  it('campanhas vêm ordenadas por gasto e com orçamento diário', () => {
    const c = parseCampaigns([
      { campaign: { id: '1', name: 'A', status: 'ENABLED', advertisingChannelType: 'SEARCH' }, campaignBudget: { amountMicros: '50000000' }, metrics: { costMicros: '10000000' } },
      { campaign: { id: '2', name: 'B', status: 'PAUSED' }, metrics: { costMicros: '90000000' } },
      { metrics: { costMicros: '1' } },
    ])
    expect(c.map(x => x.id)).toEqual(['2', '1'])
    expect(c[1].dailyBudget).toBe(50)
    expect(c[0].dailyBudget).toBeNull()
  })
  it('dias saem em ordem cronológica', () => {
    expect(parseDaily([{ segments: { date: '2026-09-02' }, metrics: {} }, { segments: { date: '2026-09-01' }, metrics: {} }]).map(d => d.date)).toEqual(['2026-09-01', '2026-09-02'])
  })
  it('consulta ignora campanhas removidas', () => {
    expect(campaignsQuery({ since: '2026-09-01', until: '2026-09-02' })).toContain("campaign.status != 'REMOVED'")
  })
})

describe('ID da conta', () => {
  it('aceita com ou sem traços e rejeita o que não tem 10 dígitos', () => {
    expect(cleanCustomerId('123-456-7890')).toBe('1234567890')
    expect(cleanCustomerId(' 1234567890 ')).toBe('1234567890')
    expect(cleanCustomerId('12345')).toBe('')
    expect(cleanCustomerId(null)).toBe('')
  })
})

describe('dados de exemplo', () => {
  it('são estáveis para a mesma conta e período e fecham as contas', () => {
    const r = { since: '2026-09-01', until: '2026-09-07' }
    const a = mockGoogle('1234567890', r)
    expect(mockGoogle('1234567890', r).summary).toEqual(a.summary)
    expect(a.daily).toHaveLength(7)
    expect(a.source).toBe('demo')
    expect(a.campaigns.reduce((n, c) => n + c.spend, 0)).toBeCloseTo(a.summary.spend, 0)
  })
})
