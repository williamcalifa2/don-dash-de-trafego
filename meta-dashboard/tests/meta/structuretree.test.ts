import { describe, expect, it } from 'vitest'
import { buildTree } from '@/lib/structureTree'

describe('árvore campanha > conjunto > anúncio (origem do lead manual)', () => {
  const campaigns = [
    { id: 'c2', name: 'Zeta pausada', effective_status: 'PAUSED' },
    { id: 'c1', name: 'Beta ativa', effective_status: 'ACTIVE' },
    { id: 'c3', name: 'Alfa ativa', effective_status: 'ACTIVE' },
    { id: 'c9' }, // sem nome: ignorada
  ]
  const adsets = [
    { id: 's2', name: 'Conj pausado', campaign_id: 'c1', effective_status: 'PAUSED' },
    { id: 's1', name: 'Conj ativo', campaign_id: 'c1', effective_status: 'ACTIVE' },
    { id: 's3', name: 'Órfão', campaign_id: 'inexistente', effective_status: 'ACTIVE' },
  ]
  const ads = [
    { id: 'a2', name: 'Anúncio B', adset_id: 's1' }, { id: 'a1', name: 'Anúncio A', adset_id: 's1' }, { id: 'a3', name: 'Sem conjunto' },
  ]
  const tree = buildTree(campaigns, adsets, ads)

  it('lista TODAS as campanhas: ativas primeiro, depois por nome', () => {
    expect(tree.map(c => c.name)).toEqual(['Alfa ativa', 'Beta ativa', 'Zeta pausada'])
  })
  it('aninha conjuntos (ativos primeiro) e anúncios (por nome) com os nomes exatos da Meta', () => {
    const beta = tree.find(c => c.id === 'c1')!
    expect(beta.adsets.map(s => s.name)).toEqual(['Conj ativo', 'Conj pausado'])
    expect(beta.adsets[0].ads.map(a => a.name)).toEqual(['Anúncio A', 'Anúncio B'])
    expect(beta.adsets[1].ads).toEqual([])
  })
  it('itens soltos ou sem nome não quebram nem aparecem no lugar errado', () => {
    expect(tree.some(c => c.id === 'c9')).toBe(false)
    expect(tree.flatMap(c => c.adsets).some(s => s.name === 'Órfão')).toBe(false)
    expect(buildTree([], [], [])).toEqual([])
  })
})
