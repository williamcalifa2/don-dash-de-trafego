import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
  generateWebhookToken,
  verifyShopifyHmac,
  computeSla,
  safeEqual,
} from '@/lib/integrations'

describe('Webhooks & SLA Integration Utilities', () => {
  it('gera token seguro de 32 caracteres hexadecimais', () => {
    const token = generateWebhookToken()
    expect(token).toHaveLength(32)
    expect(/^[0-9a-f]{32}$/.test(token)).toBe(true)
  })

  it('valida assinatura HMAC da Shopify corretamente', () => {
    const secret = 'shpss_test_secret_12345'
    const body = JSON.stringify({ id: 123456, total_price: '199.90', financial_status: 'paid' })

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64')

    expect(verifyShopifyHmac(body, validSignature, secret)).toBe(true)
    expect(verifyShopifyHmac(body, 'invalid_sig', secret)).toBe(false)
    expect(verifyShopifyHmac(body, validSignature, 'wrong_secret')).toBe(false)
    expect(verifyShopifyHmac(body, null, secret)).toBe(false)
  })

  it('compara strings de forma segura contra timing attacks', () => {
    expect(safeEqual('token_secret_123', 'token_secret_123')).toBe(true)
    expect(safeEqual('token_secret_123', 'token_secret_456')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })

  describe('Cálculo de SLA (computeSla)', () => {
    it('detecta SLA cumprido quando lead é contatado dentro da meta', () => {
      const created = '2026-09-24T10:00:00.000Z'
      const contacted = '2026-09-24T10:10:00.000Z' // 10 minutos depois
      const sla = computeSla(created, contacted, 15) // meta de 15 minutos

      expect(sla.violado).toBe(false)
      expect(sla.tempoSegundos).toBe(600)
    })

    it('detecta SLA violado quando contato demora mais que a meta', () => {
      const created = '2026-09-24T10:00:00.000Z'
      const contacted = '2026-09-24T10:35:00.000Z' // 35 minutos depois
      const sla = computeSla(created, contacted, 30) // meta de 30 minutos

      expect(sla.violado).toBe(true)
      expect(sla.tempoSegundos).toBe(2100)
    })

    it('calcula tempo restante para leads não contatados', () => {
      const now = Date.now()
      const created = new Date(now - 5 * 60 * 1000).toISOString() // criado há 5 min
      const sla = computeSla(created, null, 15) // meta de 15 min

      expect(sla.violado).toBe(false)
      expect(sla.restanteSegundos).toBeGreaterThan(500)
      expect(sla.restanteSegundos).toBeLessThanOrEqual(600)
    })
  })
})

