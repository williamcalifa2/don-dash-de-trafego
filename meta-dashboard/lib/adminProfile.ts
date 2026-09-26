import { getSupabaseServer } from './supabase'

/** Perfil de quem entra na administração (nome e foto). Fica em meta_settings, uma linha só, por e-mail. Sem SQL novo. */
const KEY = 'admin_profiles'
export interface AdminProfile { name?: string; avatar?: string }

const MAX_NAME = 60
const MAX_AVATAR = 200_000
const AVATAR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

export function cleanProfile(v: unknown): AdminProfile {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : ''
  const avatar = typeof o.avatar === 'string' && o.avatar.length <= MAX_AVATAR && AVATAR.test(o.avatar) ? o.avatar : ''
  return { ...(name ? { name } : {}), ...(avatar ? { avatar } : {}) }
}

/** Nome de exibição quando a pessoa ainda não escolheu: a parte antes do @, com iniciais em maiúscula. */
export const nameFromEmail = (email: string) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ') || email

async function readAll(): Promise<Record<string, AdminProfile>> {
  const db = getSupabaseServer()
  if (!db) return {}
  const { data } = await db.from('meta_settings').select('value').eq('key', KEY).maybeSingle()
  const v = (data as { value: unknown } | null)?.value
  return v && typeof v === 'object' ? (v as Record<string, AdminProfile>) : {}
}

/** Fotos de várias pessoas de uma vez (uma leitura só). */
export async function getProfiles(emails: string[]): Promise<Map<string, AdminProfile>> {
  const all = await readAll()
  return new Map(emails.map(e => [e.toLowerCase(), cleanProfile(all[e.toLowerCase()])]))
}

export async function getProfile(email: string): Promise<AdminProfile> {
  return cleanProfile((await readAll())[email.toLowerCase()])
}

/** `avatar: null` remove a foto; campo ausente mantém o que já está. */
export async function saveProfile(email: string, patch: { name?: unknown; avatar?: unknown }): Promise<AdminProfile> {
  const db = getSupabaseServer()
  if (!db) throw new Error('Banco indisponível')
  const all = await readAll()
  const cur = cleanProfile(all[email.toLowerCase()])
  const next = cleanProfile({
    name: patch.name !== undefined ? patch.name : cur.name,
    avatar: patch.avatar === null ? '' : patch.avatar !== undefined ? patch.avatar : cur.avatar,
  })
  all[email.toLowerCase()] = next
  const { error } = await db.from('meta_settings').upsert({ key: KEY, value: all, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  return next
}

export const AVATAR_URL = '/api/admin/profile/avatar'

/** Endereço da foto de OUTRA pessoa da equipe (as telas de gestão mostram quem é quem). */
export function avatarUrlOf(email: string, avatar: string | undefined | null): string | null {
  const u = avatarUrl(avatar)
  return u ? `${u}&email=${encodeURIComponent(email.toLowerCase())}` : null
}

/** Endereço da foto para o navegador. O `v` muda quando a foto muda, então o cache longo nunca mostra foto velha. */
export function avatarUrl(avatar: string | undefined | null): string | null {
  if (!avatar) return null
  let h = 5381
  for (let i = 0; i < avatar.length; i += 7) h = ((h << 5) + h + avatar.charCodeAt(i)) | 0
  return `${AVATAR_URL}?v=${(h >>> 0).toString(36)}${avatar.length.toString(36)}`
}
