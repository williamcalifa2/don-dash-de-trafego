import { describe, expect, it } from 'vitest'
import { auditManagers, type AuditInput } from '@/lib/managersAudit'

const base = (): AuditInput => ({
  clients: [
    { slug: 'a', name: 'Alfa', adAccountId: 'act_111', pageId: '1', active: true },
    { slug: 'b', name: 'Beta', adAccountId: 'act_222', pageId: '2', active: true },
  ],
  managers: [{ id: 'ana', name: 'Ana', email: 'ana@x.com', metaActorId: '900' }, { id: 'bia', name: 'Bia', email: 'bia@x.com', metaActorId: '901' }],
  carteira: [{ slug: 'a', managerId: 'ana' }, { slug: 'b', managerId: 'bia' }],
  members: [{ email: 'ana@x.com', role: 'member' }, { email: 'bia@x.com', role: 'member' }],
  log: [], syncErrors: [],
})
const ids = (i: AuditInput) => auditManagers(i).findings.map(f => f.id)

describe('conferência dos gestores', () => {
  it('cenário limpo: tudo certo', () => { expect(ids(base())).toEqual(['all-ok']) })
  it('acusa a mesma conta de anúncios em dois clientes', () => {
    const i = base(); i.clients[1].adAccountId = '111'
    expect(ids(i)).toContain('dup-account')
  })
  it('página compartilhada é só informação', () => {
    const i = base(); i.clients[1].pageId = '1'
    const r = auditManagers(i).findings
    expect(r.find(f => f.id === 'shared-page')?.severity).toBe('info')
    expect(r.some(f => f.severity === 'error')).toBe(false)
  })
  it('acusa e-mail e usuário da Meta repetidos entre gestores', () => {
    const i = base(); i.managers[1].email = 'ANA@x.com'; i.managers[1].metaActorId = '900'
    expect(ids(i)).toEqual(expect.arrayContaining(['dup-email', 'dup-actor']))
  })
  it('carteira com cliente ou gestor inexistente', () => {
    const i = base(); i.carteira.push({ slug: 'zz', managerId: 'ana' }, { slug: 'a', managerId: 'fantasma' })
    expect(ids(i)).toEqual(expect.arrayContaining(['orphan-client', 'orphan-manager']))
  })
  it('membro sem gestor enxerga tudo; gestor sem e-mail e sem usuário da Meta', () => {
    const i = base(); i.members.push({ email: 'joao@x.com', role: 'reader' }); i.managers[0].email = null; i.managers[0].metaActorId = null
    expect(ids(i)).toEqual(expect.arrayContaining(['see-all', 'no-email', 'no-actor']))
  })
  it('cliente ativo sem gestor; pausado não conta', () => {
    const i = base(); i.carteira = [{ slug: 'a', managerId: 'ana' }]
    expect(ids(i)).toContain('no-manager')
    i.clients[1].active = false
    expect(ids(i)).not.toContain('no-manager')
  })
  it('histórico: linhas sem gestor são corrigíveis; troca de gestor é só informação', () => {
    const i = base()
    i.log = [{ slug: 'a', managerId: null, actorKey: 'meta:900', actorName: 'Ana', source: 'meta', n: 7 }, { slug: 'b', managerId: 'ana', actorKey: 'meta:900', actorName: 'Ana', source: 'meta', n: 3 }]
    const r = auditManagers(i)
    expect(r.fixableRows).toBe(7)
    expect(r.findings.find(f => f.id === 'log-moved')?.severity).toBe('info')
  })
  it('detecta gestor mexendo na conta de outro e autor desconhecido', () => {
    const i = base()
    i.log = [{ slug: 'b', managerId: 'bia', actorKey: 'meta:900', actorName: 'Ana', source: 'meta', n: 4 }, { slug: 'a', managerId: 'ana', actorKey: 'meta:777', actorName: 'Chefe', source: 'meta', n: 2 }]
    const r = auditManagers(i).findings
    expect(r.find(f => f.id === 'cross')?.items?.[0]).toContain('Ana em conta de Bia')
    expect(r.find(f => f.id === 'strangers')?.items?.[0]).toContain('Chefe')
  })
})
