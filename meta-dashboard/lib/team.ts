import crypto from 'node:crypto'
import { getSupabaseServer } from './supabase'

/**
 * Equipe da agência: colegas que entram na administração com o próprio e-mail e um token que funciona como senha.
 * Fica em meta_settings (chave admin_team), então não precisa de SQL novo. Só o hash do token é guardado.
 */
const KEY = 'admin_team'
const MAX_MEMBERS = 30
const TTL = 15_000
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0, O, 1, I, para não confundir ao digitar

/** Nível de acesso de quem é da equipe. Sem nível gravado (convites antigos) vale "membro". O administrador principal (dono) é outro nível, acima destes. */
export type MemberRole = 'admin' | 'member' | 'reader'
export const MEMBER_ROLES: readonly MemberRole[] = ['admin', 'member', 'reader']
export const ROLE_LABEL: Record<MemberRole, string> = { admin: 'Administrador', member: 'Membro', reader: 'Leitor' }
export const isMemberRole = (v: unknown): v is MemberRole => typeof v === 'string' && (MEMBER_ROLES as readonly string[]).includes(v)

export interface Member { email: string; hash: string; createdAt: string; lastLoginAt?: string | null; role?: MemberRole }
export type PublicMember = Omit<Member, 'hash' | 'role'> & { role: MemberRole }

let memo: { at: number; list: Member[] } | null = null
export const __resetTeamMemo = () => { memo = null }

export const normalizeEmail = (v: string) => v.trim().toLowerCase()
export const validEmail = (v: string) => v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

/** Token no formato K7QM-2XNP-9TDW: 12 caracteres, fáceis de ditar e de digitar. */
export function generateMemberToken(): string {
  const bytes = crypto.randomBytes(12)
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map(g => g.join('')).join('-')
}

/** Aceita minúsculas, espaços e com ou sem hífens. */
export const normalizeToken = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')

export function memberHash(email: string, token: string): string {
  return crypto.createHmac('sha256', process.env.DASHBOARD_SESSION_SECRET ?? '').update(`team:${normalizeEmail(email)}:${normalizeToken(token)}`).digest('hex')
}

const equal = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) }

/** null = banco indisponível (o login por equipe simplesmente não vale, o do dono continua). */
async function read(force = false): Promise<Member[] | null> {
  if (!force && memo && Date.now() - memo.at < TTL) return memo.list
  const db = getSupabaseServer()
  if (!db) return null
  const { data, error } = await db.from('meta_settings').select('value').eq('key', KEY).maybeSingle()
  if (error) return null
  const raw = (data as { value?: { members?: Member[] } } | null)?.value?.members
  const list = Array.isArray(raw) ? raw.filter(m => m && typeof m.email === 'string' && typeof m.hash === 'string') : []
  memo = { at: Date.now(), list }
  return list
}

async function write(list: Member[]): Promise<string | null> {
  const db = getSupabaseServer()
  if (!db) return 'Supabase não configurado'
  const { error } = await db.from('meta_settings').upsert({ key: KEY, value: { members: list }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return /does not exist|schema cache/i.test(error.message) ? 'Rode o SQL supabase/2026-09-meta-sync.sql no Supabase antes.' : error.message
  memo = { at: Date.now(), list }
  return null
}

const roleOf = (m: Member): MemberRole => (isMemberRole(m.role) ? m.role : 'member')
const pub = (m: Member): PublicMember => ({ email: m.email, createdAt: m.createdAt, lastLoginAt: m.lastLoginAt ?? null, role: roleOf(m) })

export async function listMembers(): Promise<PublicMember[] | null> {
  const l = await read(true)
  return l ? l.map(pub).sort((a, b) => a.email.localeCompare(b.email)) : null
}

export async function addMember(rawEmail: string, ownerEmail: string, role: MemberRole = 'member'): Promise<{ token: string; member: PublicMember } | { error: string }> {
  const email = normalizeEmail(rawEmail)
  if (!validEmail(email)) return { error: 'E-mail inválido.' }
  if (email === ownerEmail) return { error: 'Esse e-mail já é o do administrador principal.' }
  const list = await read(true)
  if (!list) return { error: 'Não consegui acessar o banco.' }
  if (list.some(m => m.email === email)) return { error: 'Esse e-mail já está na equipe. Use “Gerar novo token” se ele perdeu o acesso.' }
  if (list.length >= MAX_MEMBERS) return { error: `A equipe pode ter até ${MAX_MEMBERS} pessoas.` }
  const token = generateMemberToken()
  const m: Member = { email, hash: memberHash(email, token), createdAt: new Date().toISOString(), lastLoginAt: null, role }
  const err = await write([...list, m])
  return err ? { error: err } : { token, member: pub(m) }
}

/** Novo token: o anterior deixa de valer e as sessões abertas dessa pessoa caem. */
export async function regenerateToken(rawEmail: string): Promise<{ token: string } | { error: string }> {
  const email = normalizeEmail(rawEmail)
  const list = await read(true)
  if (!list) return { error: 'Não consegui acessar o banco.' }
  if (!list.some(m => m.email === email)) return { error: 'Pessoa não encontrada.' }
  const token = generateMemberToken()
  const err = await write(list.map(m => m.email === email ? { ...m, hash: memberHash(email, token) } : m))
  return err ? { error: err } : { token }
}

export async function removeMember(rawEmail: string): Promise<string | null> {
  const email = normalizeEmail(rawEmail)
  const list = await read(true)
  if (!list) return 'Não consegui acessar o banco.'
  if (!list.some(m => m.email === email)) return 'Pessoa não encontrada.'
  return write(list.filter(m => m.email !== email))
}

/** Confere e-mail + token. Sempre calcula o hash, para não revelar se o e-mail existe. */
export async function verifyMember(rawEmail: string, token: string): Promise<Member | null> {
  const email = normalizeEmail(rawEmail)
  const list = await read()
  const candidate = memberHash(email, token)
  const m = list?.find(x => x.email === email)
  return m && equal(m.hash, candidate) ? m : null
}

export async function getMember(rawEmail: string): Promise<PublicMember | null> {
  const m = (await read(true))?.find(x => x.email === normalizeEmail(rawEmail))
  return m ? pub(m) : null
}

export async function setMemberRole(rawEmail: string, role: MemberRole): Promise<string | null> {
  const email = normalizeEmail(rawEmail)
  const list = await read(true)
  if (!list) return 'Não consegui acessar o banco.'
  if (!list.some(m => m.email === email)) return 'Pessoa não encontrada.'
  return write(list.map(m => m.email === email ? { ...m, role } : m))
}

/** Nível da pessoa se a sessão dela ainda vale (mesmo token, ainda na equipe); null se não vale. */
export async function memberRoleFor(email: string, hashPrefix: string): Promise<MemberRole | null> {
  const m = (await read())?.find(x => x.email === normalizeEmail(email))
  return m && hashPrefix.length >= 8 && m.hash.startsWith(hashPrefix) ? roleOf(m) : null
}

/** A sessão da pessoa continua valendo enquanto ela estiver na equipe e o token não tiver sido trocado. */
export async function memberSessionValid(email: string, hashPrefix: string): Promise<boolean> {
  const m = (await read())?.find(x => x.email === normalizeEmail(email))
  return !!m && hashPrefix.length >= 8 && m.hash.startsWith(hashPrefix)
}

export async function touchLogin(email: string): Promise<void> {
  const list = await read()
  if (!list) return
  await write(list.map(m => m.email === normalizeEmail(email) ? { ...m, lastLoginAt: new Date().toISOString() } : m)).catch(() => {})
}
