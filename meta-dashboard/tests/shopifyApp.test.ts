import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installUrl, makeState, readState, shopifyWebhookAuthorized, verifyOAuthQuery } from '@/lib/shopifyApp'

const sign = (body: string, secret: string) => crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')

describe('state da instalação', () => {
  it('volta o cliente certo e expira', () => {
    const st = makeState('magtag', 1000)
    expect(readState(st, 2000)).toBe('magtag')
    expect(readState(st, 1000 + 31 * 60_000)).toBeNull()
  })
  it('rejeita adulterado, vazio e de outra assinatura', () => {
    const st = makeState('magtag')
    const [body] = st.split('.')
    expect(readState(`${body}.abc`)).toBeNull()
    expect(readState(`${Buffer.from(JSON.stringify({ s: 'outro', e: Date.now() + 9e6 })).toString('base64url')}.${st.split('.')[1]}`)).toBeNull()
    expect(readState('')).toBeNull()
    expect(readState(null)).toBeNull()
  })
})

describe('verifyOAuthQuery', () => {
  const secret = 'segredo'
  const build = (o: Record<string, string>) => {
    const msg = Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&')
    return new URLSearchParams({ ...o, hmac: crypto.createHmac('sha256', secret).update(msg).digest('hex') })
  }
  it('aceita a assinatura da Shopify, em qualquer ordem de parâmetros', () => {
    expect(verifyOAuthQuery(build({ shop: 'a.myshopify.com', code: 'abc', state: 'x', timestamp: '1' }), secret)).toBe(true)
  })
  it('rejeita parâmetro alterado, segredo errado e sem hmac', () => {
    const q = build({ shop: 'a.myshopify.com', code: 'abc', timestamp: '1' })
    q.set('shop', 'b.myshopify.com')
    expect(verifyOAuthQuery(q, secret)).toBe(false)
    expect(verifyOAuthQuery(build({ shop: 'a.myshopify.com' }), 'outro')).toBe(false)
    expect(verifyOAuthQuery(new URLSearchParams({ shop: 'a.myshopify.com' }), secret)).toBe(false)
  })
})

describe('installUrl', () => {
  beforeEach(() => { process.env.SHOPIFY_APP_CLIENT_ID = 'cid'; process.env.SHOPIFY_APP_CLIENT_SECRET = 'sec' })
  afterEach(() => { delete process.env.SHOPIFY_APP_CLIENT_ID; delete process.env.SHOPIFY_APP_CLIENT_SECRET })
  it('monta o link com escopos, retorno e estado', () => {
    const u = new URL(installUrl('Loja', 'magtag', 'https://dashboard.dondigital.com.br') as string)
    expect(u.host).toBe('loja.myshopify.com')
    expect(u.pathname).toBe('/admin/oauth/authorize')
    expect(u.searchParams.get('client_id')).toBe('cid')
    expect(u.searchParams.get('scope')).toContain('read_products')
    expect(u.searchParams.get('redirect_uri')).toBe('https://dashboard.dondigital.com.br/api/shopify/callback')
    expect(readState(u.searchParams.get('state'))).toBe('magtag')
  })
  it('sem app configurado ou com loja inválida, não gera link', () => {
    expect(installUrl('evil.com', 'x', 'https://a.b')).toBeNull()
    delete process.env.SHOPIFY_APP_CLIENT_ID
    expect(installUrl('loja', 'x', 'https://a.b')).toBeNull()
  })
})

describe('shopifyWebhookAuthorized', () => {
  const raw = '{"id":1}'
  it('aceita a chave manual do cliente', () => {
    expect(shopifyWebhookAuthorized({ raw, signature: sign(raw, 'store'), shopHeader: null, storeSecret: 'store' })).toBe(true)
  })
  it('aceita o segredo do app só se a loja for a conectada', () => {
    const base = { raw, signature: sign(raw, 'app'), appSecret: 'app', connectedShop: 'loja.myshopify.com' }
    expect(shopifyWebhookAuthorized({ ...base, shopHeader: 'loja.myshopify.com' })).toBe(true)
    expect(shopifyWebhookAuthorized({ ...base, shopHeader: 'outra.myshopify.com' })).toBe(false)
    expect(shopifyWebhookAuthorized({ ...base, shopHeader: null })).toBe(false)
  })
  it('rejeita sem assinatura, assinatura errada e cliente sem nada cadastrado', () => {
    expect(shopifyWebhookAuthorized({ raw, signature: null, shopHeader: null, storeSecret: 'store' })).toBe(false)
    expect(shopifyWebhookAuthorized({ raw, signature: sign(raw, 'x'), shopHeader: null, storeSecret: 'store' })).toBe(false)
    expect(shopifyWebhookAuthorized({ raw, signature: sign(raw, 'app'), shopHeader: 'loja.myshopify.com', appSecret: 'app' })).toBe(false)
  })
})
