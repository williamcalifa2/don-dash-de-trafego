/** Árvore campanha > conjunto > anúncio da conta, só com nomes e ids: alimenta o "de onde veio" do cadastro manual de lead. */
export interface TreeAd { id: string; name: string }
export interface TreeAdset { id: string; name: string; active: boolean; ads: TreeAd[] }
export interface TreeCampaign { id: string; name: string; active: boolean; adsets: TreeAdset[] }

interface Row { id: string; name?: string; effective_status?: string; campaign_id?: string; adset_id?: string }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')
/** Ativas primeiro, depois por nome. */
const order = <T extends { name: string; active: boolean }>(xs: T[]) => [...xs].sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b))

export function buildTree(campaigns: Row[], adsets: Row[], ads: Row[]): TreeCampaign[] {
  const adsBySet = new Map<string, TreeAd[]>()
  for (const a of ads) {
    if (!a.adset_id || !a.name) continue
    const list = adsBySet.get(a.adset_id) ?? []
    list.push({ id: a.id, name: a.name })
    adsBySet.set(a.adset_id, list)
  }
  const setsByCampaign = new Map<string, TreeAdset[]>()
  for (const s of adsets) {
    if (!s.campaign_id || !s.name) continue
    const list = setsByCampaign.get(s.campaign_id) ?? []
    list.push({ id: s.id, name: s.name, active: s.effective_status === 'ACTIVE', ads: [...(adsBySet.get(s.id) ?? [])].sort(byName) })
    setsByCampaign.set(s.campaign_id, list)
  }
  return order(campaigns.filter(c => c.name).map(c => ({
    id: c.id, name: c.name!, active: c.effective_status === 'ACTIVE',
    adsets: order(setsByCampaign.get(c.id) ?? []),
  })))
}
