import { describe, expect, it } from 'vitest'
import { extractUtm, mapShopifyCheckout, mapShopifyOrder } from '@/lib/shopifyOrders'

describe('extractUtm', () => {
  it('lê UTMs de URL completa e de caminho', () => {
    expect(extractUtm('https://loja.com/?utm_source=facebook&utm_campaign=Escala')).toEqual({ utm_source: 'facebook', utm_campaign: 'Escala', utm_medium: undefined })
    expect(extractUtm('/products/x?utm_medium=paid')).toMatchObject({ utm_medium: 'paid' })
  })
  it('vazio ou inválido devolve objeto vazio', () => {
    expect(extractUtm(null)).toEqual({})
    expect(extractUtm('')).toEqual({})
  })
})

describe('mapShopifyOrder', () => {
  const payload = {
    id: 123, name: '#1004', financial_status: 'paid', processed_at: '2026-09-20T10:00:00Z', created_at: '2026-09-20T09:59:00Z',
    current_total_price: '164.80', current_subtotal_price: '160.00', currency: 'BRL',
    customer: { first_name: 'Ana', last_name: 'Silva', email: 'a@a.com', phone: '+5511999999999' },
    landing_site: '/?utm_source=facebook&utm_campaign=Escala%20Feed', referring_site: '',
    line_items: [{ title: 'Kit', quantity: 2, price: '79.90', sku: 'K1' }],
  }
  it('traduz pedido pago com cliente, itens e UTMs', () => {
    const o = mapShopifyOrder('c1', payload)
    expect(o).toMatchObject({ client_id: 'c1', platform: 'shopify', external_id: '123', order_number: '#1004', status: 'paid', total: 164.8, subtotal: 160, customer_name: 'Ana Silva', customer_email: 'a@a.com', utm_source: 'facebook', utm_campaign: 'Escala Feed', paid_at: '2026-09-20T10:00:00Z' })
    expect(o.items).toEqual([{ name: 'Kit', quantity: 2, price: 79.9, sku: 'K1' }])
  })
  it('pedido reembolsado parcial fica pago com o valor líquido', () => {
    const o = mapShopifyOrder('c1', { ...payload, financial_status: 'partially_refunded', current_total_price: '84.90' })
    expect(o.status).toBe('paid')
    expect(o.total).toBe(84.9)
  })
  it('pedido cancelado não tem data de pagamento; UTM cai em note_attributes', () => {
    const o = mapShopifyOrder('c1', { ...payload, cancelled_at: '2026-09-21T00:00:00Z', landing_site: '', note_attributes: [{ name: 'utm_source', value: 'instagram' }] })
    expect(o.status).toBe('cancelled')
    expect(o.paid_at).toBeNull()
    expect(o.utm_source).toBe('instagram')
  })
  it('sem cliente nem itens não quebra', () => {
    const o = mapShopifyOrder('c1', { id: 9, financial_status: 'pending', total_price: '10.00' })
    expect(o).toMatchObject({ status: 'pending', total: 10, customer_name: null, items: [] })
  })
})

describe('mapShopifyCheckout', () => {
  it('traduz carrinho com contato e link de recuperação', () => {
    const c = mapShopifyCheckout('c1', { id: 5, token: 't', email: 'x@x.com', total_price: '50.00', abandoned_checkout_url: 'https://loja/recover', line_items: [{ title: 'Kit', quantity: 1, price: '50.00' }], completed_at: null })
    expect(c).toMatchObject({ client_id: 'c1', external_id: '5', customer_email: 'x@x.com', total: 50, recover_url: 'https://loja/recover', completed_at: null })
    expect(c.items).toEqual([{ name: 'Kit', quantity: 1, price: 50 }])
  })
})
