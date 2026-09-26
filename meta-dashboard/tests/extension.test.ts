import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/team', () => ({ getMember: async (e: string) => (e === 'ana@x.com' ? { email: e } : null) }))
vi.mock('@/lib/activityLog', () => ({ loadRegistry: async () => ({ managers: [{ email: 'bia@x.com' }], byClient: new Map() }) }))
vi.mock('@/lib/admin', () => ({ ownerEmail: () => 'dono@x.com' }))

process.env.DASHBOARD_SESSION_SECRET = 'segredo-de-teste'
const { actFromUrl, extToken, normalizeVisit, verifyExtToken } = await import('@/lib/extension')

describe('conta na URL do Gerenciador', () => {
  it('lê act= das telas de campanhas', () => {
    expect(actFromUrl('https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=246003248879852&business_id=1')).toBe('246003248879852')
    expect(actFromUrl('https://business.facebook.com/adsmanager/manage/adsets?act=1234567&nav_entry_point=x')).toBe('1234567')
  })
  it('lê a conta na tela de cobrança', () => {
    expect(actFromUrl('https://business.facebook.com/latest/billing_hub/accounts/?payment_account_id=246003248879852&asset_id=246003248879852')).toBe('246003248879852')
  })
  it('ignora outros sites, http e URL sem conta', () => {
    expect(actFromUrl('https://evil.com/?act=246003248879852')).toBeNull()
    expect(actFromUrl('http://business.facebook.com/adsmanager?act=246003248879852')).toBeNull()
    expect(actFromUrl('https://business.facebook.com/latest/home')).toBeNull()
    expect(actFromUrl('não é url')).toBeNull()
  })
})

describe('token da extensão', () => {
  it('vale para membro, gestor e dono', async () => {
    expect(await verifyExtToken(extToken('ana@x.com'))).toBe('ana@x.com')
    expect(await verifyExtToken(extToken('BIA@x.com'))).toBe('bia@x.com')
    expect(await verifyExtToken(extToken('dono@x.com'))).toBe('dono@x.com')
  })
  it('recusa quem saiu da equipe, assinatura errada e lixo', async () => {
    expect(await verifyExtToken(extToken('fora@x.com'))).toBeNull()
    const t = extToken('ana@x.com')
    expect(await verifyExtToken(`${t.split('.')[0]}.${'0'.repeat(40)}`)).toBeNull()
    expect(await verifyExtToken(`${Buffer.from('bia@x.com').toString('base64url')}.${t.split('.')[1]}`)).toBeNull() // assinatura de outra pessoa
    expect(await verifyExtToken('lixo')).toBeNull()
    expect(await verifyExtToken(null)).toBeNull()
  })
})

describe('aviso de visita', () => {
  it('aceita e limita os segundos', () => {
    expect(normalizeVisit({ visit: 'abcdef123456', act: '246003248879852', sec: 30 })).toEqual({ visit: 'abcdef123456', act: '246003248879852', sec: 30 })
    expect(normalizeVisit({ visit: 'abcdef123456', act: '246003248879852', sec: 9999 })?.sec).toBe(120)
    expect(normalizeVisit({ visit: 'abcdef123456', act: '246003248879852', sec: -5 })?.sec).toBe(0)
  })
  it('recusa dados inválidos', () => {
    expect(normalizeVisit({ visit: 'x', act: '246003248879852', sec: 1 })).toBeNull()
    expect(normalizeVisit({ visit: 'abcdef123456', act: 'abc', sec: 1 })).toBeNull()
    expect(normalizeVisit(null)).toBeNull()
  })
})
