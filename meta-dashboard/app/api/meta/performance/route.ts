import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { errMsg, legacyPaged } from '@/lib/meta/legacy'
import { snapshotMode, accountStateOrNull, snapshotGuard } from '@/lib/meta/mode'
import { readPerformance, toPerfRows } from '@/lib/meta/read'
import { metaConfig } from '@/lib/meta/config'
import { stores } from '@/lib/meta/pipeline'
import { friendlyLiveError, performanceFallback, remember } from '@/lib/meta/staleFallback'

export const dynamic = 'force-dynamic'

const PRESETS = ['today', 'last_7d', 'last_14d', 'last_30d', 'this_month']

export type { AdPerfRow } from '@/lib/meta/read'

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const preset = req.nextUrl.searchParams.get('date_preset') ?? 'last_7d'
  if (!PRESETS.includes(preset)) return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })

  const token = process.env.META_ACCESS_TOKEN
  const account = tenant.adAccountId
  if (await snapshotMode()) {
    if (!account) return NextResponse.json({ rows: [], is_mock: true })
    return snapshotGuard(async () => NextResponse.json(await readPerformance(stores.snaps, tenant.clientId, preset, metaConfig(), await accountStateOrNull(tenant.clientId)), { headers: { 'Cache-Control': 'no-store' } }))
  }
  if (!token || !account) return NextResponse.json({ rows: [], is_mock: true })

  try {
    const fields = 'ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions'
    const res = await legacyPaged<Record<string, unknown>>(
      `${account}/insights?level=ad&fields=${fields}&date_preset=${preset}&limit=100`,
      { accountId: account, clientId: tenant.clientId, purpose: 'painel:desempenho' },
    )
    if (!res.ok) {
      const old = await performanceFallback(tenant.clientId, preset).catch(() => null)
      if (old) return NextResponse.json(old, { headers: { 'Cache-Control': 'no-store' } })
      return NextResponse.json({ error: friendlyLiveError(errMsg(res)) }, { status: 502 })
    }
    const rows = toPerfRows(res.rows ?? [])
    remember(`p:${tenant.clientId}:${preset}`, rows)
    return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const old = await performanceFallback(tenant.clientId, preset).catch(() => null)
    if (old) return NextResponse.json(old, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ error: friendlyLiveError(e instanceof Error ? e.message : 'Erro desconhecido') }, { status: 502 })
  }
}
