import { describe, expect, it } from 'vitest'
import { applyRefund, orderStatusFromShopify, refundAmount, refundIdsOf, summarizeCheckouts, type CheckoutRow } from '@/lib/integrations'

describe('orderStatusFromShopify', () => {
  it('mapeia os estados financeiros da Shopify', () => {
    expect(orderStatusFromShopify({ financial_status: 'paid' })).toBe('paid')
    expect(orderStatusFromShopify({ financial_status: 'pending' })).toBe('pending')
    expect(orderStatusFromShopify({ financial_status: 'authorized' })).toBe('pending')
    expect(orderStatusFromShopify({ financial_status: 'refunded' })).toBe('refunded')
    expect(orderStatusFromShopify({ financial_status: 'voided' })).toBe('cancelled')
    expect(orderStatusFromShopify({ financial_status: 'paid', cancelled_at: '2026-09-01' })).toBe('cancelled')
  })
  it('reembolso parcial continua pago (valor líquido vem em current_total_price)', () => {
    expect(orderStatusFromShopify({ financial_status: 'partially_refunded' })).toBe('paid')
  })
})

describe('refundAmount', () => {
  it('soma só transações de reembolso concluídas', () => {
    expect(refundAmount({ transactions: [{ kind: 'refund', status: 'success', amount: '50.10' }, { kind: 'refund', status: 'failure', amount: '99' }, { kind: 'sale', amount: '10' }] })).toBe(50.1)
  })
  it('sem transação, usa o subtotal dos itens devolvidos', () => {
    expect(refundAmount({ refund_line_items: [{ subtotal: '20' }, { subtotal: 5.5 }] })).toBe(25.5)
  })
  it('vazio ou inválido dá zero', () => {
    expect(refundAmount({})).toBe(0)
    expect(refundAmount({ transactions: [{ kind: 'refund', amount: 'x' }] })).toBe(0)
  })
})

describe('applyRefund', () => {
  const refund = { id: 7, transactions: [{ kind: 'refund', status: 'success', amount: '40' }] }
  it('reembolso parcial baixa o valor e mantém pago', () => {
    expect(applyRefund({ total: 100, status: 'paid', refundIds: [] }, refund)).toEqual({ skip: false, total: 60, status: 'paid', refundIds: ['7'] })
  })
  it('reembolso total vira reembolsado com valor zero', () => {
    const r = applyRefund({ total: 40, status: 'paid', refundIds: [] }, refund)
    expect(r.total).toBe(0)
    expect(r.status).toBe('refunded')
  })
  it('não conta duas vezes: reembolso já presente no pedido é ignorado', () => {
    expect(applyRefund({ total: 60, status: 'paid', refundIds: ['7'] }, refund).skip).toBe(true)
  })
  it('pedido cancelado e reembolso sem id são ignorados', () => {
    expect(applyRefund({ total: 100, status: 'cancelled', refundIds: [] }, refund).skip).toBe(true)
    expect(applyRefund({ total: 100, status: 'paid', refundIds: [] }, { transactions: [] }).skip).toBe(true)
  })
  it('nunca deixa o total negativo', () => {
    expect(applyRefund({ total: 10, status: 'paid', refundIds: [] }, refund).total).toBe(0)
  })
})

describe('refundIdsOf', () => {
  it('lê os ids do payload do pedido', () => {
    expect(refundIdsOf({ refunds: [{ id: 1 }, { id: '2' }, {}] })).toEqual(['1', '2'])
    expect(refundIdsOf(null)).toEqual([])
  })
})

describe('summarizeCheckouts', () => {
  const NOW = Date.parse('2026-09-24T15:00:00Z')
  const row = (id: string, minAgo: number, o: Partial<CheckoutRow> = {}): CheckoutRow => ({
    id, customer_name: 'Ana', customer_email: 'a@a.com', customer_phone: '11999999999', total: 100, currency: 'BRL', items: [], recover_url: null,
    utm_source: null, utm_campaign: null, created_at: new Date(NOW - minAgo * 60_000).toISOString(), updated_at: new Date(NOW - minAgo * 60_000).toISOString(), completed_at: null, ...o,
  })
  it('abandonado = sem atividade há 1 h e não concluído', () => {
    const r = summarizeCheckouts([row('a', 90), row('b', 30), row('c', 200, { completed_at: '2026-09-24T12:00:00Z' })], NOW)
    expect(r.abandonedCount).toBe(1)
    expect(r.abandonedValue).toBe(100)
    expect(r.completedCount).toBe(1)
    expect(r.totalCount).toBe(3)
    expect(r.conversionRate).toBeCloseTo(33.33, 1)
  })
  it('lista só quem tem contato, do mais recente ao mais antigo', () => {
    const r = summarizeCheckouts([row('velho', 500), row('novo', 100), row('anon', 100, { customer_email: null, customer_phone: null })], NOW)
    expect(r.abandonedCount).toBe(3)
    expect(r.contactableCount).toBe(2)
    expect(r.list.map(x => x.id)).toEqual(['novo', 'velho'])
  })
  it('sem carrinhos devolve zeros', () => {
    expect(summarizeCheckouts([], NOW)).toMatchObject({ abandonedCount: 0, abandonedValue: 0, conversionRate: 0, list: [] })
  })
})
