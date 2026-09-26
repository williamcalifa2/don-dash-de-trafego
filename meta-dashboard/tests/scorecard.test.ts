import { describe, expect, it } from 'vitest'
import { scoreOf, type ScoreRow } from '@/lib/scorecard'

const NOW = Date.parse('2026-09-25T12:00:00Z')
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const row = (d: number, slug: string, actor: string | null, kind = 'budget'): ScoreRow => ({ at: ago(d), client_slug: slug, actor_key: actor, kind })
const base = { manager: { email: 'ana@x.com', metaActorId: '900' }, slugs: ['a', 'b', 'c'], sinceMs: NOW - 7 * 86_400_000, nowMs: NOW, stalledDays: 3, days: 7 }

describe('placar do gestor', () => {
  it('conta só o que ele fez, por e-mail ou usuário da Meta', () => {
    const s = scoreOf({ ...base, rows: [row(1, 'a', 'meta:900'), row(2, 'b', 'ana@x.com'), row(1, 'a', 'meta:777'), row(20, 'a', 'meta:900')] })
    expect(s.made).toBe(2) // a de outra pessoa e a fora do período não entram
  })
  it('contas trabalhadas: com otimização de qualquer pessoa no período', () => {
    const s = scoreOf({ ...base, rows: [row(1, 'a', 'meta:777'), row(2, 'b', 'meta:900', 'lead')] })
    expect(s.worked).toBe(1) // b só teve ação que não é otimização
    expect(s.total).toBe(3)
  })
  it('contas paradas: sem ação há N dias ou nenhuma', () => {
    const s = scoreOf({ ...base, rows: [row(1, 'a', 'meta:777'), row(10, 'b', 'meta:777')] })
    expect(s.stalled).toBe(2) // b (10 dias) e c (nunca)
  })
  it('sincronização e login não contam como movimento', () => {
    expect(scoreOf({ ...base, rows: [row(0, 'a', 'x', 'sync'), row(0, 'b', 'x', 'access')] }).stalled).toBe(3)
  })
  it('sem e-mail nem usuário da Meta não dá para saber o que ele fez', () => {
    const s = scoreOf({ ...base, manager: { email: null, metaActorId: null }, rows: [row(1, 'a', 'meta:900')] })
    expect(s.made).toBeNull()
    expect(s.lastOwnAt).toBeNull()
  })
  it('média de otimizações por dia e última otimização dele', () => {
    const s = scoreOf({ ...base, rows: [row(1, 'a', 'meta:900'), row(2, 'a', 'meta:900'), row(3, 'b', 'ana@x.com'), row(4, 'b', 'meta:900', 'lead')] })
    expect(s.made).toBe(3)
    expect(s.perDay).toBe(0.4) // 3 em 7 dias
    expect(s.lastOwnAt).toBe(ago(1)) // a ação de lead não é otimização
  })
})
