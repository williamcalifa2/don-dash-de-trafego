import { describe, expect, it } from 'vitest'
import {
  extractReportKpis,
  type ReportData,
  type ReportNotes,
  type SavedReport,
} from '@/lib/report'

describe('Saved Reports: extractReportKpis', () => {
  const dummyNotes: ReportNotes = {
    objective: 'Crescimento',
    goals: '50 leads',
    analysis: 'Bom desempenho',
    next: 'Escalar criativo vencedor',
  }

  const dummyData: ReportData = {
    month: {
      key: '2026-08',
      label: 'agosto de 2026',
      since: '2026-08-01',
      until: '2026-08-31',
      preset: 'last_month',
    },
    client: { name: 'Cliente Teste', logoUrl: null },
    currency: 'BRL',
    organic: { status: 'ok', handle: '@teste', stats: [], top: [] },
    paid: { status: 'ok', resultLabel: 'Leads', stats: [], top: [] },
    campaigns: [
      { id: '1', name: 'Campanha 1', status: 'ACTIVE', spend: 1000, results: 25, costPerResult: 40, ctr: 2.5 },
      { id: '2', name: 'Campanha 2', status: 'ACTIVE', spend: 2000, results: 75, costPerResult: 26.67, ctr: 3.1 },
    ],
    notes: dummyNotes,
  }

  it('extrai métricas agregadas de campanhas corretamente', () => {
    const kpis = extractReportKpis(dummyData)
    expect(kpis.spend).toBe(3000)
    expect(kpis.results).toBe(100)
    expect(kpis.cpl).toBe(30)
  })

  it('usa o funil como fallback se não houver campanhas', () => {
    const dataWithoutCampaigns: ReportData = {
      ...dummyData,
      campaigns: [],
      funnel: {
        impressions: 50000,
        clicks: 1500,
        results: 120,
        resultLabel: 'Leads',
        costPerResult: 25,
        spend: 3000,
        ctr: 3.0,
        clickToResultRate: 8.0,
        roas: 2.4,
      },
    }

    const kpis = extractReportKpis(dataWithoutCampaigns)
    expect(kpis.spend).toBe(3000)
    expect(kpis.results).toBe(120)
    expect(kpis.cpl).toBe(25)
    expect(kpis.roas).toBe(2.4)
    expect(kpis.impressions).toBe(50000)
  })

  it('monta a estrutura do SavedReport com snapshot preservado', () => {
    const report: SavedReport = {
      id: 'rep_123',
      title: 'Relatório Mensal · Agosto 2026',
      preset: 'last_month',
      periodKey: '2026-08',
      periodLabel: 'agosto de 2026',
      mode: 'standard',
      theme: 'light',
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      author: 'Equipe Don',
      slidesCount: 9,
      kpis: extractReportKpis(dummyData),
      snapshot: {
        data: dummyData,
        notes: dummyNotes,
      },
    }

    expect(report.id).toBe('rep_123')
    expect(report.slidesCount).toBe(9)
    expect(report.snapshot.data.month.key).toBe('2026-08')
    expect(report.kpis?.spend).toBe(3000)
  })

  it('projeta sumários sem o snapshot pesado para a listagem rápida da biblioteca', () => {
    const report1: SavedReport = {
      id: 'rep_1',
      title: 'Relatório Julho',
      preset: 'last_month',
      periodKey: '2026-07',
      periodLabel: 'julho de 2026',
      mode: 'standard',
      theme: 'light',
      createdAt: 1000,
      updatedAt: 1000,
      slidesCount: 9,
      snapshot: { data: dummyData, notes: dummyNotes },
    }
    const report2: SavedReport = {
      id: 'rep_2',
      title: 'Relatório Agosto',
      preset: 'last_month',
      periodKey: '2026-08',
      periodLabel: 'agosto de 2026',
      mode: 'advanced',
      theme: 'dark',
      createdAt: 2000,
      updatedAt: 2000,
      slidesCount: 11,
      snapshot: { data: dummyData, notes: dummyNotes },
    }

    const library = [report1, report2]
    const summaries = library
      .map(({ snapshot, ...rest }) => rest)
      .sort((a, b) => b.createdAt - a.createdAt)

    expect(summaries).toHaveLength(2)
    expect(summaries[0].id).toBe('rep_2') // Mais recente primeiro
    expect(summaries[1].id).toBe('rep_1')
    expect((summaries[0] as unknown as Record<string, unknown>).snapshot).toBeUndefined()
  })
})
