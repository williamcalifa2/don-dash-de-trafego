import { describe, expect, it } from 'vitest'
import { draftAnalysis, last7DaysOf, lastMonthOf, reportPeriodOf, type ReportData, type ReportNotes } from '@/lib/report'
import { buildSlides } from '@/lib/reportSlides'

// 2026-09-21 15:00 UTC (12:00 horário de Brasília)
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0)

describe('Cálculo de períodos para relatórios (reportPeriodOf)', () => {
  it('calcula corretamente os últimos 7 dias (até ontem)', () => {
    const p7 = last7DaysOf(NOW)
    expect(p7.preset).toBe('last_7d')
    expect(p7.label).toBe('Últimos 7 dias')
    expect(p7.until).toBe('2026-09-20')
    expect(p7.since).toBe('2026-09-14')
    expect(p7.key).toBe('7d-2026-09-20')
  })

  it('calcula corretamente o último mês fechado', () => {
    const pm = lastMonthOf(NOW)
    expect(pm.preset).toBe('last_month')
    expect(pm.label).toBe('agosto de 2026')
    expect(pm.since).toBe('2026-08-01')
    expect(pm.until).toBe('2026-08-31')
    expect(pm.key).toBe('2026-08')
  })

  it('reportPeriodOf despacha corretamente de acordo com o preset', () => {
    const p7 = reportPeriodOf('last_7d', NOW)
    const pm = reportPeriodOf('last_month', NOW)
    expect(p7.preset).toBe('last_7d')
    expect(pm.preset).toBe('last_month')
  })
})

describe('Rascunho de análise (draftAnalysis)', () => {
  const baseData: ReportData = {
    month: last7DaysOf(NOW),
    client: { name: 'Cliente Teste', logoUrl: null },
    currency: 'BRL',
    organic: { status: 'ok', handle: '@teste', stats: [{ label: 'Alcance', value: '10 mil', delta: 12.5 }], top: [] },
    paid: {
      status: 'ok',
      resultLabel: 'Leads',
      stats: [
        { label: 'Investimento', value: 'R$ 1.500', delta: 5 },
        { label: 'Leads', value: '150', delta: 10 },
        { label: 'Custo por lead', value: 'R$ 10,00', delta: -5, lowerIsBetter: true },
      ],
      top: [],
    },
    notes: { objective: '', goals: '', analysis: '', next: '' },
  }

  it('gera rascunho com linguagem semanal quando preset é last_7d', () => {
    const text = draftAnalysis(baseData)
    expect(text).toContain('Nos últimos 7 dias, investimos R$ 1.500 e geramos 150 leads, a R$ 10,00 cada.')
    expect(text).toContain('ao período anterior')
    expect(text).toContain('contra o período anterior')
  })

  it('gera rascunho com linguagem mensal quando preset é last_month', () => {
    const text = draftAnalysis({ ...baseData, month: lastMonthOf(NOW) })
    expect(text).toContain('Em agosto, investimos R$ 1.500 e geramos 150 leads, a R$ 10,00 cada.')
    expect(text).toContain('ao mês anterior')
    expect(text).toContain('contra o mês anterior')
  })
})

describe('Construção dos slides (buildSlides)', () => {
  const notes: ReportNotes = {
    objective: 'Crescer vendas',
    goals: '100 leads/semana',
    analysis: 'Excelente resultado',
    next: 'Otimizar campanhas',
  }

  it('ajusta capa, títulos e legendas para os últimos 7 dias', () => {
    const data: ReportData = {
      month: last7DaysOf(NOW),
      client: { name: 'Cliente Teste', logoUrl: null },
      currency: 'BRL',
      organic: { status: 'ok', handle: '@teste', stats: [], top: [] },
      paid: { status: 'ok', resultLabel: 'Leads', stats: [], top: [] },
      notes,
    }

    const slides = buildSlides(data, notes)
    expect(slides).toHaveLength(8)

    // Capa
    const cover = slides.find(s => s.id === 'cover')!
    const coverText = cover.els.find(el => el.t === 'text' && el.text.includes('ÚLTIMOS 7 DIAS'))
    expect(coverText).toBeDefined()

    // Criativos
    const creatives = slides.find(s => s.id === 'creatives')!
    const creativesSub = creatives.els.find(el => el.t === 'text' && el.text.includes('campeões da semana'))
    expect(creativesSub).toBeDefined()

    // Análise
    const analysis = slides.find(s => s.id === 'analysis')!
    const analysisTitle = analysis.els.find(el => el.t === 'text' && el.text.includes('ANÁLISE DO PERÍODO'))
    expect(analysisTitle).toBeDefined()
  })

  it('mantém títulos mensais quando last_month', () => {
    const data: ReportData = {
      month: lastMonthOf(NOW),
      client: { name: 'Cliente Teste', logoUrl: null },
      currency: 'BRL',
      organic: { status: 'ok', handle: '@teste', stats: [], top: [] },
      paid: { status: 'ok', resultLabel: 'Leads', stats: [], top: [] },
      notes,
    }

    const slides = buildSlides(data, notes)
    const cover = slides.find(s => s.id === 'cover')!
    const coverText = cover.els.find(el => el.t === 'text' && el.text.includes('AGOSTO DE 2026'))
    expect(coverText).toBeDefined()

    const creatives = slides.find(s => s.id === 'creatives')!
    const creativesSub = creatives.els.find(el => el.t === 'text' && el.text.includes('campeões do mês'))
    expect(creativesSub).toBeDefined()

    const analysis = slides.find(s => s.id === 'analysis')!
    const analysisTitle = analysis.els.find(el => el.t === 'text' && el.text.includes('ANÁLISE DO MÊS'))
    expect(analysisTitle).toBeDefined()
  })

  it('gera relatório avançado com 11 slides, orgânico antes do pago, perfil de público e campanhas inteligentes', () => {
    const data: ReportData = {
      month: lastMonthOf(NOW),
      client: { name: 'Cliente Teste', logoUrl: null },
      currency: 'BRL',
      organic: { status: 'ok', handle: '@teste', stats: [], top: [] },
      paid: { status: 'ok', resultLabel: 'Leads', stats: [], top: [] },
      notes,
      audience: {
        topAge: [{ label: '25-34 anos', pct: 45 }],
        gender: { female: 65, male: 35 },
        platforms: { instagram: 85, facebook: 15 },
      },
      funnel: {
        impressions: 50000,
        clicks: 2500,
        results: 150,
        resultLabel: 'Leads',
        costPerResult: 10,
        ctr: 5.0,
        clickToResultRate: 6.0,
      },
      campaigns: [
        {
          id: '1',
          name: 'Campanha Conversão',
          status: 'ACTIVE',
          spend: 1000,
          clicks: 300,
          results: 100,
          costPerResult: 10,
          objectiveKind: 'leads',
          primaryMetric: { label: 'Leads', value: '100 leads', cost: 'R$ 10,00 / res.' },
          ctr: 4.5,
        },
      ],
    }

    const standard = buildSlides(data, notes, 'standard')
    expect(standard).toHaveLength(8)

    const advanced = buildSlides(data, notes, 'advanced')
    expect(advanced).toHaveLength(11)

    // Regra: Orgânico sempre antes do pago
    const organicIdx = advanced.findIndex(s => s.id === 'organic')
    const paidIdx = advanced.findIndex(s => s.id === 'overview')
    expect(organicIdx).toBeGreaterThan(-1)
    expect(paidIdx).toBeGreaterThan(-1)
    expect(organicIdx).toBeLessThan(paidIdx)

    // Verifica presença de slides exclusivos do avançado
    expect(advanced.some(s => s.id === 'audience')).toBe(true)
    expect(advanced.some(s => s.id === 'funnel')).toBe(true)
    expect(advanced.some(s => s.id === 'campaigns')).toBe(true)

    // Verifica que o slide de público tem as seções demográficas
    const audienceSlide = advanced.find(s => s.id === 'audience')!
    expect(audienceSlide.els.some(el => el.t === 'text' && el.text.includes('PERFIL DO PÚBLICO'))).toBe(true)

    // Verifica que o slide de campanhas tem as colunas inteligentes
    const campaignsSlide = advanced.find(s => s.id === 'campaigns')!
    const tableEl = campaignsSlide.els.find(el => el.t === 'table')
    expect(tableEl).toBeDefined()
    if (tableEl && tableEl.t === 'table') {
      expect(tableEl.headers).toContain('Campanha')
      expect(tableEl.headers).toContain('Entregas Principais')
      expect(tableEl.headers).toContain('Custo Unitário')
      expect(tableEl.rows).toHaveLength(1)
    }
  })
})

describe('Geração de análise inteligente (generateSmartAnalysis)', () => {
  it('gera análise detalhada e próximos passos estratégicos a partir das métricas', async () => {
    const { generateSmartAnalysis } = await import('@/lib/report')
    const data: ReportData = {
      month: lastMonthOf(NOW),
      client: { name: 'Cliente Teste', logoUrl: null },
      currency: 'BRL',
      organic: { status: 'ok', handle: '@teste', stats: [{ label: 'Alcance', value: '45.000', delta: 15 }], top: [] },
      paid: {
        status: 'ok',
        resultLabel: 'Leads',
        stats: [
          { label: 'Investimento', value: 'R$ 5.000', delta: 5 },
          { label: 'Leads', value: '500', delta: 10 },
          { label: 'Custo por lead', value: 'R$ 10,00', delta: -12, lowerIsBetter: true },
          { label: 'Frequência', value: '3,2', delta: null },
          { label: 'CTR', value: '2,1%', delta: null },
        ],
        top: [
          { id: 'ad1', name: 'Vídeo Gancho A', thumb: null, results: 320, spend: 3000, clicks: 1200, impressions: 50000, costPerResult: 9.37, ctr: 2.4 },
        ],
      },
      campaigns: [
        { id: 'c1', name: 'Topo Funil - Vídeo', status: 'ACTIVE', spend: 3000, results: 320, costPerResult: 9.37, ctr: 2.4 },
      ],
      notes: { objective: '', goals: '', analysis: '', next: '' },
    }

    const { analysis, next } = generateSmartAnalysis(data)
    expect(analysis).toContain('Performance Geral: O investimento total foi de R$ 5.000')
    expect(analysis).toContain('Eficiência Elevada: O custo por lead reduziu 12%')
    expect(analysis).toContain('Frequência de Exibição')
    expect(analysis).toContain('Taxa de Cliques (CTR)')
    expect(analysis).toContain('Anúncio Destaque: A peça "Vídeo Gancho A"')
    expect(next).toContain('Otimização de Escala')
    expect(next).toContain('Renovação de Criativos')
  })
})

