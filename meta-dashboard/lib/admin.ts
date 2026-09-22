import { NextRequest, NextResponse } from 'next/server'
import { serviceKeyStatus } from './supabase'
import { memberRoleFor, memberSessionValid, touchLogin, verifyMember, type MemberRole } from './team'
import { authEnabled, readSession, sha256Hex, signSession, SESSION_COOKIE, type SessionPayload } from './auth'

export const ADMIN_SLUG = '__admin__'
export const VIEW_COOKIE = 'dash_view'
export const ADMIN_MAX_AGE = 60 * 60 * 12

const MIN_PASSWORD = 12

const adminEmail = () => (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()

/** A administração só liga com e-mail e uma senha de pelo menos 12 caracteres. */
export function adminEnabled(): boolean {
  return authEnabled() && !!adminEmail() && (process.env.ADMIN_PASSWORD ?? '').length >= MIN_PASSWORD
}

/** Trocar o e-mail ou a senha muda este valor e derruba as sessões de admin abertas. */
async function adminHashPrefix(): Promise<string> {
  return (await sha256Hex(`${adminEmail()}\n${process.env.ADMIN_PASSWORD ?? ''}`)).slice(0, 16)
}

export async function isAdminSession(session: SessionPayload | null): Promise<boolean> {
  if (!session || session.s !== ADMIN_SLUG || !adminEnabled()) return false
  // Colega da equipe: vale enquanto continuar na lista e com o mesmo token. Administrador principal: pela senha do Vercel.
  if (session.m) return memberSessionValid(session.m, session.h)
  return session.h === await adminHashPrefix()
}

export function isOwnerSession(session: SessionPayload | null): boolean {
  return !!session && session.s === ADMIN_SLUG && !session.m
}

export const ownerEmail = adminEmail

/** Só o administrador principal. */
export async function requireOwner(req: NextRequest): Promise<NextResponse | null> {
  return requireRole(req, 'owner')
}

export async function isAdmin(req: NextRequest): Promise<boolean> {
  return isAdminSession(await readSession(req.cookies.get(SESSION_COOKIE)?.value))
}

/** owner = administrador principal (login por ADMIN_EMAIL). Depois, os níveis da equipe. */
export type Role = 'owner' | MemberRole
const RANK: Record<Role, number> = { reader: 1, member: 2, admin: 3, owner: 4 }
export const roleAtLeast = (role: Role | null, min: Role) => !!role && RANK[role] >= RANK[min]

/** Nível de quem está logado na administração; null se não há sessão válida de administração. */
export async function sessionRole(session: SessionPayload | null): Promise<Role | null> {
  if (!session || session.s !== ADMIN_SLUG || !adminEnabled()) return null
  if (!session.m) return session.h === await adminHashPrefix() ? 'owner' : null
  return memberRoleFor(session.m, session.h)
}

export async function requestRole(req: NextRequest): Promise<Role | null> {
  return sessionRole(await readSession(req.cookies.get(SESSION_COOKIE)?.value))
}

/**
 * Use nas rotas /api/admin: devolve uma resposta de erro ou null quando a pessoa tem pelo menos o nível pedido.
 * Leitor só vê; membro opera (atualizar, leads, cards); administrador gerencia clientes e equipe; o dono é o administrador principal.
 */
export async function requireRole(req: NextRequest, min: Role): Promise<NextResponse | null> {
  if (!adminEnabled()) return NextResponse.json({ error: 'Administração desativada' }, { status: 404 })
  const role = await requestRole(req)
  if (!role) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return roleAtLeast(role, min) ? null : NextResponse.json({ error: 'Seu nível de acesso não permite esta ação.' }, { status: 403 })
}

/** Qualquer pessoa logada na administração (leitor ou acima). */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  return requireRole(req, 'reader')
}

/** Nas rotas do painel do cliente: barra o leitor (que só pode ver). Sessões de cliente e de outros níveis passam. */
export async function denyReader(req: NextRequest): Promise<NextResponse | null> {
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (session?.s !== ADMIN_SLUG) return null
  return (await sessionRole(session)) === 'reader' ? NextResponse.json({ error: 'Seu acesso é somente leitura.' }, { status: 403 }) : null
}

/** Impede criar/editar clientes com a chave errada: sem a service_role o banco esconde as linhas e dá para duplicar cliente. */
export function requireServiceKey(): NextResponse | null {
  const status = serviceKeyStatus()
  if (status === 'service' || status === 'unknown') return null
  return NextResponse.json({ error: 'A chave SUPABASE_SERVICE_ROLE_KEY do Vercel não é a service_role. Corrija e faça um redeploy antes de criar ou editar clientes.' }, { status: 409 })
}

export async function adminSessionForCredentials(email: string, password: string): Promise<string | null> {
  if (!adminEnabled()) return null
  const [ea, eb, pa, pb] = await Promise.all([
    sha256Hex(email.trim().toLowerCase()), sha256Hex(adminEmail()),
    sha256Hex(password), sha256Hex(process.env.ADMIN_PASSWORD ?? ''),
  ])
  // Compara sempre os dois campos, para não revelar qual deles errou.
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= (ea.charCodeAt(i) ^ eb.charCodeAt(i)) | (pa.charCodeAt(i) ^ pb.charCodeAt(i))
  if (diff === 0) return signSession({ s: ADMIN_SLUG, h: await adminHashPrefix() }, ADMIN_MAX_AGE)

  // Não é o administrador principal: pode ser alguém da equipe (e-mail cadastrado + token de acesso como senha).
  const member = await verifyMember(email, password).catch(() => null)
  if (!member) return null
  void touchLogin(member.email)
  return signSession({ s: ADMIN_SLUG, h: member.hash.slice(0, 16), m: member.email }, ADMIN_MAX_AGE)
}
