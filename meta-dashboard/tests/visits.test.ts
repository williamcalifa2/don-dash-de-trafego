import { describe, expect, it } from 'vitest'
import { fmtActive, summarizeVisits, type VisitRow } from '@/lib/visits'

const NOW = Date.parse('2026-09-25T12:00:00Z')
const at = (min: number) => new Date(NOW - min * 60_000).toISOString()
const v = (id: string, user: string, slug: string, start: number, last: number, sec: number): VisitRow => ({ visit_id: id, user_key: user, client_slug: slug, started_at: at(start), last_seen: at(last), active_sec: sec })

describe('acessos ao Gerenciador', () => {
  it('junta as visitas da mesma pessoa no mesmo cliente', () => {
    const r = summarizeVisits([v('1', 'a@x', 'alfa', 300, 290, 600), v('2', 'a@x', 'alfa', 60, 50, 120), v('3', 'b@x', 'alfa', 30, 20, 60)], NOW)
    const a = r.find(x => x.userKey === 'a@x')!
    expect(a.opens).toBe(2)
    expect(a.activeSec).toBe(720)
    expect(a.firstAt).toBe(at(300))
    expect(a.lastAt).toBe(at(50))
    expect(r).toHaveLength(2)
  })
  it('marca quem está com a conta aberta agora e coloca no topo', () => {
    const r = summarizeVisits([v('1', 'a@x', 'alfa', 200, 100, 60), v('2', 'b@x', 'beta', 5, 1, 30)], NOW)
    expect(r[0].userKey).toBe('b@x')
    expect(r[0].live).toBe(true)
    expect(r[1].live).toBe(false)
  })
  it('formata o tempo ativo', () => {
    expect(fmtActive(20)).toBe('menos de 1 min')
    expect(fmtActive(600)).toBe('10 min')
    expect(fmtActive(5400)).toBe('1h30')
  })
})
