/** Cliente duplicado: mesmo endereço, mesmo nome (sem contar acento, maiúscula e espaços) ou a mesma conta de anúncios de outro cliente. */
export interface ClientKey { slug: string; name: string; adAccountId: string | null }

export const normName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
export const normAccount = (a: string | null | undefined) => (a ? a.replace(/\D/g, '') : '')

/** Mensagem de erro se o candidato repete algo de outro cliente; null se está livre. `ignoreSlug` é o próprio cliente numa edição. */
export function duplicateOf(existing: ClientKey[], cand: { slug?: string | null; name?: string | null; adAccountId?: string | null }, ignoreSlug?: string): string | null {
  const others = existing.filter(c => c.slug !== ignoreSlug)
  if (cand.slug) { const hit = others.find(c => c.slug === cand.slug); if (hit) return `Já existe um cliente com esse endereço (${hit.name}).` }
  if (cand.name && normName(cand.name)) { const hit = others.find(c => normName(c.name) === normName(cand.name!)); if (hit) return `Já existe um cliente com esse nome: ${hit.name}.` }
  const acc = normAccount(cand.adAccountId)
  if (acc) { const hit = others.find(c => normAccount(c.adAccountId) === acc); if (hit) return `Essa conta de anúncios já é do cliente ${hit.name}.` }
  return null
}
