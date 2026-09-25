/** Plataformas de anúncio que o painel conhece. Cada uma aparece com a logo no card do admin e no painel do cliente quando o cliente roda nela. */
export type PlatformKey = 'meta' | 'shopify'

/** `scale`: ajuste óptico para as marcas parecerem do mesmo tamanho lado a lado (a da Meta é larga; a da Shopify é um quadrado que parece menor na mesma altura). */
export const PLATFORMS: Record<PlatformKey, { label: string; logo: string; scale: number }> = {
  meta: { label: 'Meta Ads', logo: '/platforms/meta.png', scale: 1 },
  shopify: { label: 'Shopify', logo: '/integrations/shopify.svg', scale: 1.4 },
}

/** Onde o cliente roda, pelo que está cadastrado nele. (Google Ads entra aqui quando existir o campo da conta.) */
export function platformsFor(c: { adAccountId?: string | null; ecommerce?: boolean }): PlatformKey[] {
  const out: PlatformKey[] = []
  if (c.adAccountId) out.push('meta')
  if (c.ecommerce) out.push('shopify')
  return out
}
