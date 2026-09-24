import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()
vi.mock('@/lib/supabase', () => ({
  serviceKeyStatus: () => 'service',
  getSupabaseServer: () => ({
    from: () => ({
      select: () => ({ eq: (_c: string, k: string) => ({ maybeSingle: async () => ({ data: store.has(k) ? { value: store.get(k) } : null, error: null }) }) }),
      upsert: async (row: { key: string; value: unknown }) => { store.set(row.key, row.value); return { error: null } },
    }),
  }),
}))

import { __resetAccessMemo, accessHash, accessSessionValid, addAccess, hasEmails, listAccess, removeAccess, verifyAccess, MAX_FAILS, LOCK_MIN } from '@/lib/clientAccess'

beforeEach(() => { store.clear(); __resetAccessMemo(); process.env.DASHBOARD_SESSION_SECRET = 'segredo-de-teste-bem-longo-123' })

describe('acesso do cliente por e-mail e token', () => {
  it('cadastra o e-mail, gera token no formato da equipe e guarda só o hash', async () => {
    expect(await hasEmails('fontana')).toBe(false)
    const r = await addAccess('fontana', ' Maria@Fontana.com.br ')
    if ('error' in r) throw new Error(r.error)
    expect(r.token).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(r.entry.email).toBe('maria@fontana.com.br')
    expect(JSON.stringify([...store.values()])).not.toContain(r.token)
    expect(await hasEmails('fontana')).toBe(true)
    expect((await listAccess('fontana')).map(e => e.email)).toEqual(['maria@fontana.com.br'])
  })

  it('e-mail inválido e limite de e-mails por cliente', async () => {
    expect(await addAccess('c', 'sem-arroba')).toEqual({ error: 'Digite um e-mail válido.' })
    for (let i = 0; i < 10; i++) expect('error' in (await addAccess('c', `p${i}@x.com`))).toBe(false)
    expect('error' in (await addAccess('c', 'p11@x.com'))).toBe(true)
    expect('error' in (await addAccess('c', 'p3@x.com'))).toBe(false) // gerar outro token para quem já existe não conta
  })

  it('entra com e-mail e token (maiúsculas, espaços e hífens não importam); token de outro cliente ou e-mail não vale', async () => {
    const r = await addAccess('fontana', 'maria@fontana.com.br'); if ('error' in r) throw new Error(r.error)
    const ok = await verifyAccess('fontana', 'MARIA@fontana.com.br', ` ${r.token.toLowerCase().replace(/-/g, ' ')} `)
    expect(ok).toMatchObject({ ok: true, email: 'maria@fontana.com.br' })
    expect(await verifyAccess('cange', 'maria@fontana.com.br', r.token)).toEqual({ ok: false, reason: 'invalid' }) // outro cliente
    expect(await verifyAccess('fontana', 'outra@fontana.com.br', r.token)).toEqual({ ok: false, reason: 'invalid' }) // e-mail não cadastrado
    expect(accessHash('fontana', 'maria@fontana.com.br', r.token)).not.toBe(accessHash('cange', 'maria@fontana.com.br', r.token))
  })

  it('erros seguidos bloqueiam aquele e-mail por alguns minutos; acertar zera a conta', async () => {
    const r = await addAccess('fontana', 'maria@fontana.com.br'); if ('error' in r) throw new Error(r.error)
    const t0 = Date.now()
    for (let i = 0; i < MAX_FAILS - 1; i++) expect(await verifyAccess('fontana', 'maria@fontana.com.br', 'ERRADO-0000-0000', t0)).toEqual({ ok: false, reason: 'invalid' })
    expect(await verifyAccess('fontana', 'maria@fontana.com.br', r.token, t0)).toMatchObject({ ok: true }) // acertou antes de estourar: zera
    for (let i = 0; i < MAX_FAILS - 1; i++) await verifyAccess('fontana', 'maria@fontana.com.br', 'ERRADO-0000-0000', t0)
    expect(await verifyAccess('fontana', 'maria@fontana.com.br', 'ERRADO-0000-0000', t0)).toEqual({ ok: false, reason: 'locked', minutes: LOCK_MIN })
    expect(await verifyAccess('fontana', 'maria@fontana.com.br', r.token, t0 + 60_000)).toMatchObject({ ok: false, reason: 'locked' }) // nem o token certo entra bloqueado
    expect(await verifyAccess('fontana', 'maria@fontana.com.br', r.token, t0 + (LOCK_MIN + 1) * 60_000)).toMatchObject({ ok: true })
  })

  it('a sessão vale enquanto o e-mail e o token forem os mesmos: novo token ou remoção derrubam', async () => {
    const r = await addAccess('fontana', 'maria@fontana.com.br'); if ('error' in r) throw new Error(r.error)
    const login = await verifyAccess('fontana', 'maria@fontana.com.br', r.token); if (!login.ok) throw new Error('login')
    const prefix = login.hash.slice(0, 16)
    expect(await accessSessionValid('fontana', 'maria@fontana.com.br', prefix)).toBe(true)
    expect(await accessSessionValid('fontana', 'maria@fontana.com.br', 'abc')).toBe(false) // prefixo curto demais
    expect(await accessSessionValid('cange', 'maria@fontana.com.br', prefix)).toBe(false)
    const r2 = await addAccess('fontana', 'maria@fontana.com.br'); if ('error' in r2) throw new Error(r2.error) // novo token
    __resetAccessMemo()
    expect(await accessSessionValid('fontana', 'maria@fontana.com.br', prefix)).toBe(false)
    expect((await verifyAccess('fontana', 'maria@fontana.com.br', r.token)).ok).toBe(false) // o token antigo não vale
    expect((await verifyAccess('fontana', 'maria@fontana.com.br', r2.token)).ok).toBe(true)
    expect(await removeAccess('fontana', 'maria@fontana.com.br')).toBeNull()
    expect(await removeAccess('fontana', 'maria@fontana.com.br')).toBe('E-mail não encontrado.')
    expect(await hasEmails('fontana')).toBe(false) // volta ao código antigo se sobrar nenhum e-mail
  })
})
