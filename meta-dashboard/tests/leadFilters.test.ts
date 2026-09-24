import { describe, expect, it } from 'vitest'
import { activeCount, applyFilters, dddOf, EMPTY_FILTERS, facets, leadOrigin, periodRange } from '@/lib/leadFilters'
import type { Lead } from '@/lib/leadTypes'

const NOW = Date.UTC(2026, 8, 23, 15, 0, 0) // 23/09/2026 12:00 no Brasil
let n = 0
const lead = (o: Partial<Lead> = {}): Lead => ({ id: String(++n), client_id: 'c', date: '2026-09-23', nome: 'X', telefone: '+5527992949880', email: null, status: 'Novo', valor_pedido: null, ad_name: 'Ad 1', campanha: 'Camp A', conjunto: 'Conj 1', notas: null, motivo_perda: null, ultimo_contato: null, created_at: '2026-09-23T13:00:00Z', meta_lead_id: 'm1', ...o })

describe('DDD', () => {
  it('lê o DDD de vários formatos', () => {
    expect(dddOf('+5527992949880')).toBe('27'); expect(dddOf('27992949880')).toBe('27'); expect(dddOf('(42) 99115-2411')).toBe('42'); expect(dddOf('5542991152411')).toBe('42')
    expect(dddOf('5527')).toBeNull(); expect(dddOf(null)).toBeNull(); expect(dddOf('')).toBeNull()
  })
})

describe('filtros de leads', () => {
  const leads = [
    lead({ status: 'Novo', campanha: 'Camp A', telefone: '+5527992949880', date: '2026-09-23' }),
    lead({ status: 'Perdido', campanha: 'Camp B', telefone: '+5542991152411', date: '2026-09-10', atendido_por: 'Ana' }),
    lead({ status: 'Convertido', campanha: 'Camp A', telefone: '(11) 98888-7777', date: '2026-08-30', meta_lead_id: null }),
    lead({ status: 'Novo', campanha: null, telefone: null, date: '2026-09-20', manual: true }),
  ]
  const ids = (f: Partial<typeof EMPTY_FILTERS>) => applyFilters(leads, { ...EMPTY_FILTERS, ...f }, NOW).map(l => leads.indexOf(l))

  it('sem filtro devolve tudo; activeCount conta os grupos escolhidos', () => {
    expect(ids({})).toEqual([0, 1, 2, 3]); expect(activeCount(EMPTY_FILTERS)).toBe(0)
    expect(activeCount({ ...EMPTY_FILTERS, status: ['Novo', 'Perdido'], campanhas: ['Camp A'], period: '7d' })).toBe(4)
  })
  it('dentro de um grupo vale "qualquer um"; entre grupos vale "todos"', () => {
    expect(ids({ status: ['Novo', 'Perdido'] })).toEqual([0, 1, 3])
    expect(ids({ status: ['Novo', 'Perdido'], campanhas: ['Camp A'] })).toEqual([0])
    expect(ids({ campanhas: ['Camp A', 'Camp B'] })).toEqual([0, 1, 2])
  })
  it('DDD e atendente', () => {
    expect(ids({ ddds: ['42'] })).toEqual([1]); expect(ids({ ddds: ['27', '11'] })).toEqual([0, 2]); expect(ids({ atendentes: ['Ana'] })).toEqual([1])
  })
  it('origem: formulário da Meta x cadastrado à mão', () => {
    expect(ids({ origem: ['meta'] })).toEqual([0, 1]); expect(ids({ origem: ['manual'] })).toEqual([2, 3]); expect(leadOrigin(leads[3])).toBe('manual')
  })
  it('período: hoje, 7 dias, este mês e personalizado (datas inclusivas, dia do Brasil)', () => {
    expect(ids({ period: 'today' })).toEqual([0])
    expect(ids({ period: '7d' })).toEqual([0, 3])          // 17 a 23/09
    expect(ids({ period: 'month' })).toEqual([0, 1, 3])
    expect(ids({ period: 'custom', from: '2026-08-30', to: '2026-09-10' })).toEqual([1, 2])
    expect(ids({ period: 'custom', from: '2026-09-11' })).toEqual([0, 3]); expect(ids({ period: 'custom', to: '2026-08-31' })).toEqual([2])
    expect(periodRange({ period: '30d', from: '', to: '' }, NOW)).toEqual({ from: '2026-08-25', to: '2026-09-23' })
  })
  it('"sem contato": só novos, sem contato, com mais de 2 h e menos de 72 h', () => {
    const stale = lead({ status: 'Novo', ultimo_contato: null, created_at: new Date(NOW - 5 * 3_600_000).toISOString() })
    const fresh = lead({ status: 'Novo', created_at: new Date(NOW - 10 * 60_000).toISOString() })
    expect(applyFilters([stale, fresh], { ...EMPTY_FILTERS, stale: true }, NOW)).toEqual([stale])
  })
  it('opções de cada filtro vêm de todos os leads, ordenadas por quantidade; DDD em ordem', () => {
    const f = facets(leads)
    expect(f.campanhas).toEqual([{ value: 'Camp A', count: 2 }, { value: 'Camp B', count: 1 }])
    expect(f.ddds.map(d => d.value)).toEqual(['11', '27', '42']); expect(f.atendentes).toEqual([{ value: 'Ana', count: 1 }])
  })
})
