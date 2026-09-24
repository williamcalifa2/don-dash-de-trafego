import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { deleteReport, getReport, savePresenterNotes } from '@/lib/reportsLibrary'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ slug: string; id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const { slug, id } = await params
  const r = await getReport(slug, id)
  return r ? NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { slug, id } = await params
  return (await deleteReport(slug, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
}

/** Anotações do apresentador (por slide). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { slug, id } = await params
  const body = await req.json().catch(() => ({})) as { presenterNotes?: unknown }
  return (await savePresenterNotes(slug, id, body.presenterNotes)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
}
