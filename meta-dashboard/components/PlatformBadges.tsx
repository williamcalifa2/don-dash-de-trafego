import { PLATFORMS, type PlatformKey } from '@/lib/platforms'

/** Logo(s) das plataformas em que o cliente anuncia. Discreto: só a marca, com nome ao passar o mouse. */
export function PlatformBadges({ platforms, height = 11 }: { platforms: PlatformKey[]; height?: number }) {
  if (!platforms.length) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      {platforms.map(p => (
        <img key={p} src={PLATFORMS[p].logo} alt={PLATFORMS[p].label} title={`Anuncia no ${PLATFORMS[p].label}`} style={{ height, width: 'auto', display: 'block', opacity: 0.9 }} />
      ))}
    </span>
  )
}
