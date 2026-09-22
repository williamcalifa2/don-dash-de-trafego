import { NextRequest, NextResponse } from 'next/server'
import { getFechamentos, upsertFechamento } from '@/lib/supabase'
import { requireTenant } from '@/lib/tenant'
import { denyReader } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  try {
    return NextResponse.json({ rows: await getFechamentos(tenant.clientId) })
  } catch {
    return NextResponse.json({ rows: [] })
  }
}

export async function POST(req: NextRequest) {
  const readOnly = await denyReader(req)
  if (readOnly) return readOnly
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const b = await req.json().catch(() => null) as { date?: unknown; count?: unknown; revenue?: unknown } | null
  const count = Number(b?.count), revenue = Number(b?.revenue)
  if (!b || typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !isFinite(count) || count < 0 || !isFinite(revenue) || revenue < 0) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }
  try {
    await upsertFechamento(tenant.clientId, b.date, count, revenue)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao salvar' }, { status: 500 })
  }
}
