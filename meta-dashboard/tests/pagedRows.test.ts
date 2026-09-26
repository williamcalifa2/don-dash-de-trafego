import { describe, expect, it } from 'vitest'
import { pagedAll, type RangeQuery } from '@/lib/pagedRows'

const source = (n: number, failAt?: number): (() => RangeQuery) => () => ({
  range: async (from: number, to: number) => {
    if (failAt != null && from >= failAt) return { data: null, error: { message: 'boom' } }
    const rows = Array.from({ length: Math.max(0, Math.min(n, to + 1) - from) }, (_, i) => ({ i: from + i }))
    return { data: rows, error: null }
  },
})

describe('leitura em páginas', () => {
  it('junta todas as páginas, mesmo passando do limite de 1000 por consulta', async () => {
    const r = await pagedAll(source(2500))
    expect(r.data).toHaveLength(2500)
    expect(r.error).toBeNull()
    expect(r.truncated).toBe(false)
  })
  it('para na última página cheia sem pedir a mais', async () => {
    expect((await pagedAll(source(2000))).data).toHaveLength(2000)
    expect((await pagedAll(source(0))).data).toHaveLength(0)
  })
  it('devolve o erro e o que já leu', async () => {
    const r = await pagedAll(source(5000, 2000))
    expect(r.error?.message).toBe('boom')
    expect(r.data).toHaveLength(2000)
  })
  it('respeita o teto e avisa que cortou', async () => {
    const r = await pagedAll(source(10_000), { max: 3000 })
    expect(r.data).toHaveLength(3000)
    expect(r.truncated).toBe(true)
  })
})
