import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { stores } from '@/lib/meta/stores'
import { StoreNotMigrated } from '@/lib/meta/limits'
import { buildCreatives } from '@/lib/creatives'

export const dynamic = 'force-dynamic'

const PRESETS = ['today', 'last_7d', 'last_14d', 'last_30d', 'this_month']

/**
 * Criativos do cliente (campeões, fadiga e tendência do CTR). Só lê do banco: nada aqui chama a Meta.
 * A tendência compara os últimos 7 dias com os 7 anteriores, a partir dos períodos de 7 e 14 dias já guardados.
 */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const preset = req.nextUrl.searchParams.get('date_preset') ?? 'last_7d'
  if (!PRESETS.includes(preset)) return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })
  try {
    type Rows = Array<Record<string, unknown>>
    const [cur, r7, r14, struct] = await Promise.all([
      stores.snaps.get<Rows>(tenant.clientId, 'ad_insights', preset),
      stores.snaps.get<Rows>(tenant.clientId, 'ad_insights', 'last_7d'),
      stores.snaps.get<Rows>(tenant.clientId, 'ad_insights', 'last_14d'),
      stores.snaps.get<Array<{ id: string; effective_status?: string; creative?: Record<string, unknown> }>>(tenant.clientId, 'structure', 'ads'),
    ])
    if (!cur) return NextResponse.json({ creatives: [], reason: 'pending' }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ creatives: buildCreatives(cur.payload, r7?.payload, r14?.payload, struct?.payload ?? []), at: cur.fetchedAt, hasTrend: !!(r7 && r14) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ creatives: [], reason: 'pending' }, { headers: { 'Cache-Control': 'no-store' } })
    throw e
  }
}
