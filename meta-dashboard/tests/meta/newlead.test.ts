import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const created: unknown[] = []
vi.mock('@/lib/tenant', () => ({ requireTenant: vi.fn(async () => ({ clientId: 'c1', slug: 'becker' })) }))
vi.mock('@/lib/supabase', async () => ({
  LOSS_REASONS: (await vi.importActual<typeof import('@/lib/leadTypes')>('@/lib/leadTypes')).LOSS_REASONS,
  getLeads: vi.fn(async () => []),
  createManualLead: vi.fn(async (_c: string, input: unknown) => { created.push(input); return { lead: { id: 'l1', ...(input as object) } } }),
}))

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/leads/route')
  return POST(new NextRequest('http://x/api/leads', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
}
beforeEach(() => { created.length = 0 })

describe('cadastro manual de lead (POST /api/leads)', () => {
  it('cria com nome e telefone, normaliza o telefone e começa como "Novo"', async () => {
    const r = await post({ nome: '  Maria   Silva ', telefone: '(51) 99999-1111', campanha: 'Indicação' })
    expect(r.status).toBe(201)
    expect(created[0]).toMatchObject({ nome: 'Maria Silva', telefone: '+5551999991111', campanha: 'Indicação', status: 'Novo', email: null, notas: null, atendido_por: null })
  })
  it('aceita só telefone ou só nome', async () => {
    expect((await post({ telefone: '+55 51 99999-1111' })).status).toBe(201)
    expect((await post({ nome: 'João' })).status).toBe(201)
  })
  it('exige pelo menos nome ou telefone', async () => {
    expect((await post({ email: 'a@b.com' })).status).toBe(400)
    expect((await post({ nome: '   ', telefone: '' })).status).toBe(400)
  })
  it('valida e-mail, telefone, status e tamanhos', async () => {
    expect((await post({ nome: 'A', email: 'sem-arroba' })).status).toBe(400)
    expect((await post({ nome: 'A', telefone: 'abc' })).status).toBe(400)
    expect((await post({ nome: 'A', status: 'Inventado' })).status).toBe(400)
    expect((await post({ nome: 'x'.repeat(121) })).status).toBe(400)
    expect((await post({ nome: 'A', notas: 'x'.repeat(2001) })).status).toBe(400)
    expect((await post({ nome: 123 })).status).toBe(400)
    expect(created).toHaveLength(0)
  })
  it('corpo inválido não quebra', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const r = await POST(new NextRequest('http://x/api/leads', { method: 'POST', body: 'lixo' }))
    expect(r.status).toBe(400)
    expect(r instanceof NextResponse).toBe(true)
  })
})

describe('ciclo completo: origem, valor e motivo', () => {
  it('grava campanha, conjunto e anúncio escolhidos', async () => {
    await post({ nome: 'A', campanha: 'Camp X', conjunto: 'Conj 1', ad_name: 'Anúncio 3' })
    expect(created[0]).toMatchObject({ campanha: 'Camp X', conjunto: 'Conj 1', ad_name: 'Anúncio 3' })
  })
  it('outra fonte digitada vai como origem, sem conjunto/anúncio', async () => {
    await post({ nome: 'A', campanha: 'Indicação do Marcos' })
    expect(created[0]).toMatchObject({ campanha: 'Indicação do Marcos', conjunto: null, ad_name: null })
  })
  it('fechou: guarda o valor do pedido (aceita vírgula e ponto de milhar)', async () => {
    await post({ nome: 'A', status: 'Convertido', valor_pedido: '1.500,50' })
    await post({ nome: 'B', status: 'Convertido', valor_pedido: 300 })
    expect(created[0]).toMatchObject({ status: 'Convertido', valor_pedido: 1500.5 })
    expect(created[1]).toMatchObject({ valor_pedido: 300 })
  })
  it('valor só entra se o lead fechou; motivo só se perdeu', async () => {
    await post({ nome: 'A', status: 'Novo', valor_pedido: 999, motivo_perda: 'Preço' })
    await post({ nome: 'B', status: 'Perdido', valor_pedido: 999, motivo_perda: 'Preço' })
    expect(created[0]).toMatchObject({ valor_pedido: null, motivo_perda: null })
    expect(created[1]).toMatchObject({ valor_pedido: null, motivo_perda: 'Preço' })
  })
  it('recusa valor negativo ou lixo e motivo fora da lista', async () => {
    expect((await post({ nome: 'A', status: 'Convertido', valor_pedido: -5 })).status).toBe(400)
    expect((await post({ nome: 'A', status: 'Convertido', valor_pedido: 'abc' })).status).toBe(400)
    expect((await post({ nome: 'A', status: 'Perdido', motivo_perda: 'Qualquer coisa' })).status).toBe(400)
    expect(created).toHaveLength(0)
  })
})
