import { beforeEach, describe, expect, it, vi } from 'vitest'

let stored: unknown = null
vi.mock('@/lib/supabase', () => ({
  getSupabaseServer: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored === null ? null : { value: stored }, error: null }) }) }),
      upsert: async (row: { value: unknown }) => { stored = row.value; return { error: null } },
    }),
  }),
}))
const legacyGet = vi.fn()
vi.mock('@/lib/meta/legacy', () => ({ legacyGet: (...a: unknown[]) => legacyGet(...a) }))

import { fetchAccounts, readAccountsCache, refreshAccountsIfStale } from '@/lib/metaAccountsList'

const ok = (data: unknown[]) => ({ ok: true, data: { data }, status: 200, attempts: 1 })
const blocked = { ok: false, data: {}, status: 0, attempts: 0, blocked: 'kill_switch', error: { kind: 'client', status: 0, message: 'Chamada bloqueada: kill_switch' } }

beforeEach(() => { stored = null; legacyGet.mockReset(); process.env.META_ACCESS_TOKEN = 'tok' })

describe('lista de contas do cadastro de cliente', () => {
  it('guarda a lista quando a Meta responde', async () => {
    legacyGet.mockImplementation(async (p: string) => p.startsWith('me/adaccounts') ? ok([{ account_id: '1', name: 'Conta 1', currency: 'BRL', account_status: '1' }]) : ok([{ id: '9', name: 'Página' }]))
    const r = await fetchAccounts('legacy')
    expect(r.cache?.accounts).toEqual([{ id: 'act_1', name: 'Conta 1', currency: 'BRL', status: 1 }])
    expect((await readAccountsCache())?.pages).toEqual([{ id: '9', name: 'Página' }])
  })

  it('com o kill switch ativo não perde a lista salva e devolve o motivo', async () => {
    stored = { at: 1, accounts: [{ id: 'act_7', name: 'Antiga' }], pages: [] }
    legacyGet.mockResolvedValue(blocked)
    const r = await fetchAccounts('legacy')
    expect(r.cache).toBeNull(); expect(r.error).toMatch(/kill_switch/)
    expect((await readAccountsCache())?.accounts[0].id).toBe('act_7') // a lista guardada continua lá
  })

  it('o ciclo do cron só renova a lista guardada a cada 12 h', async () => {
    stored = { at: Date.now() - 3600_000, accounts: [{ id: 'act_7', name: 'x' }], pages: [] }
    await refreshAccountsIfStale('legacy'); expect(legacyGet).not.toHaveBeenCalled()
    stored = { at: Date.now() - 13 * 3600_000, accounts: [{ id: 'act_7', name: 'x' }], pages: [] }
    legacyGet.mockResolvedValue(ok([{ account_id: '2', name: 'Nova', currency: 'BRL', account_status: '1' }]))
    await refreshAccountsIfStale('legacy'); expect(legacyGet).toHaveBeenCalled()
    expect((await readAccountsCache())?.accounts[0].id).toBe('act_2')
  })
})
