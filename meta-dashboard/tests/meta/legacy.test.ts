import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLegacyCooldown, legacyGet, legacyPaged, metaCooldownMinutes } from '@/lib/meta/legacy'
import { resetMetaConfigForTests } from '@/lib/meta/config'
import { json } from './helpers'

// O cliente do processo aqui não usa banco: só a rede simulada de cada teste.
vi.mock('@/lib/meta/instance', async () => {
  const { createMetaClient } = await import('@/lib/meta/client')
  return { meta: createMetaClient(), limits: () => { throw new Error('sem banco nos testes') } }
})

const OK = { data: [{ id: '1' }], paging: { cursors: { after: 'C1' }, next: 'https://graph.facebook.com/next?access_token=SEGREDO' } }

beforeEach(() => {
  process.env.META_ACCESS_TOKEN = 'TOKEN_LEGADO_123456'
  process.env.META_DRY_RUN = 'true' // o caminho legacy não é bloqueado por DRY_RUN
  process.env.META_LEGACY_CACHE_SEC = '0' // estes testes contam chamadas; o cache tem arquivo próprio
  resetMetaConfigForTests(); __resetLegacyCooldown()
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.META_ACCESS_TOKEN; delete process.env.META_DRY_RUN; delete process.env.META_LEGACY_CACHE_SEC; resetMetaConfigForTests() })

describe('adaptador legacy', () => {
  it('chama pelo cliente central com token no cabeçalho', async () => {
    const f = vi.fn(async () => json({ ok: 1 }))
    vi.stubGlobal('fetch', f)
    const r = await legacyGet('act_1234567?fields=name,currency')
    expect(r.ok).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('TOKEN_LEGADO')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN_LEGADO_123456')
  })

  it('política violada vira falha, sem rede', async () => {
    const f = vi.fn(async () => json({}))
    vi.stubGlobal('fetch', f)
    const r = await legacyGet('123456789/subscribed_apps')
    expect(r.ok).toBe(false)
    expect(r.blocked).toContain('policy')
    expect(f).not.toHaveBeenCalled()
  })

  it('erro de limite abre resfriamento e impede novas chamadas', async () => {
    const f = vi.fn(async () => json({ error: { code: 17, message: 'User request limit reached' } }, { status: 400 }))
    vi.stubGlobal('fetch', f)
    const a = await legacyGet('act_1234567?fields=name')
    expect(a.error?.kind).toBe('rate_limit')
    expect(metaCooldownMinutes()).toBeGreaterThan(0)
    const b = await legacyGet('act_1234567?fields=currency')
    expect(b.blocked).toBe('cooldown')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('paginação usa o cursor after (e não o link next com token) e respeita o teto de páginas', async () => {
    process.env.META_MAX_PAGES_PER_JOB = '3'
    resetMetaConfigForTests()
    const f = vi.fn(async (_u: string) => json(OK))
    vi.stubGlobal('fetch', f)
    const r = await legacyPaged('act_1234567/insights?level=ad&fields=spend&limit=100')
    delete process.env.META_MAX_PAGES_PER_JOB
    expect(r.ok).toBe(true)
    expect(r.truncated).toBe(true)
    expect(f).toHaveBeenCalledTimes(3)
    expect(String(f.mock.calls[1][0])).toContain('after=C1')
    expect(r.rows).toHaveLength(3)
  })

  it('para quando não há próxima página', async () => {
    const f = vi.fn(async () => json({ data: [{ id: '1' }], paging: { cursors: { after: 'X' } } }))
    vi.stubGlobal('fetch', f)
    const r = await legacyPaged('act_1234567/insights?level=ad&fields=spend&limit=100')
    expect(r.truncated).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
