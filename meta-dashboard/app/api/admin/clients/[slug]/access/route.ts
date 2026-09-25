import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { addAccess, listAccess, removeAccess } from '@/lib/clientAccess'
import { tenantBySlug } from '@/lib/tenant'
import { logStaffActivity } from '@/lib/activityLog'
import { requireClientScope } from '@/lib/scope'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ slug: string }> }

/** E-mails que podem entrar no painel do cliente (só a equipe vê; o token nunca volta depois de gerado). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { slug } = await params
  const outOfScope = await requireClientScope(req, slug)
  if (outOfScope) return outOfScope
  return NextResponse.json({ emails: await listAccess(slug) }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Cadastra um e-mail (ou gera outro token para um e-mail que já existe). Devolve o token uma única vez, com o nome do negócio e o link para a mensagem. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const { slug } = await params
  const outOfScope = await requireClientScope(req, slug)
  if (outOfScope) return outOfScope
  const t = await tenantBySlug(slug)
  if (!t) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  const { email } = await req.json().catch(() => ({})) as { email?: unknown }
  if (typeof email !== 'string') return NextResponse.json({ error: 'Digite um e-mail válido.' }, { status: 400 })
  const r = await addAccess(slug, email)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  await logStaffActivity(req, slug, { kind: 'access', summary: 'Cadastrou um acesso para o cliente' })
  return NextResponse.json({ token: r.token, entry: r.entry, business: t.name })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const { slug } = await params
  const outOfScope = await requireClientScope(req, slug)
  if (outOfScope) return outOfScope
  const email = req.nextUrl.searchParams.get('email') ?? ''
  const err = await removeAccess(slug, email)
  if (err) return NextResponse.json({ error: err }, { status: 404 })
  await logStaffActivity(req, slug, { kind: 'access', summary: 'Removeu um acesso do cliente' })
  return NextResponse.json({ ok: true })
}
