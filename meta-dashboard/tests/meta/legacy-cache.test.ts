import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLegacyCooldown, invalidateLegacyCache, legacyGet } from '@/lib/meta/legacy'
import { resetMetaConfigForTests } from '@/lib/meta/config'
import { json } from './helpers'

vi.mock('@/lib/meta/instance', async () => {
  const { createMetaClient } = await import('@/lib/meta/client')
  return { meta: createMetaClient(), limits: () => { throw new Error('sem banco nos testes') } }
})

const P = 'act_1234567/insights?fields=spend&date_preset=last_7d'
beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'TOKEN_LEGADO_123456'
  process.env.META_DRY_RUN = 'true'
  delete process.env.META_LEGACY_CACHE_SEC
  resetMetaConfigForTests(); __resetLegacyCooldown()
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.META_ACCESS_TOKEN; delete process.env.META_DRY_RUN; delete process.env.META_LEGACY_CACHE_SEC; resetMetaConfigForTests() })

describe('várias telas abertas ao mesmo tempo (caminho ao vivo)', () => {
  it('a mesma consulta feita várias vezes vira uma chamada só', async () => {
    const f = vi.fn(async () => json({ data: [{ spend: '10' }] }))
    vi.stubGlobal('fetch', f)
    const opts = { clientId: 'c1', accountId: 'act_1234567', purpose: 'painel:metricas' }
    for (let i = 0; i < 5; i++) expect((await legacyGet(P, opts)).ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('pedidos simultâneos idênticos compartilham a mesma resposta em andamento', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(r => { release = r })
    const f = vi.fn(async () => { await gate; return json({ data: [] }) })
    vi.stubGlobal('fetch', f)
    const opts = { clientId: 'c1', accountId: 'act_1234567', purpose: 'painel:metricas' }
    const all = Promise.all(Array.from({ length: 8 }, () => legacyGet(P, opts)))
    await new Promise(r => setTimeout(r, 10))
    release()
    const rs = await all
    expect(rs.every(r => r.ok)).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('clientes e contas diferentes não se misturam', async () => {
    const f = vi.fn(async () => json({ data: [] }))
    vi.stubGlobal('fetch', f)
    await legacyGet(P, { clientId: 'c1', accountId: 'act_1234567', purpose: 'painel:metricas' })
    await legacyGet(P, { clientId: 'c2', accountId: 'act_1234567', purpose: 'painel:metricas' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('erro não fica guardado: a próxima tentativa vai à Meta de novo', async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ error: { message: 'x', code: 100 } }, { status: 400 })).mockResolvedValue(json({ data: [] }))
    vi.stubGlobal('fetch', f)
    const opts = { clientId: 'c1', accountId: 'act_1234567', purpose: 'painel:metricas' }
    expect((await legacyGet(P, opts)).ok).toBe(false)
    expect((await legacyGet(P, opts)).ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('leads e webhooks nunca usam o cache', async () => {
    const f = vi.fn(async () => json({ data: [] }))
    vi.stubGlobal('fetch', f)
    const path = 'act_1234567/insights?fields=spend'
    await legacyGet(path, { clientId: 'c1', purpose: 'leads' })
    await legacyGet(path, { clientId: 'c1', purpose: 'leads' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('"Atualizar" descarta só o cache do cliente que pediu', async () => {
    const f = vi.fn(async () => json({ data: [] }))
    vi.stubGlobal('fetch', f)
    const a = { clientId: 'c1', accountId: 'act_1234567', purpose: 'painel:metricas' }
    const b = { clientId: 'c2', accountId: 'act_1234567', purpose: 'painel:metricas' }
    await legacyGet(P, a); await legacyGet(P, b)
    expect(invalidateLegacyCache('c1')).toBe(1)
    await legacyGet(P, a); await legacyGet(P, b)
    expect(f).toHaveBeenCalledTimes(3) // c1 buscou de novo; c2 ficou no cache
  })

  it('META_LEGACY_CACHE_SEC=0 desliga o cache', async () => {
    process.env.META_LEGACY_CACHE_SEC = '0'; resetMetaConfigForTests()
    const f = vi.fn(async () => json({ data: [] }))
    vi.stubGlobal('fetch', f)
    const opts = { clientId: 'c1', accountId: 'act_1234567', purpose: 'painel:metricas' }
    await legacyGet(P, opts); await legacyGet(P, opts)
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('token colado com espaço ou quebra de linha no Vercel', () => {
  it('é aparado antes de ir no cabeçalho', async () => {
    process.env.META_ACCESS_TOKEN = 'TOKEN_LEGADO_123456\n  '
    resetMetaConfigForTests(); __resetLegacyCooldown()
    const f = vi.fn(async () => json({ data: [] }))
    vi.stubGlobal('fetch', f)
    expect((await legacyGet('act_1234567/insights?fields=spend&date_preset=last_7d', { clientId: 'cX', accountId: 'act_1234567', purpose: 'painel:metricas' })).ok).toBe(true)
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN_LEGADO_123456')
  })
})
