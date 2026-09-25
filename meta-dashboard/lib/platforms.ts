/** Plataformas de anúncio que o painel conhece. Cada uma aparece com a logo no card do admin e no painel do cliente quando o cliente roda nela. */
export type PlatformKey = 'meta' | 'shopify' | 'google'

/** `scale`: ajuste óptico para as marcas parecerem do mesmo tamanho lado a lado (a da Meta é larga; a da Shopify é um quadrado que parece menor na mesma altura). */
export const PLATFORMS: Record<PlatformKey, { label: string; logo: string; scale: number }> = {
  meta: { label: 'Meta Ads', logo: '/platforms/meta.png', scale: 1 },
  google: { label: 'Google Ads', logo: '/platforms/google-ads.svg', scale: 1 },
  shopify: { label: 'Shopify', logo: '/integrations/shopify.svg', scale: 1.4 },
}

/** Onde o cliente roda, pelo que está cadastrado nele. */
export function platformsFor(c: { adAccountId?: string | null; ecommerce?: boolean; google?: boolean }): PlatformKey[] {
  const out: PlatformKey[] = []
  if (c.adAccountId) out.push('meta')
  if (c.google) out.push('google')
  if (c.ecommerce) out.push('shopify')
  return out
}
