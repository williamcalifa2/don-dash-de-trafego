import { beforeEach, describe, expect, it, vi } from 'vitest'

let stored: unknown = null
vi.mock('@/lib/supabase', () => ({
  serviceKeyStatus: () => 'service',
  getSupabaseServer: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored === null ? null : { value: stored }, error: null }) }) }),
      upsert: async (row: { value: unknown }) => { stored = row.value; return { error: null } },
    }),
  }),
}))

import { NextRequest } from 'next/server'
import { adminSessionForCredentials, denyReader, isAdminSession, isOwnerSession, requireRole, roleAtLeast, sessionRole } from '@/lib/admin'
import { readSession, SESSION_COOKIE, signSession } from '@/lib/auth'
import { __resetTeamMemo, addMember, generateMemberToken, listMembers, normalizeToken, regenerateToken, removeMember, setMemberRole } from '@/lib/team'

const OWNER = 'dono@agencia.com'
const sessionOf = async (cookie: string | null) => (cookie ? readSession(cookie) : null)

beforeEach(() => {
  stored = null; __resetTeamMemo()
  process.env.DASHBOARD_SESSION_SECRET = 'segredo-de-teste-bem-longo-123'
  process.env.ADMIN_EMAIL = OWNER
  process.env.ADMIN_PASSWORD = 'senha-do-dono-bem-longa'
})

describe('equipe da agência', () => {
  it('o token tem o formato XXXX-XXXX-XXXX sem caracteres confusos', () => {
    for (let i = 0; i < 50; i++) expect(generateMemberToken()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    expect(normalizeToken(' k7qm-2xnp 9tdw ')).toBe('K7QM2XNP9TDW')
  })

  it('colega entra com o e-mail cadastrado e o token; só o hash fica no banco', async () => {
    const r = await addMember('Colega@Agencia.com ', OWNER)
    if ('error' in r) throw new Error(r.error)
    expect(JSON.stringify(stored)).not.toContain(r.token)
    const cookie = await adminSessionForCredentials('colega@agencia.com', r.token)
    const s = await sessionOf(cookie)
    expect(s?.m).toBe('colega@agencia.com')
    expect(await isAdminSession(s)).toBe(true)
    expect(isOwnerSession(s)).toBe(false)
  })

  it('aceita o token em minúsculas e sem hífens', async () => {
    const r = await addMember('a@b.com', OWNER); if ('error' in r) throw new Error(r.error)
    expect(await adminSessionForCredentials('a@b.com', r.token.toLowerCase().replace(/-/g, ''))).not.toBeNull()
  })

  it('e-mail fora da lista, token errado ou token de outra pessoa não entram', async () => {
    const a = await addMember('a@b.com', OWNER); if ('error' in a) throw new Error(a.error)
    const b = await addMember('c@d.com', OWNER); if ('error' in b) throw new Error(b.error)
    expect(await adminSessionForCredentials('a@b.com', 'AAAA-BBBB-CCCC')).toBeNull()
    expect(await adminSessionForCredentials('a@b.com', b.token)).toBeNull()
    expect(await adminSessionForCredentials('estranho@x.com', a.token)).toBeNull()
  })

  it('o administrador principal continua entrando com a senha do Vercel e gerencia a equipe', async () => {
    const s = await sessionOf(await adminSessionForCredentials(OWNER, 'senha-do-dono-bem-longa'))
    expect(await isAdminSession(s)).toBe(true)
    expect(isOwnerSession(s)).toBe(true)
  })

  it('gerar novo token derruba a sessão e o token antigos', async () => {
    const r = await addMember('a@b.com', OWNER); if ('error' in r) throw new Error(r.error)
    const s = await sessionOf(await adminSessionForCredentials('a@b.com', r.token))
    const n = await regenerateToken('a@b.com'); if ('error' in n) throw new Error(n.error)
    __resetTeamMemo()
    expect(await isAdminSession(s)).toBe(false)
    expect(await adminSessionForCredentials('a@b.com', r.token)).toBeNull()
    expect(await adminSessionForCredentials('a@b.com', n.token)).not.toBeNull()
  })

  it('remover da equipe derruba a sessão na hora', async () => {
    const r = await addMember('a@b.com', OWNER); if ('error' in r) throw new Error(r.error)
    const s = await sessionOf(await adminSessionForCredentials('a@b.com', r.token))
    expect(await removeMember('a@b.com')).toBeNull()
    expect(await isAdminSession(s)).toBe(false)
    expect(await listMembers()).toEqual([])
  })

  it('recusa e-mail inválido, repetido e o do administrador principal', async () => {
    expect('error' in await addMember('nao-e-email', OWNER)).toBe(true)
    expect('error' in await addMember(OWNER.toUpperCase(), OWNER)).toBe(true)
    await addMember('a@b.com', OWNER)
    expect('error' in await addMember('A@B.com', OWNER)).toBe(true)
  })

  it('a lista pública não traz o hash do token', async () => {
    await addMember('a@b.com', OWNER)
    const l = await listMembers()
    expect(l?.[0]).toEqual({ email: 'a@b.com', createdAt: expect.any(String), lastLoginAt: null, role: 'member' })
  })
})


describe('níveis de acesso da equipe (administrador, membro, leitor)', () => {
  const login = async (email: string, token: string) => (await adminSessionForCredentials(email, token))!
  const reqWith = (cookie?: string) => new NextRequest('http://localhost/api/x', { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} })
  const add = async (email: string, role: 'admin' | 'member' | 'reader') => { const r = await addMember(email, OWNER, role); if ('error' in r) throw new Error(r.error); return r.token }

  it('convite grava o nível; sem nível informado é "membro"; convite antigo (sem nível) também vale membro', async () => {
    await add('a@x.com', 'reader')
    const r = await addMember('b@x.com', OWNER); if ('error' in r) throw new Error(r.error)
    expect((await listMembers())?.map(m => [m.email, m.role])).toEqual([['a@x.com', 'reader'], ['b@x.com', 'member']])
    stored = { members: [{ email: 'velho@x.com', hash: 'h', createdAt: 'x' }] }; __resetTeamMemo()
    expect((await listMembers())?.[0].role).toBe('member')
  })

  it('cada nível enxerga o que pode: dono > administrador > membro > leitor', async () => {
    const tR = await add('leitor@x.com', 'reader'), tM = await add('membro@x.com', 'member'), tA = await add('adm@x.com', 'admin')
    const owner = await login(OWNER, 'senha-do-dono-bem-longa')
    expect(await sessionRole(await readSession(owner))).toBe('owner')
    expect(await sessionRole(await readSession(await login('leitor@x.com', tR)))).toBe('reader')
    expect(await sessionRole(await readSession(await login('membro@x.com', tM)))).toBe('member')
    expect(await sessionRole(await readSession(await login('adm@x.com', tA)))).toBe('admin')
    expect(roleAtLeast('member', 'reader')).toBe(true); expect(roleAtLeast('reader', 'member')).toBe(false); expect(roleAtLeast(null, 'reader')).toBe(false)
  })

  it('rotas: leitor só vê; membro opera; administrador gerencia; sem sessão é 401', async () => {
    const tR = await add('leitor@x.com', 'reader'), tM = await add('membro@x.com', 'member'), tA = await add('adm@x.com', 'admin')
    const c = { r: await login('leitor@x.com', tR), m: await login('membro@x.com', tM), a: await login('adm@x.com', tA), o: await login(OWNER, 'senha-do-dono-bem-longa') }
    expect((await requireRole(reqWith(), 'reader'))?.status).toBe(401)
    expect(await requireRole(reqWith(c.r), 'reader')).toBeNull()
    expect((await requireRole(reqWith(c.r), 'member'))?.status).toBe(403)
    expect(await requireRole(reqWith(c.m), 'member')).toBeNull()
    expect((await requireRole(reqWith(c.m), 'admin'))?.status).toBe(403)
    expect(await requireRole(reqWith(c.a), 'admin')).toBeNull()
    expect((await requireRole(reqWith(c.a), 'owner'))?.status).toBe(403)
    expect(await requireRole(reqWith(c.o), 'owner')).toBeNull()
  })

  it('mudar o nível vale na hora para a sessão aberta; o leitor não escreve no painel do cliente', async () => {
    const t = await add('p@x.com', 'member')
    const cookie = await login('p@x.com', t)
    expect(await denyReader(reqWith(cookie))).toBeNull()
    expect(await setMemberRole('p@x.com', 'reader')).toBeNull()
    expect(await sessionRole(await readSession(cookie))).toBe('reader')
    expect((await denyReader(reqWith(cookie)))?.status).toBe(403)
    // sessão de cliente nunca é barrada por isso
    expect(await denyReader(reqWith(await signSession({ s: 'cliente', h: 'abcdef123456' })))).toBeNull()
  })
})
