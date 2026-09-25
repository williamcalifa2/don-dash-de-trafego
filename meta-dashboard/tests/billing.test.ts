import { describe, expect, it } from 'vitest'
import { amountInText, billingOf, bySeverity, minor } from '@/lib/billing'

describe('valores', () => {
  it('converte centavos em moeda', () => { expect(minor('18378')).toBe(183.78); expect(minor(undefined)).toBe(0) })
  it('lê o valor do texto em pt-BR e em inglês', () => {
    expect(amountInText('Saldo disponível (R$ 0,74)')).toBe(0.74)
    expect(amountInText('Available balance (R$0.74)')).toBe(0.74)
    expect(amountInText('Saldo disponível (R$ 1.234,50)')).toBe(1234.5)
    expect(amountInText('sem número')).toBeNull()
  })
})

describe('situação financeira', () => {
  it('conta pré-paga com saldo baixo pede atenção', () => {
    const b = billingOf({ account_status: 1, currency: 'BRL', is_prepay_account: true, funding_source_details: { type: 20, display_string: 'Saldo disponível (R$ 0,74)' } })
    expect(b.pay.kind).toBe('prepaid')
    expect(b.available).toBe(0.74)
    expect(b.owed).toBeNull()
    expect(b.severity).toBe('attention')
  })
  it('saldo zerado é crítico', () => {
    expect(billingOf({ account_status: 1, is_prepay_account: true, funding_source_details: { type: 20, display_string: 'Saldo disponível (R$ 0,00)' } }).severity).toBe('critical')
  })
  it('cartão em dia e sem limite não gera alerta e mostra o valor a pagar', () => {
    const b = billingOf({ account_status: 1, currency: 'BRL', balance: '4500', amount_spent: '100000', spend_cap: '0', funding_source_details: { type: 1, display_string: 'MasterCard ···· 3087' } })
    expect(b.severity).toBe('ok')
    expect(b.owed).toBe(45)
    expect(b.spendCap).toBeNull()
    expect(b.pay.label).toContain('3087')
  })
  it('pagamento pendente e conta desativada são críticos, com motivo', () => {
    expect(billingOf({ account_status: 3, funding_source_details: { type: 1 } }).severity).toBe('critical')
    const d = billingOf({ account_status: 2, disable_reason: 3, funding_source_details: { type: 1 } })
    expect(d.severity).toBe('critical')
    expect(d.alerts.some(a => a.text.includes('risco de pagamento'))).toBe(true)
  })
  it('limite de gastos quase no fim não alerta; esgotado é crítico', () => {
    expect(billingOf({ account_status: 1, spend_cap: '100000', amount_spent: '92000', funding_source_details: { type: 1 } }).severity).toBe('ok')
    expect(billingOf({ account_status: 1, spend_cap: '100000', amount_spent: '100000', funding_source_details: { type: 1 } }).severity).toBe('critical')
  })
  it('conta ativa sem forma de pagamento é crítica', () => {
    expect(billingOf({ account_status: 1 }).severity).toBe('critical')
  })
  it('ordena pelas que pedem ação primeiro', () => {
    const l = [{ severity: 'ok' as const, name: 'A' }, { severity: 'critical' as const, name: 'B' }, { severity: 'attention' as const, name: 'C' }]
    expect(l.sort(bySeverity).map(x => x.name)).toEqual(['B', 'C', 'A'])
  })
})
