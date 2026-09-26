/** Foto de quem aparece nas telas de análise: a do gestor (se a pessoa for um), senão a do perfil. Chave `cliente:slug` = logo do cliente. */
import { getProfiles, avatarUrlOf } from './adminProfile'
import { loadRegistry } from './activityLog'
import { clientLogos } from './managersStore'

export async function photosFor(userKeys: string[]): Promise<{ person: (key: string) => string | null; logo: (slug: string) => string | null }> {
  const [logos, reg] = await Promise.all([clientLogos(), loadRegistry().catch(() => null)])
  const emails = [...new Set(userKeys.filter(k => !k.startsWith('cliente:')).map(k => k.toLowerCase()))]
  const profiles = await getProfiles(emails).catch(() => new Map<string, { avatar?: string }>())
  const person = (key: string): string | null => {
    if (key.startsWith('cliente:')) return logos.get(key.slice(8)) ?? null
    const k = key.toLowerCase()
    return reg?.managers.find(m => m.email === k)?.avatarUrl ?? avatarUrlOf(k, profiles.get(k)?.avatar)
  }
  return { person, logo: (slug: string) => logos.get(slug) ?? null }
}
