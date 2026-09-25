import { describe, expect, it } from 'vitest'
import { buildLive, geoFromHeaders, normalizeTrack, startOfDayBr, trackKey, trackKeyValid, type EventRow, type SessionRow } from '@/lib/storeTrack'
import { pixelSnippet } from '@/lib/pixelSnippet'

const NOW = Date.parse('2026-09-24T15:00:00Z')
const ago = (s: number) => new Date(NOW - s * 1000).toISOString()
const sess = (sid: string, secAgo: number, o: Partial<SessionRow> = {}): SessionRow => ({ sid, last_seen: ago(secAgo), city: 'São Paulo', region: 'SP', country: 'BR', lat: -23.5, lng: -46.6, source: 'instagram', ...o })
const ev = (id: number, sid: string, type: string, secAgo: number, o: Partial<EventRow> = {}): EventRow => ({ id, sid, type, city: 'Curitiba', region: 'PR', country: 'BR', lat: -25.4, lng: -49.2, product: null, value: null, source: 'google', created_at: ago(secAgo), ...o })

describe('trackKey', () => {
  it('é estável por loja e rejeita chave errada', () => {
    expect(trackKey('a')).toBe(trackKey('a'))
    expect(trackKey('a')).not.toBe(trackKey('b'))
    expect(trackKeyValid('a', trackKey('a'))).toBe(true)
    expect(trackKeyValid('a', trackKey('b'))).toBe(false)
    expect(trackKeyValid('a', null)).toBe(false)
  })
})

describe('normalizeTrack', () => {
  it('aceita evento válido e limpa campos', () => {
    expect(normalizeTrack({ sid: 'abc123xyz', type: 'cart', product: ' Sérum ', value: '149.905', path: '/p', source: 'ig' }))
      .toEqual({ sid: 'abc123xyz', type: 'cart', product: 'Sérum', value: 149.91, path: '/p', source: 'ig' })
  })
  it('rejeita sid ruim, tipo desconhecido e corpo vazio', () => {
    expect(normalizeTrack({ sid: 'a b', type: 'ping' })).toBeNull()
    expect(normalizeTrack({ sid: 'abc123xyz', type: 'hack' })).toBeNull()
    expect(normalizeTrack(null)).toBeNull()
  })
  it('descarta valor negativo ou não numérico', () => {
    expect(normalizeTrack({ sid: 'abc123xyz', type: 'cart', value: -5 })?.value).toBeNull()
    expect(normalizeTrack({ sid: 'abc123xyz', type: 'cart', value: 'x' })?.value).toBeNull()
  })
})

describe('geoFromHeaders', () => {
  it('decodifica cidade e lê coordenadas', () => {
    const h = new Headers({ 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country-region': 'SP', 'x-vercel-ip-country': 'BR', 'x-vercel-ip-latitude': '-23.55', 'x-vercel-ip-longitude': '-46.63' })
    expect(geoFromHeaders(h)).toEqual({ city: 'São Paulo', region: 'SP', country: 'BR', lat: -23.55, lng: -46.63 })
  })
  it('sem cabeçalhos devolve tudo nulo', () => {
    expect(geoFromHeaders(new Headers())).toEqual({ city: null, region: null, country: null, lat: null, lng: null })
  })
})

describe('startOfDayBr', () => {
  it('meia-noite do Brasil (03:00 UTC)', () => {
    expect(startOfDayBr(Date.parse('2026-09-24T15:00:00Z'))).toBe('2026-09-24T03:00:00.000Z')
    expect(startOfDayBr(Date.parse('2026-09-24T01:00:00Z'))).toBe('2026-09-23T03:00:00.000Z')
  })
})

describe('buildLive', () => {
  it('conta online só dentro de 5 min e agrupa por cidade', () => {
    const l = buildLive([sess('a', 10), sess('b', 60), sess('c', 400), sess('d', 30, { city: 'Recife', region: 'PE', lat: -8, lng: -34.8 })], [], NOW)
    expect(l.online).toBe(3)
    expect(l.cities.map(c => [c.city, c.visitors])).toEqual([['São Paulo', 2], ['Recife', 1]])
    expect(l.cities[0].channel).toBe('instagram')
  })
  it('sessão sem coordenada conta como online mas não vira ponto no globo', () => {
    const l = buildLive([sess('a', 10, { lat: null, lng: null })], [], NOW)
    expect(l.online).toBe(1)
    expect(l.cities).toHaveLength(0)
  })
  it('funil: quem comprou sai de carrinho e checkout', () => {
    const l = buildLive([sess('a', 5), sess('b', 5), sess('c', 5)], [
      ev(1, 'a', 'cart', 100), ev(2, 'b', 'cart', 90), ev(3, 'b', 'checkout', 80), ev(4, 'b', 'purchase', 30), ev(5, 'c', 'checkout', 700),
    ], NOW)
    expect(l.funnel).toEqual({ visiting: 3, cart: 1, checkout: 0, purchased: 1 })
  })
  it('feed vem do mais novo, com título, valor e estado; máximo 15', () => {
    const events = Array.from({ length: 20 }, (_, i) => ev(i, 's' + i, 'cart', i * 10 + 1))
    events.push(ev(99, 'z', 'purchase', 0, { product: 'Kit Sérum', value: 149.9 }))
    const l = buildLive([], events, NOW)
    expect(l.events).toHaveLength(15)
    expect(l.events[0]).toMatchObject({ type: 'order', title: 'Pedido Aprovado', state: 'PR', channel: 'google', value: 149.9 })
    expect(l.events[0].description).toContain('Kit Sérum')
  })
  it('sem dados devolve painel vazio, sem inventar', () => {
    expect(buildLive([], [], NOW)).toEqual({ online: 0, funnel: { visiting: 0, cart: 0, checkout: 0, purchased: 0 }, cities: [], events: [] })
  })
  it('cidade fora do Brasil usa o país como estado', () => {
    const l = buildLive([sess('a', 5, { city: 'Lisboa', region: '11', country: 'PT', lat: 38.7, lng: -9.1 })], [], NOW)
    expect(l.cities[0].state).toBe('PT')
  })
})

describe('pixelSnippet', () => {
  it('é JavaScript válido e aponta para o endpoint da loja', () => {
    const code = pixelSnippet('https://dashboard.dondigital.com.br', 'loja-x', 'abc')
    expect(code).toContain("https://dashboard.dondigital.com.br/api/track/loja-x?k=abc")
    expect(() => new Function('analytics', 'browser', 'fetch', code)).not.toThrow()
  })
})
