import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const identity = vi.fn()
const registry = vi.fn()
const member = vi.fn()
vi.mock('@/lib/admin', () => ({ requestIdentity: (...a: unknown[]) => identity(...a) }))
vi.mock('@/lib/team', () => ({ getMember: (...a: unknown[]) => member(...a) }))
vi.mock('@/lib/activityLog', () => ({ loadRegistry: (...a: unknown[]) => registry(...a) }))

import { canSee, requireClientScope, scopeFor } from '@/lib/scope'

const req = (cookie?: string) => new NextRequest('http://localhost/api/x', { headers: cookie ? { cookie } : {} })
const REG = {
  managers: [
    { id: 'ana', name: 'Ana', email: 'ana@x.com', metaActorId: null, avatarUrl: null, metaActorName: null, createdAt: '' },
    { id: 'will', name: 'Will', email: 'will@x.com', metaActorId: null, avatarUrl: null, metaActorName: null, createdAt: '' },
  ],
  byClient: new Map([['magtag', 'ana'], ['becker', 'ana'], ['klein', 'will']]),
}

beforeEach(() => { identity.mockReset(); registry.mockReset(); member.mockReset(); registry.mockResolvedValue(REG) })

describe('scopeFor', () => {
  it('gestor (membro) com e-mail ligado vê só a carteira e não alterna', async () => {
    identity.mockResolvedValue({ role: 'member', email: 'ana@x.com' })
    const s = await scopeFor(req())
    expect([...s.slugs!].sort()).toEqual(['becker', 'magtag'])
    expect(s).toMatchObject({ restricted: true, canToggle: false, mode: 'mine' })
    expect(canSee(s, 'magtag')).toBe(true)
    expect(canSee(s, 'klein')).toBe(false)
  })
  it('gestor sem clientes vê nenhum (nunca todos por engano)', async () => {
    registry.mockResolvedValue({ ...REG, byClient: new Map() })
    identity.mockResolvedValue({ role: 'member', email: 'ana@x.com' })
    const s = await scopeFor(req())
    expect(s.slugs?.size).toBe(0)
    expect(canSee(s, 'magtag')).toBe(false)
  })
  it('membro sem gestor cadastrado continua vendo todos', async () => {
    identity.mockResolvedValue({ role: 'member', email: 'novo@x.com' })
    const s = await scopeFor(req())
    expect(s.slugs).toBeNull()
    expect(canSee(s, 'qualquer')).toBe(true)
  })
  it('dono que é gestor começa na própria carteira e pode alternar para todos, sem perder o poder', async () => {
    identity.mockResolvedValue({ role: 'owner', email: 'will@x.com' })
    const mine = await scopeFor(req())
    expect([...mine.slugs!]).toEqual(['klein'])
    expect(mine).toMatchObject({ restricted: false, canToggle: true, mode: 'mine' })
    const all = await scopeFor(req('dash_scope=all'))
    expect(all.slugs).toBeNull()
    expect(all).toMatchObject({ canToggle: true, mode: 'all' })
  })
  it('administrador sem gestor vê todos e não alterna; sem sessão de administração não se aplica', async () => {
    identity.mockResolvedValue({ role: 'admin', email: 'chefe@x.com' })
    expect(await scopeFor(req())).toMatchObject({ slugs: null, canToggle: false })
    identity.mockResolvedValue(null)
    expect((await scopeFor(req())).slugs).toBeNull()
  })
  it('sem tabelas dos gestores (SQL não rodou): todos veem tudo, nada trava', async () => {
    registry.mockResolvedValue(null)
    identity.mockResolvedValue({ role: 'member', email: 'ana@x.com' })
    expect((await scopeFor(req())).slugs).toBeNull()
  })
})

describe('nível Orgânico', () => {
  it('vê só os clientes atribuídos a ele, sem alternar, mesmo que seja também um e-mail de gestor', async () => {
    identity.mockResolvedValue({ role: 'organic', email: 'social@x.com' })
    member.mockResolvedValue({ email: 'social@x.com', role: 'organic', clients: ['magtag', 'klein'] })
    const s = await scopeFor(req())
    expect([...s.slugs!].sort()).toEqual(['klein', 'magtag'])
    expect(s).toMatchObject({ restricted: true, canToggle: false, manager: null })
    expect(canSee(s, 'becker')).toBe(false)
  })
  it('sem clientes atribuídos não vê nenhum (nunca todos)', async () => {
    identity.mockResolvedValue({ role: 'organic', email: 'social@x.com' })
    member.mockResolvedValue({ email: 'social@x.com', role: 'organic', clients: [] })
    expect((await scopeFor(req())).slugs?.size).toBe(0)
    member.mockResolvedValue(null)
    expect((await scopeFor(req())).slugs?.size).toBe(0)
  })
})

describe('requireClientScope', () => {
  it('barra o gestor no cliente de outro; deixa o dono e o cliente da própria carteira', async () => {
    identity.mockResolvedValue({ role: 'member', email: 'ana@x.com' })
    expect((await requireClientScope(req(), 'klein'))?.status).toBe(403)
    expect(await requireClientScope(req(), 'magtag')).toBeNull()
    identity.mockResolvedValue({ role: 'owner', email: 'will@x.com' })
    expect(await requireClientScope(req(), 'magtag')).toBeNull() // dono tem poder sobre todos, mesmo vendo só os dele
  })
})
