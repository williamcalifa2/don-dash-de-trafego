import { describe, expect, it } from 'vitest'
import { ALL_KEYS, CARD_METRICS, cardSource, defaultChoice, MAX_CARD_METRICS, resolveChoice, type CardData, type CardPeriod } from '@/lib/adminCard'

const zero = { spend: 0, impressions: 0, clicks: 0, results: 0, formLeads: 0, siteLeads: 0, conversations: 0, custom: 0, purchases: 0, purchaseValue: 0, linkClicks: 0, landingViews: 0, crmLeads: 0, manualLeads: 0, vendas: 0, receita: 0 }
const p7: CardPeriod = { ...zero, spend: 800, impressions: 20000, clicks: 400, results: 40, formLeads: 5, siteLeads: 20, conversations: 15, custom: 0, purchases: 3, purchaseValue: 2400, linkClicks: 350, landingViews: 300, crmLeads: 12, manualLeads: 4, vendas: 2, receita: 3000 }
const base: CardData = { resultKind: 'misto', periods: { 7: p7, 14: { ...p7, spend: 1600 }, 30: { ...p7, spend: 3200 } }, leadsToday: 1, leadCount: 30, parados: 2 }
const v = (k: keyof typeof CARD_METRICS, c = base, days: 7 | 14 | 30 = 7) => CARD_METRICS[k].value(c, c.periods[days])

describe('métricas do card do cliente (admin)', () => {
  it('o padrão depende do tipo: formulário mostra o CRM; os demais mostram o resultado da Meta', () => {
    expect(defaultChoice('form').metrics).toEqual(['crmLeads', 'vendas', 'parados'])
    expect(defaultChoice(null).metrics).toEqual(['crmLeads', 'vendas', 'parados'])
    for (const k of ['site', 'conversa', 'custom', 'misto'] as const) expect(defaultChoice(k).metrics).toEqual(['results', 'cost', 'spend'])
    expect(defaultChoice('misto').days).toBe(7)
  })

  it('há um catálogo grande: todos os leads, tipos de resultado, funil de vendas e cruzamentos', () => {
    expect(ALL_KEYS.length).toBeGreaterThanOrEqual(25)
    for (const k of ['allLeads', 'crmLeads', 'manualLeads', 'leadCount', 'formLeads', 'siteLeads', 'conversations', 'custom', 'costPerSale', 'roasReal', 'ticket', 'taxaConv'] as const) expect(ALL_KEYS).toContain(k)
  })

  it('"Todos os leads" soma o que a Meta gerou com o que foi cadastrado à mão (sem contar duas vezes o formulário)', () => {
    expect(v('allLeads')).toBe('44') // 40 da Meta + 4 à mão
    expect(v('crmLeads')).toBe('12'); expect(v('manualLeads')).toBe('4'); expect(v('leadCount')).toBe('30')
  })

  it('leads no CRM não mexem nos números da Meta (o caso do Cange)', () => {
    const withMore = { ...base, periods: { ...base.periods, 7: { ...p7, crmLeads: 999, manualLeads: 999 } } }
    expect(v('results', withMore)).toBe('40'); expect(v('spend', withMore)).toMatch(/R\$\s?800/)
  })

  it('o período escolhido muda os números', () => {
    expect(v('spend', base, 7)).toMatch(/R\$\s?800/); expect(v('spend', base, 14)).toMatch(/1\.600/); expect(v('spend', base, 30)).toMatch(/3\.200/)
    expect(CARD_METRICS.results.label('conversa')).toBe('Conversas') // o período é escolhido à parte, não vai no nome
  })

  it('a escolha salva vale, na ordem; chaves inválidas somem; repetidas somem; passa do máximo, corta', () => {
    expect(resolveChoice({ metrics: ['spend', 'allLeads', 'vendas'], days: 14 }, 'form')).toEqual({ metrics: ['spend', 'allLeads', 'vendas'], days: 14 })
    expect(resolveChoice({ metrics: ['spend', 'lixo', 'spend', 42] }, 'form')).toEqual({ metrics: ['spend'], days: 7 })
    expect(resolveChoice({ metrics: ALL_KEYS }, 'form').metrics).toHaveLength(MAX_CARD_METRICS)
    expect(resolveChoice({ metrics: ['spend'], days: 99 }, 'form').days).toBe(7)
    expect(resolveChoice([], 'conversa')).toEqual(defaultChoice('conversa'))
    expect(resolveChoice('lixo', 'site')).toEqual(defaultChoice('site'))
  })

  it('escolhas antigas (lista, com nomes da primeira versão) continuam funcionando', () => {
    expect(resolveChoice(['results7', 'cost7', 'leads7'], 'form')).toEqual({ metrics: ['results', 'cost', 'crmLeads'], days: 7 })
  })

  it('formata e calcula CTR, CPM, CPC, custo por venda, ROAS real, ticket e taxa de conversão', () => {
    expect(v('ctr')).toBe('2,00%'); expect(v('cpm')).toMatch(/R\$\s?40,00/); expect(v('cpc')).toMatch(/R\$\s?2,00/)
    expect(v('cost')).toMatch(/R\$\s?20,00/); expect(v('costPerSale')).toMatch(/R\$\s?400,00/)
    expect(v('roasReal')).toBe('3,8x'); expect(v('roas')).toBe('3,0x'); expect(v('ticket')).toMatch(/R\$\s?1\.500/); expect(v('taxaConv')).toBe('16,67%'.replace('16,67', '16,7'))
    expect(v('impressions')).toBe('20.0k')
    const empty: CardData = { ...base, periods: { 7: { ...zero }, 14: { ...zero }, 30: { ...zero } } }
    expect(['ctr', 'cpm', 'cpc', 'cost', 'costPerSale', 'roasReal', 'roas', 'ticket', 'taxaConv'].map(k => v(k as keyof typeof CARD_METRICS, empty))).toEqual(Array(9).fill('—'))
  })

  it('nenhum nome de métrica leva o número de dias (o período é escolhido à parte)', () => {
    for (const k of ALL_KEYS) expect(CARD_METRICS[k].label('misto'), k).not.toMatch(/\d+ dias/)
  })

  it('o nome do resultado acompanha o tipo do cliente', () => {
    expect(CARD_METRICS.results.label('conversa')).toBe('Conversas')
    expect(CARD_METRICS.results.label('custom')).toBe('Conversões')
    expect(CARD_METRICS.cost.label('site')).toBe('CPL')
  })

  it('a fonte do rodapé e do gráfico vem do primeiro número escolhido', () => {
    expect(cardSource(['results', 'crmLeads'])).toBe('meta')
    expect(cardSource(['crmLeads', 'results'])).toBe('crm')
  })
})
