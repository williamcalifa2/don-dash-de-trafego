import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { buildTree, type TreeCampaign } from '@/lib/structureTree'
import { legacyPaged } from '@/lib/meta/legacy'
import { stores } from '@/lib/meta/stores'
import { snapshotMode } from '@/lib/meta/mode'
import { StoreNotMigrated } from '@/lib/meta/limits'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Row = { id: string; name?: string; effective_status?: string; campaign_id?: string; adset_id?: string }
const liveCache = new Map<string, { at: number; tree: TreeCampaign[] | null }>()
const TTL = 15 * 60_000

/** Campanhas, conjuntos e anúncios da conta (nomes), para escolher a origem de um lead cadastrado à mão. */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  if (!tenant.adAccountId) return NextResponse.json({ campaigns: [], reason: 'no_account' })

  try {
    const [c, s, a] = await Promise.all([
      stores.snaps.get<Row[]>(tenant.clientId, 'structure', 'campaigns'),
      stores.snaps.get<Row[]>(tenant.clientId, 'structure', 'adsets'),
      stores.snaps.get<Row[]>(tenant.clientId, 'structure', 'ads'),
    ])
    if (c) return NextResponse.json({ campaigns: buildTree(c.payload, s?.payload ?? [], a?.payload ?? []), at: c.fetchedAt }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { if (!(e instanceof StoreNotMigrated)) throw e }

  if (await snapshotMode() || !process.env.META_ACCESS_TOKEN) return NextResponse.json({ campaigns: [], reason: 'pending' })

  const hit = liveCache.get(tenant.clientId)
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ campaigns: hit.tree ?? [], reason: hit.tree ? undefined : 'pending' })

  const acc = tenant.adAccountId
  const opts = { accountId: acc, clientId: tenant.clientId, purpose: 'painel:origem-lead' }
  const camps = await legacyPaged<Row>(`${acc}/campaigns?fields=id,name,effective_status&limit=100`, opts)
  const sets = camps.ok ? await legacyPaged<Row>(`${acc}/adsets?fields=id,name,effective_status,campaign_id&limit=100`, opts) : null
  const ads = sets?.ok ? await legacyPaged<Row>(`${acc}/ads?fields=id,name,effective_status,adset_id,campaign_id&limit=100`, opts) : null
  if (!camps.ok || !sets?.ok || !ads?.ok) { liveCache.set(tenant.clientId, { at: Date.now(), tree: null }); return NextResponse.json({ campaigns: [], reason: 'pending' }) }
  const tree = buildTree(camps.rows, sets.rows, ads.rows)
  liveCache.set(tenant.clientId, { at: Date.now(), tree })
  return NextResponse.json({ campaigns: tree, source: 'live' }, { headers: { 'Cache-Control': 'no-store' } })
}
