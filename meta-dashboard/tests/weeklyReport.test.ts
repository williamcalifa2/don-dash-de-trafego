import { describe, expect, it } from 'vitest'
import { buildWeeklyMessage, delta, last7Range, weekKeyBr, type WeekNumbers } from '@/lib/weeklyReport'

const n = (o: Partial<WeekNumbers> = {}): WeekNumbers => ({ spend: 1000, clicks: 2000, link_clicks: 1800, ctr: 1.85, leads: 40, results: 86, cpl: 25, cost_per_result: 11.63, purchase_value: 0, roas: null, ...o })
const base = { business: 'Ampari Med', range: { since: '2026-09-21', until: '2026-09-27' }, campaigns: [{ name: 'Promo Setembro', spend: 400, results: 41, leads: 0 }, { name: 'Outra', spend: 200, results: 5, leads: 0 }] }

describe('variação', () => {
  it('positiva, negativa, igual e sem base', () => {
    expect(delta(112, 100)).toBe(' (+12% vs semana anterior)')
    expect(delta(91, 100)).toBe(' (−9% vs semana anterior)')
    expect(delta(100, 100)).toBe(' (igual à semana anterior)')
    expect(delta(50, 0)).toBe('')
    expect(delta(50, null)).toBe('')
  })
})

describe('mensagem da semana', () => {
  it('começa com "Bom dia, pessoal!" e traz o período e o negócio', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n() })!
    expect(m.startsWith('Bom dia, pessoal!')).toBe(true)
    expect(m).toContain('resumo da semana (21/09 a 27/09) da Ampari Med')
  })
  it('conversas: investimento, resultado, custo por conversa e cliques', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n(), previous: n({ spend: 800, results: 70, cost_per_result: 12.8 }) })!
    expect(m).toMatch(/Investimento: R\$\s1\.000,00 \(\+25% vs semana anterior\)/)
    expect(m).toContain('💬 Conversas iniciadas: 86 (+23% vs semana anterior)')
    expect(m).toMatch(/Custo por conversa iniciada: R\$\s11,63 \(−9% vs semana anterior\)/)
    expect(m).toContain('Cliques: 1.800 · CTR 1,9%')
  })
  it('leads de formulário usam leads e o CPL', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'form', current: n() })!
    expect(m).toContain('📝 Leads: 40')
    expect(m).toMatch(/Custo por lead: R\$\s25,00/)
  })
  it('venda inclui faturamento e retorno', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'sales', current: n({ results: 12, purchase_value: 4800, roas: 4.8 }) })!
    expect(m).toMatch(/Faturamento: R\$\s4\.800,00/)
    expect(m).toContain('4,8x')
  })
  it('destaque: campanha com mais resultados, com o custo de cada um', () => {
    const m = buildWeeklyMessage({ ...base, kind: 'conversa', current: n() })!
    expect(m).toMatch(/Destaque: a campanha "Promo Setembro" trouxe 41 conversas \(R\$\s9,76 cada\)/)
  })
  it('sem gasto e sem resultado não gera mensagem', () => {
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n({ spend: 0, results: 0, leads: 0 }) })).toBeNull()
  })
  it('termina com o convite para tirar dúvidas', () => {
    expect(buildWeeklyMessage({ ...base, kind: 'conversa', current: n() })!.endsWith('Qualquer dúvida, é só chamar! 🙌')).toBe(true)
  })
})

describe('datas da semana', () => {
  it('a chave é a segunda-feira da semana atual', () => {
    expect(weekKeyBr(Date.parse('2026-09-28T04:00:00Z'))).toBe('2026-09-28') // segunda 01h em Brasília
    expect(weekKeyBr(Date.parse('2026-09-27T20:00:00Z'))).toBe('2026-09-21') // domingo
    expect(weekKeyBr(Date.parse('2026-09-30T12:00:00Z'))).toBe('2026-09-28')
  })
  it('na segunda de manhã os últimos 7 dias são a semana anterior inteira', () => {
    expect(last7Range(Date.parse('2026-09-28T04:00:00Z'))).toEqual({ since: '2026-09-21', until: '2026-09-27' })
  })
})
