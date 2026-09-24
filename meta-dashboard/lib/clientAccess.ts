/**
 * Acesso do cliente por e-mail + token (como a equipe): a agência cadastra o e-mail de quem pode entrar no painel do cliente e gera um token.
 * Fica em meta_settings (client_access:<cliente>), só com o hash do token. Trocar o token ou remover o e-mail derruba as sessões abertas.
 * Enquanto um cliente não tem nenhum e-mail cadastrado, o código antigo de 6 dígitos continua valendo; com e-mail cadastrado, ele deixa de valer.
 */
import crypto from 'node:crypto'
import { getSupabaseServer } from './supabase'
import { generateMemberToken, normalizeEmail, normalizeToken, validEmail } from './team'

export const accessKey = (slug: string) => `client_access:${slug}`
export const MAX_EMAILS = 10
export const MAX_FAILS = 5
export const LOCK_MIN = 10
const TTL = 15_000

export interface ClientAccessEntry { email: string; hash: string; createdAt: string; lastLoginAt?: string | null; failed?: number; lockedUntil?: number }
export type PublicAccess = Pick<ClientAccessEntry, 'email' | 'createdAt' | 'lastLoginAt'>

const memo = new Map<string, { at: number; list: ClientAccessEntry[] }>()
export const __resetAccessMemo = () => memo.clear()

/** Token de cliente: mesmo formato do da equipe (K7QM-2XNP-9TDW). */
export const generateClientToken = generateMemberToken

export function accessHash(slug: string, email: string, token: string): string {
  return crypto.createHmac('sha256', process.env.DASHBOARD_SESSION_SECRET ?? '').update(`client:${slug}:${normalizeEmail(email)}:${normalizeToken(token)}`).digest('hex')
}
const equal = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) }

async function read(slug: string, fresh = false): Promise<ClientAccessEntry[]> {
  const hit = memo.get(slug)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.list
  const db = getSupabaseServer()
  if (!db) return []
  const { data, error } = await db.from('meta_settings').select('value').eq('key', accessKey(slug)).maybeSingle()
  if (error) return hit?.list ?? []
  const raw = (data as { value?: unknown } | null)?.value
  const list = Array.isArray(raw) ? (raw as ClientAccessEntry[]).filter(e => e && typeof e.email === 'string' && typeof e.hash === 'string') : []
  memo.set(slug, { at: Date.now(), list })
  return list
}

async function write(slug: string, list: ClientAccessEntry[]): Promise<string | null> {
  const db = getSupabaseServer()
  if (!db) return 'Supabase não configurado'
  const { error } = await db.from('meta_settings').upsert({ key: accessKey(slug), value: list, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return error.message
  memo.set(slug, { at: Date.now(), list })
  return null
}

const pub = (e: ClientAccessEntry): PublicAccess => ({ email: e.email, createdAt: e.createdAt, lastLoginAt: e.lastLoginAt ?? null })

/** O cliente entra por e-mail e token? (tem pelo menos um e-mail cadastrado) */
export async function hasEmails(slug: string): Promise<boolean> {
  return (await read(slug)).length > 0
}

export async function listAccess(slug: string): Promise<PublicAccess[]> {
  return (await read(slug, true)).map(pub)
}

/** Cadastra o e-mail e gera o token (mostrado uma vez). Se o e-mail já existe, gera outro token para ele. */
export async function addAccess(slug: string, rawEmail: string): Promise<{ token: string; entry: PublicAccess } | { error: string }> {
  const email = normalizeEmail(rawEmail)
  if (!validEmail(email)) return { error: 'Digite um e-mail válido.' }
  const list = await read(slug, true)
  const existing = list.find(e => e.email === email)
  if (!existing && list.length >= MAX_EMAILS) return { error: `Cada cliente aceita até ${MAX_EMAILS} e-mails.` }
  const token = generateClientToken()
  const entry: ClientAccessEntry = { ...(existing ?? { createdAt: new Date().toISOString() }), email, hash: accessHash(slug, email, token), failed: 0, lockedUntil: 0 }
  const err = await write(slug, existing ? list.map(e => (e.email === email ? entry : e)) : [...list, entry])
  return err ? { error: err } : { token, entry: pub(entry) }
}

export async function removeAccess(slug: string, rawEmail: string): Promise<string | null> {
  const email = normalizeEmail(rawEmail)
  const list = await read(slug, true)
  if (!list.some(e => e.email === email)) return 'E-mail não encontrado.'
  return write(slug, list.filter(e => e.email !== email))
}

export type AccessResult = { ok: true; email: string; hash: string } | { ok: false; reason: 'invalid' | 'locked'; minutes?: number }

/** Confere e-mail e token. Erros seguidos no mesmo e-mail bloqueiam esse e-mail por alguns minutos (guardado junto do cadastro). */
export async function verifyAccess(slug: string, rawEmail: string, token: string, now = Date.now()): Promise<AccessResult> {
  const email = normalizeEmail(rawEmail)
  const list = await read(slug, true)
  const entry = list.find(e => e.email === email)
  if (!entry) return { ok: false, reason: 'invalid' }
  if ((entry.lockedUntil ?? 0) > now) return { ok: false, reason: 'locked', minutes: Math.max(1, Math.ceil(((entry.lockedUntil ?? 0) - now) / 60000)) }
  if (equal(entry.hash, accessHash(slug, email, token))) {
    await write(slug, list.map(e => (e.email === email ? { ...e, failed: 0, lockedUntil: 0, lastLoginAt: new Date(now).toISOString() } : e)))
    return { ok: true, email, hash: entry.hash }
  }
  const failed = (entry.failed ?? 0) + 1
  const locked = failed >= MAX_FAILS
  await write(slug, list.map(e => (e.email === email ? { ...e, failed: locked ? 0 : failed, lockedUntil: locked ? now + LOCK_MIN * 60000 : 0 } : e)))
  return locked ? { ok: false, reason: 'locked', minutes: LOCK_MIN } : { ok: false, reason: 'invalid' }
}

/** A sessão do cliente ainda vale? Mesmo token e e-mail ainda cadastrado. */
export async function accessSessionValid(slug: string, email: string, hashPrefix: string): Promise<boolean> {
  const e = (await read(slug)).find(x => x.email === normalizeEmail(email))
  return !!e && hashPrefix.length >= 8 && e.hash.startsWith(hashPrefix)
}
