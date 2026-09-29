import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { dismissReminder, listReminders } from '@/lib/optimizationReminders'

export const dynamic = 'force-dynamic'

/** Lembretes em aberto de "cliente sem otimizar há X dias". `?manager=<id>` filtra pro gestor logado. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const managerId = req.nextUrl.searchParams.get('manager') ?? undefined
  return NextResponse.json({ reminders: await listReminders(managerId) })
}

/** Marca como feito: tira o lembrete da lista. Body: { slug }. */
export async function PATCH(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { slug?: unknown }
  if (typeof body.slug !== 'string' || !body.slug) return NextResponse.json({ error: 'Falta o cliente.' }, { status: 400 })
  await dismissReminder(body.slug)
  return NextResponse.json({ ok: true })
}
