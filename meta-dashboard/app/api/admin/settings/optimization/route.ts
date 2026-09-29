import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { MAX_CADENCE, MIN_CADENCE, getCadenceDays, setCadenceDays } from '@/lib/optimizationReminders'

export const dynamic = 'force-dynamic'

/** Configuração da cadência: a cada quantos dias sem otimizar um cliente ganha um lembrete no Início do gestor. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  return NextResponse.json({ cadenceDays: await getCadenceDays(), min: MIN_CADENCE, max: MAX_CADENCE })
}

export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { cadenceDays?: unknown }
  const days = Number(body.cadenceDays)
  if (!Number.isFinite(days) || days < MIN_CADENCE || days > MAX_CADENCE) return NextResponse.json({ error: `Informe um número entre ${MIN_CADENCE} e ${MAX_CADENCE}.` }, { status: 400 })
  await setCadenceDays(days)
  return NextResponse.json({ ok: true, cadenceDays: days })
}
