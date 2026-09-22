import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { stores } from '@/lib/meta/stores'
import { StoreNotMigrated } from '@/lib/meta/limits'
import { readOrganic } from '@/lib/meta/organicRead'

export const dynamic = 'force-dynamic'

const PRESETS = ['today', 'last_7d', 'last_14d', 'last_30d', 'this_month']

/** Orgânico do cliente (Página do Facebook e Instagram). Lê só do banco; a coleta roda em segundo plano pelo ciclo do sistema. */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const preset = req.nextUrl.searchParams.get('date_preset') ?? 'last_7d'
  if (!PRESETS.includes(preset)) return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })
  try {
    return NextResponse.json(await readOrganic(stores.snaps, tenant.clientId, preset), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ status: 'pending', at: null }, { headers: { 'Cache-Control': 'no-store' } })
    throw e
  }
}
