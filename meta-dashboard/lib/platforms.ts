/** Plataformas de anúncio que o painel conhece. Cada uma aparece com a logo no card do admin e no painel do cliente quando o cliente roda nela. */
export type PlatformKey = 'meta'

export const PLATFORMS: Record<PlatformKey, { label: string; logo: string }> = {
  meta: { label: 'Meta Ads', logo: '/platforms/meta.png' },
}

/** Onde o cliente roda, pelo que está cadastrado nele. (Google Ads entra aqui quando existir o campo da conta.) */
export function platformsFor(c: { adAccountId?: string | null }): PlatformKey[] {
  const out: PlatformKey[] = []
  if (c.adAccountId) out.push('meta')
  return out
}
