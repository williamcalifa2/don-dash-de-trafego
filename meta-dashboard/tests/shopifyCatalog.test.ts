import { describe, expect, it } from 'vitest'
import { hasShopifyCreds, matchProduct, normTitle, parseProducts, shopifyHost, type CatalogProduct } from '@/lib/shopifyCatalog'

describe('shopifyHost', () => {
  it('aceita loja, domínio e URL colada', () => {
    expect(shopifyHost('minha-loja')).toBe('minha-loja.myshopify.com')
    expect(shopifyHost('Minha-Loja.myshopify.com')).toBe('minha-loja.myshopify.com')
    expect(shopifyHost('https://minha-loja.myshopify.com/admin/products')).toBe('minha-loja.myshopify.com')
  })
  it('rejeita domínio de outro site (evita mandar o token para fora)', () => {
    expect(shopifyHost('evil.com')).toBeNull()
    expect(shopifyHost('loja.myshopify.com.evil.com')).toBeNull()
    expect(shopifyHost('')).toBeNull()
    expect(shopifyHost(undefined)).toBeNull()
  })
})

describe('hasShopifyCreds', () => {
  it('precisa de domínio e token, ou de domínio, ID e segredo', () => {
    expect(hasShopifyCreds({ domain: 'a', token: 'shpat_x' })).toBe(true)
    expect(hasShopifyCreds({ domain: 'a', clientId: 'i', clientSecret: 's' })).toBe(true)
    expect(hasShopifyCreds({ domain: 'a', clientId: 'i' })).toBe(false)
    expect(hasShopifyCreds({ token: 'shpat_x' })).toBe(false)
  })
})

describe('parseProducts e matchProduct', () => {
  const products = parseProducts({ products: [
    { id: 1, title: 'Kit Sérum Facial', handle: 'kit-serum', image: { src: 'https://cdn/x.jpg' } },
    { id: 2, title: 'Espuma', handle: 'espuma', image: null, images: [{ src: 'https://cdn/e.jpg' }] },
    { id: 3, title: 'Sem foto', handle: 'sem-foto' },
    { title: '' },
  ] }, 'https://loja.com.br')

  it('monta foto e link reais, ignora item sem título', () => {
    expect(products).toHaveLength(3)
    expect(products[0]).toEqual({ id: '1', title: 'Kit Sérum Facial', handle: 'kit-serum', image: 'https://cdn/x.jpg', url: 'https://loja.com.br/products/kit-serum' })
    expect(products[1].image).toBe('https://cdn/e.jpg')
    expect(products[2].image).toBeNull()
  })
  it('resposta inválida vira lista vazia', () => {
    expect(parseProducts(null, null)).toEqual([])
    expect(parseProducts({ products: 'x' }, null)).toEqual([])
    expect(parseProducts({ products: [{ title: 'A', handle: 'a' }] }, null)[0].url).toBeNull()
  })
  it('casa ignorando acento, caixa e variante no fim do nome', () => {
    const find = (n: string): CatalogProduct | null => matchProduct(products, n)
    expect(find('KIT SERUM FACIAL')?.id).toBe('1')
    expect(find('Kit Sérum Facial - 30ml')?.id).toBe('1')
    expect(find('Espuma')?.id).toBe('2')
  })
  it('não casa produto diferente nem nome vazio', () => {
    expect(matchProduct(products, 'Hidratante')).toBeNull()
    expect(matchProduct(products, '')).toBeNull()
  })
  it('normTitle tira acento e espaços repetidos', () => {
    expect(normTitle('  Sérum   Vitamina  C ')).toBe('serum vitamina c')
  })
})

import { canLoadCatalog, publicStoreUrl } from '@/lib/shopifyCatalog'

describe('publicStoreUrl', () => {
  it('normaliza domínio e URL colada', () => {
    expect(publicStoreUrl('meumagtag.com.br')).toBe('https://meumagtag.com.br')
    expect(publicStoreUrl('https://www.MagTag.com.br/products/x?y=1')).toBe('https://www.magtag.com.br')
  })
  it('rejeita o que poderia apontar para rede interna ou não é loja', () => {
    for (const bad of ['', 'localhost', 'http://loja.com.br', 'https://127.0.0.1', '10.0.0.5', 'https://loja.com.br:8443', 'semponto', 'javascript:alert(1)']) expect(publicStoreUrl(bad)).toBeNull()
  })
})

describe('canLoadCatalog', () => {
  it('vale endereço público ou credenciais do app', () => {
    expect(canLoadCatalog({ storeUrl: 'meumagtag.com.br' })).toBe(true)
    expect(canLoadCatalog({ domain: 'a', token: 't' })).toBe(true)
    expect(canLoadCatalog({})).toBe(false)
  })
})
