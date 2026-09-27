import { describe, expect, it } from 'vitest'
import { buildWeeklyMessage, last7Range, prevWeek, profileVisitsOf, rangeLabel, weekKeyBr, type WeekNumbers } from '@/lib/weeklyReport'

const n = (o: Partial<WeekNumbers> = {}): WeekNumbers => ({ spend: 1000, clicks: 2000, reach: 15000, leads: 40, results: 86, cpl: 25, cost_per_result: 11.63, purchase_value: 0, roas: null, profileVisits: 0, profileSpend: 0, ...o })
const base = { business: 'Estrela Utilidades', range: { since: '2026-09-14', until: '2026-09-20' }, campaigns: [{ name: 'Promo Setembro', spend: 400, results: 41, leads: 0 }, { name: 'Outra', spend: 200, results: 5, leads: 0 }] }

describe('datas', () => {
  it('rótulo do período', () => {
    expect(rangeLabel({ since: '2026-09-14', until: '2026-09-20' })).toBe('14 a 20/09')
    expect(rangeLabel({ since: '2026-09-28', until: '2026-10-04' })).toBe('28/09 a 04/10')
  })
  it('semana anterior', () => { expect(prevWeek({ since: '2026-09-14', until: '2026-09-20' })).toEqual({ since: '2026-09-07', until: '2026-09-13' }) })
  it('a chave é a segunda-feira da semana atual', () => {
    expect(weekKeyBr(Date.parse('2026-09-28T04:00:00Z'))).toBe('2026-09-28')
    expect(weekKeyBr(Date.parse('2026-09-27T20:00:00Z'))).toBe('2026-09-21')
  })
  it('na segunda de manhã os últimos 7 dias são a semana anterior inteira', () => {
    expect(last7Range(Date.parse('2026-09-28T12:00:00Z'))).toEqual({ since: '2026-09-21', until: '2026-09-27' })
  })
})

describe('mensagem da semana (formato combinado)', () => {
  const cur = n({ spend: 356.05, results: 57, cost_per_result: 4.45, reach: 21879, clicks: 856, profileVisits: 493, profileSpend: 113.39 })
  const prev = n({ spend: 282, results: 33, cost_per_result: 8.55, reach: 9000, clicks: 500, profileVisits: 0 })
  const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: cur, previous: prev })!

  it('cabeçalho e investimento', () => {
    expect(m.split('\n')[0]).toBe('Bom dia, pessoal! ☀️ Tudo bem? Segue o report dos últimos 7 dias (14 a 20/09) da Estrela Utilidades, com comparativo da semana anterior (07 a 13/09):')
    expect(m).toContain('\n\n📊 Investimos R$ 356,05 no período.\n\nResultados da semana:\n\n')
  })
  it('resultados com comparativo e a campanha nova', () => {
    expect(m).toContain('💬 57 conversas iniciadas no WhatsApp (vs 33 | +73%)')
    expect(m).toContain('💰 CPL médio R$ 4,45 (vs R$ 8,55 | -48%)')
    expect(m).toContain('👀 493 visitas ao perfil (vs 0 semana anterior | campanha nova)')
    expect(m).toContain('🏷️ Custo por visita R$ 0,23')
    expect(m).toContain('📣 21.879 pessoas alcançadas')
    expect(m).toContain('👆 856 cliques totais')
  })
  it('mantém a campanha destaque e o fechamento', () => {
    expect(m).toMatch(/🏆 Destaque: a campanha "Promo Setembro" trouxe 41 conversas iniciadas no WhatsApp \(R\$ 9,76 cada\)\./)
    expect(m.endsWith('\n\nQualquer dúvida, é só chamar! 🙌')).toBe(true)
  })
  it('usa o mesmo texto do exemplo, linha a linha', () => {
    const lines = m.split('\n')
    expect(lines.slice(0, 13)).toEqual([
      'Bom dia, pessoal! ☀️ Tudo bem? Segue o report dos últimos 7 dias (14 a 20/09) da Estrela Utilidades, com comparativo da semana anterior (07 a 13/09):',
      '', '📊 Investimos R$ 356,05 no período.', '', 'Resultados da semana:', '',
      '💬 57 conversas iniciadas no WhatsApp (vs 33 | +73%)',
      '💰 CPL médio R$ 4,45 (vs R$ 8,55 | -48%)',
      '👀 493 visitas ao perfil (vs 0 semana anterior | campanha nova)',
      '🏷️ Custo por visita R$ 0,23',
      '📣 21.879 pessoas alcançadas',
      '👆 856 cliques totais', '',
    ])
  })
})

describe('outros tipos e casos', () => {
  it('leads de formulário: leads e CPL', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'form', current: n() })!
    expect(m).toContain('📝 40 leads')
    expect(m).toContain('💰 CPL médio R$ 25,00')
  })
  it('sem semana anterior não mostra comparativo nem o trecho do cabeçalho', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), previous: null })!
    expect(m).not.toContain('comparativo da semana anterior')
    expect(m).not.toContain(' (vs ')
    expect(m.split('\n')[0]).toContain('da Estrela Utilidades:')
  })
  it('venda inclui faturamento e retorno', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'sales', current: n({ results: 12, purchase_value: 4800, roas: 4.8 }) })!
    expect(m).toContain('🛒 12 compras')
    expect(m).toMatch(/💵 Faturamento R\$ 4\.800,00/)
    expect(m).toContain('📈 Retorno sobre o investimento 4,8x')
  })
  it('sem visitas ao perfil, a linha não aparece', () => {
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n() })).not.toContain('visitas ao perfil')
  })
  it('visitas que também existiam antes mostram a variação', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ profileVisits: 300 }), previous: n({ profileVisits: 200 }) })!
    expect(m).toContain('👀 300 visitas ao perfil (vs 200 | +50%)')
  })
  it('sem gasto e sem resultado não gera mensagem', () => {
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ spend: 0, results: 0, leads: 0 }) })).toBeNull()
  })
  it('reconhece visitas ao perfil pelas ações da Meta', () => {
    expect(profileVisitsOf([{ type: 'instagram_profile_visit', value: 400 }, { type: 'link_click', value: 900 }, { type: 'onsite_conversion.profile_visit', value: 93 }])).toBe(493)
    expect(profileVisitsOf(undefined)).toBe(0)
  })
})
