import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { SCOPE_COOKIE, scopeFor } from '@/lib/scope'

export const dynamic = 'force-dynamic'

/** Como está a visão de clientes de quem está logado: carteira própria ou todos. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const s = await scopeFor(req)
  return NextResponse.json({ mode: s.mode, canToggle: s.canToggle, manager: s.manager, restricted: s.restricted, count: s.slugs?.size ?? null })
}

/** Administrador ou dono que também é gestor alterna entre "minhas contas" e "todas": { mode: 'mine' | 'all' }. */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const s = await scopeFor(req)
  if (!s.canToggle) return NextResponse.json({ error: 'Sua visão é sempre a da sua carteira.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { mode?: unknown }
  const mode = b.mode === 'all' ? 'all' : 'mine'
  const res = NextResponse.json({ ok: true, mode })
  res.cookies.set(SCOPE_COOKIE, mode, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 365 * 86_400 })
  return res
}
