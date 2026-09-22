import { NextRequest, NextResponse } from 'next/server'
import { ownerEmail, requestRole, requireRole, type Role } from '@/lib/admin'
import { addMember, getMember, isMemberRole, listMembers, regenerateToken, removeMember, setMemberRole } from '@/lib/team'

export const dynamic = 'force-dynamic'

/**
 * Equipe da agência. Administrador principal e administradores gerenciam; só o principal mexe em administradores.
 * GET lista · POST { email, role } adiciona e devolve o token UMA vez · PUT { email } novo token · PATCH { email, role } muda o nível · DELETE ?email= remove.
 */
const ADMIN_ONLY = 'Só o administrador principal gerencia administradores.'
const isOwner = (r: Role | null) => r === 'owner'

async function targetIsAdmin(email: string) { return (await getMember(email))?.role === 'admin' }

export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const members = await listMembers()
  return NextResponse.json({ members: members ?? [], canManageAdmins: isOwner(await requestRole(req)), error: members ? undefined : 'Não consegui acessar o banco.' })
}

export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const b = await req.json().catch(() => ({})) as { email?: unknown; role?: unknown }
  if (typeof b.email !== 'string') return NextResponse.json({ error: 'Informe o e-mail.' }, { status: 400 })
  const role = b.role === undefined ? 'member' : b.role
  if (!isMemberRole(role)) return NextResponse.json({ error: 'Nível de acesso inválido.' }, { status: 400 })
  if (role === 'admin' && !isOwner(await requestRole(req))) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 })
  const r = await addMember(b.email, ownerEmail(), role)
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true, email: r.member.email, role: r.member.role, token: r.token })
}

export async function PUT(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const b = await req.json().catch(() => ({})) as { email?: unknown }
  if (typeof b.email !== 'string') return NextResponse.json({ error: 'Informe o e-mail.' }, { status: 400 })
  if (await targetIsAdmin(b.email) && !isOwner(await requestRole(req))) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 })
  const r = await regenerateToken(b.email)
  return 'error' in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ ok: true, token: r.token })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const b = await req.json().catch(() => ({})) as { email?: unknown; role?: unknown }
  if (typeof b.email !== 'string' || !isMemberRole(b.role)) return NextResponse.json({ error: 'Informe o e-mail e o nível.' }, { status: 400 })
  // Promover a administrador ou mexer em um administrador: só o principal.
  if ((b.role === 'admin' || await targetIsAdmin(b.email)) && !isOwner(await requestRole(req))) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 })
  const err = await setMemberRole(b.email, b.role)
  return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const email = new URL(req.url).searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Informe o e-mail.' }, { status: 400 })
  if (await targetIsAdmin(email) && !isOwner(await requestRole(req))) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 })
  const err = await removeMember(email)
  return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true })
}
