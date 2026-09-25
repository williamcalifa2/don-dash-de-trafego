import { describe, expect, it } from 'vitest'
import { buildStalled, countByManager, type StalledInput } from '@/lib/stalled'

const NOW = Date.parse('2026-09-25T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const base = (): StalledInput => ({
  managers: [{ id: 'ana', name: 'Ana', email: 'ana@x.com', avatarUrl: null }, { id: 'bia', name: 'Bia', email: null, avatarUrl: null }],
  byClient: new Map([['a', 'ana'], ['b', 'ana'], ['c', 'bia'], ['d', 'ana']]),
  lastAction: new Map([['a', ago(1)], ['b', ago(6)], ['c', ago(10)]]),
  lastAccess: new Map([['ana@x.com|a', ago(0)], ['ana@x.com|b', ago(2)], ['ana@x.com|d', ago(20)]]),
  names: new Map([['a', 'Alfa'], ['b', 'Beta'], ['c', 'Gama'], ['d', 'Delta']]),
  paused: new Set(),
  now: NOW,
})

describe('contas sem movimento', () => {
  it('sem ação: lista quem passou do limite, da mais parada para a menos', () => {
    const r = buildStalled(base(), 3, 'action')
    expect(r.map(x => x.slug)).toEqual(['d', 'c', 'b']) // d nunca teve ação
    expect(r.find(x => x.slug === 'b')!.daysAction).toBe(6)
  })
  it('sem abrir: só conta quando o gestor tem e-mail ligado', () => {
    const r = buildStalled(base(), 3, 'access')
    expect(r.map(x => x.slug)).toEqual(['d'])
    expect(r[0].daysAccess).toBe(20)
  })
  it('ambos: só entra se ficou sem ação E sem abrir', () => {
    const r = buildStalled(base(), 3, 'any')
    // b teve acesso há 2 dias (abriu), então não entra; c (gestora sem e-mail) e d entram
    expect(r.map(x => x.slug).sort()).toEqual(['c', 'd'])
    expect(r.find(x => x.slug === 'c')!.accessUnknown).toBe(true)
  })
  it('cliente pausado e cliente sem gestor ficam de fora', () => {
    const i = base(); i.paused = new Set(['d']); i.byClient.set('e', 'ninguem')
    expect(buildStalled(i, 3, 'action').map(x => x.slug)).toEqual(['c', 'b'])
  })
  it('limite maior tira as menos paradas', () => {
    expect(buildStalled(base(), 7, 'action').map(x => x.slug)).toEqual(['d', 'c'])
  })
  it('conta os alertas por gestor', () => {
    const c = countByManager(buildStalled(base(), 3, 'action'))
    expect(c.get('ana')).toBe(2)
    expect(c.get('bia')).toBe(1)
  })
})
