import { describe, it, expect } from 'vitest'
import { getMetricTooltip, METRIC_TOOLTIPS } from '@/lib/metricTooltips'

describe('metricTooltips dictionary and resolver', () => {
  it('resolves core financial metrics directly and via aliases', () => {
    const spend = getMetricTooltip('spend')
    expect(spend).not.toBeNull()
    expect(spend?.title).toContain('Investimento')

    expect(getMetricTooltip('Investimento')?.title).toContain('Investimento')
    expect(getMetricTooltip('Investido')?.title).toContain('Investimento')

    const cpc = getMetricTooltip('CPC')
    expect(cpc).not.toBeNull()
    expect(cpc?.title).toContain('CPC')
    expect(cpc?.formula).toBe('Investimento ÷ Total de Cliques')

    const cpm = getMetricTooltip('CPM')
    expect(cpm?.formula).toContain('1.000')

    const cpl = getMetricTooltip('CPL')
    expect(cpl?.title).toContain('CPL')
    expect(getMetricTooltip('Custo / Res.')?.title).toContain('CPL')

    const roas = getMetricTooltip('ROAS')
    expect(roas?.title).toContain('ROAS')
    expect(roas?.formula).toContain('Receita')
  })

  it('resolves traffic, reach and engagement metrics', () => {
    expect(getMetricTooltip('impressões')?.title).toContain('Impressões')
    expect(getMetricTooltip('alcance')?.title).toContain('Alcance')
    expect(getMetricTooltip('frequência')?.title).toContain('Frequência')
    expect(getMetricTooltip('Freq.')?.title).toContain('Frequência')
    expect(getMetricTooltip('ctr')?.title).toContain('CTR')
    expect(getMetricTooltip('CTR')?.formula).toContain('Cliques ÷ Impressões')
  })

  it('resolves conversions, conversations, and e-commerce metrics', () => {
    expect(getMetricTooltip('leads')?.title).toContain('Leads')
    expect(getMetricTooltip('Conversas')?.title).toContain('Conversas')
    expect(getMetricTooltip('Custo/Conv.')?.title).toContain('Custo por Conversa')
    expect(getMetricTooltip('Faturamento aprovado')?.title).toContain('Faturamento Aprovado')
    expect(getMetricTooltip('Ticket médio')?.title).toContain('Ticket Médio')
    expect(getMetricTooltip('Carrinhos abandonados')?.title).toContain('Carrinhos Abandonados')
  })

  it('resolves Google Analytics and Google Ads metrics', () => {
    expect(getMetricTooltip('Sessões')?.title).toContain('Sessões')
    expect(getMetricTooltip('Usuários')?.title).toContain('Usuários')
    expect(getMetricTooltip('Usuários novos')?.title).toContain('Novos Visitantes')
    expect(getMetricTooltip('Conversões')?.title).toContain('Conversões')
    expect(getMetricTooltip('Custo por conversão')?.title).toContain('Custo por Conversão')
  })

  it('returns null for unknown or empty labels safely without throwing', () => {
    expect(getMetricTooltip(null)).toBeNull()
    expect(getMetricTooltip(undefined)).toBeNull()
    expect(getMetricTooltip('')).toBeNull()
    expect(getMetricTooltip('xyz_inexistente_123')).toBeNull()
  })

  it('every entry in METRIC_TOOLTIPS has non-empty title and description', () => {
    for (const [key, val] of Object.entries(METRIC_TOOLTIPS)) {
      expect(val.title.trim().length, `title for ${key}`).toBeGreaterThan(0)
      expect(val.description.trim().length, `description for ${key}`).toBeGreaterThan(10)
    }
  })
})
