import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/adminOverview'
import type { DailyRow } from '@/lib/adminResults'

const NOW = Date.UTC(2026, 8, 21, 15)
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)
const conv = (v: number) => [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(v) }]
const form = (v: number) => [{ action_type: 'onsite_conversion.lead_grouped', value: String(v) }]
const series = (from: number, to: number, mk: (i: number) => Partial<DailyRow>): DailyRow[] =>
  Array.from({ length: from - to + 1 }, (_, i) => ({ date_start: day(from - i), ...mk(i) }))

describe('visão geral do admin: soma de todos os clientes', () => {
  it('soma investimento, resultados (formulário + conversas), cliques e impressões por dia', () => {
    const a = series(7, 1, () => ({ spend: '10', impressions: '1000', clicks: '20', actions: conv(2) }))
    const b = series(7, 1, () => ({ spend: '30', impressions: '3000', clicks: '60', actions: form(3) }))
    const o = aggregate([a, b], 2, NOW, 7)
    expect(o.dates).toHaveLength(7)
    expect(o.spend.every(v => v === 40)).toBe(true)
    expect(o.results.every(v => v === 5)).toBe(true)
    expect(o.totals).toEqual({ spend: 280, impressions: 28000, clicks: 560, results: 35 })
    expect(o.clientsWithData).toBe(2); expect(o.clientsTotal).toBe(2)
  })

  it('compara com o período anterior equivalente quando o histórico cobre', () => {
    const rows = [...series(14, 8, () => ({ spend: '10', impressions: '100', clicks: '1', actions: conv(1) })), ...series(7, 1, () => ({ spend: '20', impressions: '100', clicks: '1', actions: conv(2) }))]
    const o = aggregate([rows], 1, NOW, 7)
    expect(o.totals.spend).toBe(140); expect(o.prev).toEqual({ spend: 70, impressions: 700, clicks: 7, results: 7 })
    expect(o.partial).toBe(false)
  })

  it('sem histórico anterior: sem comparação; e avisa quando o período pedido é maior que o histórico', () => {
    const rows = series(14, 1, () => ({ spend: '10', actions: conv(1) }))
    const o30 = aggregate([rows], 1, NOW, 30)
    expect(o30.prev).toBeNull(); expect(o30.partial).toBe(true)
    const o14 = aggregate([rows], 1, NOW, 14)
    expect(o14.prev).toBeNull(); expect(o14.partial).toBe(false)
  })

  it('cliente sem dados não conta como "com dados"; nada quebra sem nenhum cliente', () => {
    const o = aggregate([null, [], series(3, 1, () => ({ spend: '5', actions: conv(1) }))], 3, NOW, 7)
    expect(o.clientsWithData).toBe(1); expect(o.clientsTotal).toBe(3)
    const empty = aggregate([], 0, NOW, 7)
    expect(empty.totals).toEqual({ spend: 0, impressions: 0, clicks: 0, results: 0 }); expect(empty.clientsWithData).toBe(0)
  })

  it('dias fora da janela (hoje, muito antigos) não entram na soma', () => {
    const rows = [{ date_start: day(0), spend: '999' }, { date_start: day(40), spend: '999' }, { date_start: day(2), spend: '10' }]
    expect(aggregate([rows], 1, NOW, 7).totals.spend).toBe(10)
  })
})
