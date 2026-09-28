import { describe, expect, it } from 'vitest'
import { costBase, fitsKind } from '@/lib/campaignFit'
import { assembleMetrics } from '@/lib/meta'

const lead = (n: number) => [{ action_type: 'onsite_conversion.lead_grouped', value: String(n) }]

describe('campanhas do tipo de resultado', () => {
  it('lead: campanha de lead entra mesmo sem lead; tráfego e alcance ficam de fora', () => {
    expect(fitsKind('form', { objective: 'OUTCOME_LEADS', spend: 50, results: 0, leads: 0 })).toBe(true)
    expect(fitsKind('form', { objective: 'OUTCOME_TRAFFIC', spend: 50, results: 0, leads: 0 })).toBe(false)
    expect(fitsKind('form', { objective: 'OUTCOME_AWARENESS', spend: 50, results: 0, leads: 0 })).toBe(false)
    expect(fitsKind('form', { objective: 'OUTCOME_ENGAGEMENT', spend: 50, results: 3, leads: 3 })).toBe(false)
  })
  it('sem objetivo conhecido, vale quem gerou o resultado', () => {
    expect(fitsKind('form', { spend: 10, results: 2, leads: 2 })).toBe(true)
    expect(fitsKind('form', { spend: 10, results: 0, leads: 0 })).toBe(false)
  })
  it('conversa: mensagens entram; tráfego não', () => {
    expect(fitsKind('conversa', { objective: 'MESSAGES', spend: 10, results: 0, leads: 0 })).toBe(true)
    expect(fitsKind('conversa', { objective: 'OUTCOME_TRAFFIC', spend: 10, results: 0, leads: 0 })).toBe(false)
  })
  it('misto não filtra', () => {
    expect(fitsKind('misto', { objective: 'OUTCOME_TRAFFIC', spend: 10, results: 0, leads: 0 })).toBe(true)
  })
  it('soma só o que é do tipo', () => {
    const b = costBase('form', [{ objective: 'OUTCOME_LEADS', spend: 100, results: 10, leads: 10 }, { objective: 'OUTCOME_TRAFFIC', spend: 200, results: 0, leads: 0 }])
    expect(b).toMatchObject({ spend: 100, leads: 10, campaigns: 1, total: 2 })
  })
})

describe('custo por lead nas métricas do cliente', () => {
  it('não conta a verba de campanha de tráfego', () => {
    const r = assembleMetrics('act_1', 'last_7d', {
      account: { currency: 'BRL' },
      summaryRow: { spend: '300', impressions: '1000', clicks: '100', actions: lead(10) },
      prevRow: { spend: '200', impressions: '900', clicks: '90', actions: lead(10) },
      campaigns: [
        { id: '1', name: 'Leads', objective: 'OUTCOME_LEADS', insight: { spend: '100', actions: lead(10) } },
        { id: '2', name: 'Tráfego', objective: 'OUTCOME_TRAFFIC', insight: { spend: '200' } },
      ],
    })
    expect(r.summary.cpl).toBe(10) // 100 / 10, e não 300 / 10
    expect(r.summary.cost_per_result).toBe(10)
    expect(r.summary_prev?.cpl).toBeNull() // sem campanhas no período anterior: não compara bases diferentes
  })
  it('conta inteira de lead: nada muda', () => {
    const r = assembleMetrics('act_1', 'last_7d', {
      account: { currency: 'BRL' },
      summaryRow: { spend: '100', actions: lead(10) },
      prevRow: { spend: '80', actions: lead(8) },
      campaigns: [{ id: '1', name: 'Leads', objective: 'OUTCOME_LEADS', insight: { spend: '100', actions: lead(10) } }],
    })
    expect(r.summary.cpl).toBe(10)
    expect(r.summary_prev?.cpl).toBe(10)
  })
  it('com a campanha por campanha do período anterior, compara igual para igual em vez de ficar sem comparação', () => {
    const r = assembleMetrics('act_1', 'last_7d', {
      account: { currency: 'BRL' },
      summaryRow: { spend: '300', actions: lead(10) },
      prevRow: { spend: '250', actions: lead(9) }, // conta inteira: se fosse usado direto, daria um CPL bem diferente (27,7)
      campaigns: [
        { id: '1', name: 'Leads', objective: 'OUTCOME_LEADS', insight: { spend: '100', actions: lead(10) }, prevInsight: { spend: '90', actions: lead(9) } },
        { id: '2', name: 'Tráfego', objective: 'OUTCOME_TRAFFIC', insight: { spend: '200' }, prevInsight: { spend: '160' } },
      ],
    })
    expect(r.summary.cpl).toBe(10) // 100 / 10
    expect(r.summary_prev?.cpl).toBe(10) // 90 / 9, não 250 / 9
  })
  it('sem lead nenhum na campanha de lead do período anterior: fica "vs 0" (null), não inventa custo', () => {
    const r = assembleMetrics('act_1', 'last_7d', {
      account: { currency: 'BRL' },
      summaryRow: { spend: '100', actions: lead(10) },
      prevRow: { spend: '50', actions: lead(0) },
      campaigns: [
        { id: '1', name: 'Leads', objective: 'OUTCOME_LEADS', insight: { spend: '100', actions: lead(10) }, prevInsight: { spend: '50' } },
        { id: '2', name: 'Tráfego', objective: 'OUTCOME_TRAFFIC', insight: { spend: '0' }, prevInsight: { spend: '0' } },
      ],
    })
    expect(r.summary_prev?.cpl).toBeNull()
  })
})

describe('período anterior sem nenhuma linha (conta sem entrega naquela semana)', () => {
  it('vira zero em vez de "sem comparação": a Meta não devolve linha quando não houve gasto', () => {
    const r = assembleMetrics('act_1', 'last_7d', {
      account: { currency: 'BRL' },
      summaryRow: { spend: '150', actions: lead(20) },
      // prevRow ausente (a Meta devolveu data:[] pro período anterior)
      campaigns: [{ id: '1', name: 'Leads', objective: 'OUTCOME_LEADS', insight: { spend: '150', actions: lead(20) } }],
    })
    expect(r.summary_prev).toMatchObject({ spend: 0, leads: 0, results: 0 })
  })
})
