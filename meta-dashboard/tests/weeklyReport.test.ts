import { describe, expect, it } from 'vitest'
import { EMPTY_ORGANIC, buildWeeklyMessage, last7Range, organicWeekly, prevWeek, profileCampaignSpend, rangeLabel, weekKeyBr, type OrganicWeekly, type WeekNumbers } from '@/lib/weeklyReport'

const n = (o: Partial<WeekNumbers> = {}): WeekNumbers => ({ spend: 1000, reach: 15000, leads: 40, results: 86, cpl: 25, cost_per_result: 11.63, purchase_value: 0, roas: null, ...o })
const wp = (value: number | null, prev: number | null = null) => ({ value, prev })
const prof = (o: Partial<OrganicWeekly> = {}): OrganicWeekly => ({ ...EMPTY_ORGANIC, ...o })
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
  const cur = n({ spend: 356.05, results: 57, cost_per_result: 4.45, reach: 21879 })
  const prev = n({ spend: 282, results: 33, cost_per_result: 8.55, reach: 9000 })
  const profile = prof({ visits: wp(493, 0), spend: 113.39 })
  const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: cur, previous: prev, profile })!

  it('cabeçalho e investimento', () => {
    expect(m.split('\n')[0]).toBe('Bom dia, pessoal! ☀️ Tudo bem? Segue o report dos últimos 7 dias (14 a 20/09) da Estrela Utilidades, com comparativo da semana anterior (07 a 13/09):')
    expect(m).toContain('\n\n📊 Investimos R$ 356,05 no período.\n\nResultados da semana:\n\n')
  })
  it('resultados com comparativo, sem cliques totais', () => {
    expect(m).toContain('💬 57 conversas iniciadas no WhatsApp (vs 33 | +73%)')
    expect(m).toContain('💰 CPL médio R$ 4,45 (vs R$ 8,55 | -48%)')
    expect(m).toContain('👀 493 visitas ao perfil (vs 0 semana anterior)')
    expect(m).toContain('🏷️ Custo por visita R$ 0,23')
    expect(m).toContain('📣 21.879 pessoas alcançadas')
    expect(m).not.toContain('cliques')
  })
  it('mantém a campanha destaque e o fechamento', () => {
    expect(m).toMatch(/🏆 Destaque: a campanha "Promo Setembro" trouxe 41 conversas iniciadas no WhatsApp \(R\$ 9,76 cada\)\./)
    expect(m.endsWith('\n\nQualquer dúvida, é só chamar! 🙌')).toBe(true)
  })
})

describe('engajamento, visitas ao perfil e seguidores — todos com variação', () => {
  it('engajamento com comparativo', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof({ engagement: wp(340, 210) }) })!
    expect(m).toContain('❤️ 340 interações no Instagram (vs 210 | +62%)')
  })
  it('visitas ao perfil com comparativo real', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof({ visits: wp(300, 200) }) })!
    expect(m).toContain('👀 300 visitas ao perfil (vs 200 | +50%)')
  })
  it('sem base de comparação, não mostra "(vs...)"', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof({ visits: wp(120, null) }) })!
    expect(m).toContain('👀 120 visitas ao perfil')
    expect(m).not.toContain('(vs')
  })
  it('sem visitas, a linha não aparece', () => {
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof() })).not.toContain('visitas ao perfil')
  })
  it('seguidores novos com variação da própria captação da semana anterior', () => {
    const up = buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof({ newFollowers: wp(42, 30) }) })!
    expect(up).toContain('👥 +42 seguidores novos no Instagram (vs 30 | +40%)')
    const down = buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof({ newFollowers: wp(-3, null) }) })!
    expect(down).toContain('👥 -3 seguidores novos no Instagram')
  })
  it('zero ou sem dado orgânico não mostra a linha de seguidores', () => {
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof({ newFollowers: wp(0, 0) }) })).not.toContain('seguidores')
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), profile: prof({ newFollowers: wp(null, null) }) })).not.toContain('seguidores')
  })
  it('só orgânico (sem gasto nem resultado pago) ainda gera mensagem', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ spend: 0, results: 0, leads: 0 }), profile: prof({ visits: wp(80, null), newFollowers: wp(5, null) }) })
    expect(m).toContain('Sem investimento em anúncios na semana. Resultados do orgânico:')
    expect(m).toContain('👀 80 visitas ao perfil')
  })
  it('extrai do que a aba Orgânico calcula', () => {
    const view = { status: 'ok' as const, kpis: { ig: [{ key: 'visits', value: 493, prev: 0 }, { key: 'gained', value: 30, prev: 20 }, { key: 'interactions', value: 340, prev: 210 }] } }
    expect(organicWeekly(view, 113.39)).toEqual({ engagement: wp(340, 210), visits: wp(493, 0), newFollowers: wp(30, 20), spend: 113.39 })
    expect(organicWeekly(null, null)).toEqual(EMPTY_ORGANIC)
    expect(organicWeekly({ status: 'pending', kpis: { ig: [] } } as never, null)).toEqual(EMPTY_ORGANIC)
  })
  it('achar a verba pelo nome da campanha de visita ao perfil', () => {
    expect(profileCampaignSpend([{ name: 'DON | VISITAS AO PERFIL | INSTI', spend: 100, results: 0, leads: 0 }, { name: 'DON | LEAD | Fecha Mês', spend: 50, results: 5, leads: 5 }])).toBe(100)
    expect(profileCampaignSpend([{ name: 'DON | LEAD | Fecha Mês', spend: 50, results: 5, leads: 5 }])).toBeNull()
  })
})

describe('comparação em todas as métricas (menos investimento)', () => {
  it('investimento nunca leva comparação, mesmo com semana anterior disponível', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ spend: 356.05 }), previous: n({ spend: 282 }) })!
    expect(m).toContain('📊 Investimos R$ 356,05 no período.')
    expect(m).not.toContain('Investimos R$ 356,05 no período (vs')
  })
  it('alcance compara com a semana anterior', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ reach: 21879 }), previous: n({ reach: 9000 }) })!
    expect(m).toContain('📣 21.879 pessoas alcançadas (vs 9.000 | +143%)')
  })
  it('faturamento e ROAS comparam também', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'sales', current: n({ results: 12, purchase_value: 4800, roas: 4.8 }), previous: n({ results: 8, purchase_value: 3000, roas: 3.6 }) })!
    expect(m).toContain('💵 Faturamento R$ 4.800,00 (vs R$ 3.000,00 | +60%)')
    expect(m).toContain('📈 Retorno sobre o investimento 4,8x (vs 3,6x | +33%)')
  })
  it('semana anterior zerada mostra "vs 0 semana anterior" em qualquer métrica', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ reach: 500 }), previous: n({ reach: 0 }) })!
    expect(m).toContain('📣 500 pessoas alcançadas (vs 0 semana anterior)')
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
  it('sem gasto, sem resultado e sem orgânico não gera mensagem', () => {
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ spend: 0, results: 0, leads: 0 }) })).toBeNull()
  })
})
