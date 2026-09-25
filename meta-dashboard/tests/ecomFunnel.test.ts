import { describe, expect, it } from 'vitest'
import { buildFunnel, conversionRate, distinct } from '@/lib/ecomFunnel'
import { buildStates, buildTrending, type EventRow } from '@/lib/storeTrack'

describe('buildFunnel', () => {
  it('com pixel: taxa de cada etapa sobre a anterior e barra proporcional à maior', () => {
    const s = buildFunnel({ sessions: 1000, carts: 100, checkouts: 50, orders: 25, paid: 20 }, true)
    expect(s.map(x => x.value)).toEqual([1000, 100, 50, 25, 20])
    expect(s.map(x => x.rate)).toEqual([null, 10, 50, 50, 80])
    expect(s[0].bar).toBe(100)
    expect(s[4].bar).toBe(2)
  })
  it('sem pixel: visitas, carrinho e checkout ficam vazios, sem inventar estimativa', () => {
    const s = buildFunnel({ sessions: 0, carts: 0, checkouts: 0, orders: 8, paid: 6 }, false)
    expect(s.slice(0, 3).map(x => x.value)).toEqual([null, null, null])
    expect(s[3].value).toBe(8)
    expect(s[3].rate).toBeNull()
    expect(s[4].rate).toBe(75)
  })
  it('taxa nunca passa de 100% (pedido pode vir de fora do pixel)', () => {
    const s = buildFunnel({ sessions: 10, carts: 2, checkouts: 1, orders: 5, paid: 5 }, true)
    expect(s[3].rate).toBe(100)
  })
  it('tudo zero não quebra', () => {
    const s = buildFunnel({ sessions: 0, carts: 0, checkouts: 0, orders: 0, paid: 0 }, true)
    expect(s.every(x => x.rate === null && x.bar === 0)).toBe(true)
  })
})

describe('conversionRate e distinct', () => {
  it('pagos ÷ visitas, com duas casas; sem visitas dá nulo', () => {
    expect(conversionRate(17, 1240)).toBe(1.37)
    expect(conversionRate(5, 0)).toBeNull()
  })
  it('conta visitantes distintos e ignora vazio', () => {
    expect(distinct(['a', 'b', 'a', null, undefined, ''])).toBe(2)
  })
})

const NOW = Date.parse('2026-09-24T15:00:00Z')
const ev = (id: number, sid: string, type: string, secAgo: number, product: string | null, o: Partial<EventRow> = {}): EventRow => ({ id, sid, type, city: null, region: 'SP', country: 'BR', lat: null, lng: null, product, value: null, source: null, created_at: new Date(NOW - secAgo * 1000).toISOString(), ...o })

describe('buildStates', () => {
  it('agrupa por estado, calcula percentual e mostra quem está online e as compras', () => {
    const today = [{ region: 'SP', country: 'BR' }, { region: 'SP', country: 'BR' }, { region: 'PR', country: 'BR' }, { region: 'SP', country: 'BR' }]
    const r = buildStates(today, [{ region: 'SP', country: 'BR' }], [{ region: 'PR', country: 'BR' }])
    expect(r[0]).toEqual({ uf: 'SP', name: 'São Paulo', live: 1, orders: 0, sessions: 3, percent: 75 })
    expect(r[1]).toMatchObject({ uf: 'PR', name: 'Paraná', orders: 1, percent: 25 })
  })
  it('fora do Brasil usa o país; sem dados devolve lista vazia', () => {
    expect(buildStates([{ region: '11', country: 'PT' }], [], [])[0]).toMatchObject({ uf: 'PT', name: 'PT' })
    expect(buildStates([], [], [])).toEqual([])
  })
})

describe('buildTrending', () => {
  it('conta quem vê e quem tem no carrinho (últimos 10 min) e as vendas do dia', () => {
    const events = [
      ev(1, 'a', 'product', 60, 'Kit'), ev(2, 'b', 'cart', 120, 'Kit'), ev(3, 'c', 'checkout', 200, 'Kit'),
      ev(4, 'd', 'purchase', 3000, 'Kit'), ev(5, 'e', 'product', 4000, 'Kit'),
    ]
    expect(buildTrending(events, NOW)).toEqual([{ name: 'Kit', viewing: 1, inCart: 2, salesToday: 1 }])
  })
  it('quem já comprou não conta como carrinho aberto', () => {
    const events = [ev(1, 'a', 'cart', 300, 'Kit'), ev(2, 'a', 'purchase', 100, 'Kit')]
    expect(buildTrending(events, NOW)[0]).toMatchObject({ inCart: 0, salesToday: 1 })
  })
  it('sem movimento ou sem nome de produto não aparece', () => {
    expect(buildTrending([ev(1, 'a', 'product', 5000, 'Velho'), ev(2, 'b', 'cart', 10, null)], NOW)).toEqual([])
  })
})

import { presetRangeBr } from '@/lib/ecomFunnel'

describe('presetRangeBr (horário do Brasil)', () => {
  const NOW_BR = Date.parse('2026-09-24T15:00:00Z') // 12:00 em Brasília
  it('hoje começa à meia-noite do Brasil (03:00 UTC)', () => {
    expect(presetRangeBr('today', NOW_BR)).toEqual({ since: '2026-09-24T03:00:00.000Z', until: null })
  })
  it('7, 14 e 30 dias incluem hoje', () => {
    expect(presetRangeBr('last_7d', NOW_BR).since).toBe('2026-09-18T03:00:00.000Z')
    expect(presetRangeBr('last_14d', NOW_BR).since).toBe('2026-09-11T03:00:00.000Z')
    expect(presetRangeBr('last_30d', NOW_BR).since).toBe('2026-08-26T03:00:00.000Z')
  })
  it('este mês vai do dia 1 até agora; mês passado é a janela fechada', () => {
    expect(presetRangeBr('this_month', NOW_BR)).toEqual({ since: '2026-09-01T03:00:00.000Z', until: null })
    expect(presetRangeBr('last_month', NOW_BR)).toEqual({ since: '2026-08-01T03:00:00.000Z', until: '2026-09-01T03:00:00.000Z' })
    expect(presetRangeBr('month_2', NOW_BR)).toEqual({ since: '2026-07-01T03:00:00.000Z', until: '2026-08-01T03:00:00.000Z' })
  })
  it('depois da meia-noite UTC mas antes da do Brasil ainda é o dia anterior', () => {
    expect(presetRangeBr('today', Date.parse('2026-09-24T01:00:00Z')).since).toBe('2026-09-23T03:00:00.000Z')
  })
  it('virada de ano no mês passado', () => {
    expect(presetRangeBr('last_month', Date.parse('2026-01-10T12:00:00Z'))).toEqual({ since: '2025-12-01T03:00:00.000Z', until: '2026-01-01T03:00:00.000Z' })
  })
  it('período desconhecido cai em 30 dias', () => {
    expect(presetRangeBr('xyz', NOW_BR).since).toBe('2026-08-26T03:00:00.000Z')
    expect(presetRangeBr(null, NOW_BR).until).toBeNull()
  })
})
