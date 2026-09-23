import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { tenantOwns } from '@/lib/metaAccess'
import { errMsg, legacyGet } from '@/lib/meta/legacy'
import { snapshotMode, snapshotGuard } from '@/lib/meta/mode'
import { readAdPreview } from '@/lib/meta/read'
import { stores } from '@/lib/meta/pipeline'
import { previewSrc } from '@/lib/adPreview'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const { id } = await params
  if (!(await tenantOwns(tenant, id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (await snapshotMode()) return snapshotGuard(async () => NextResponse.json({ html: await readAdPreview(stores.snaps, tenant.clientId, id) }))
  if (!process.env.META_ACCESS_TOKEN) return NextResponse.json({ error: 'No token' }, { status: 500 })

  const [res, adRes] = await Promise.all([
    legacyGet<{ data?: Array<{ body: string }> }>(`${id}/previews?ad_format=MOBILE_FEED_STANDARD`, { accountId: tenant.adAccountId, clientId: tenant.clientId, purpose: 'painel:previa' }),
    legacyGet<{ preview_shareable_link?: string }>(`${id}?fields=preview_shareable_link`, { accountId: tenant.adAccountId, clientId: tenant.clientId, purpose: 'painel:previa' }).catch(() => null)
  ])

  if (!res.ok && (!adRes || !adRes.ok)) return NextResponse.json({ error: errMsg(res, 'Preview error') }, { status: 400 })
  const html = res.ok ? res.data.data?.[0]?.body ?? '' : ''
  const shareable_link = (adRes && adRes.ok && adRes.data.preview_shareable_link) ? adRes.data.preview_shareable_link : null
  const iframe_url = previewSrc(html)
  const url = shareable_link || iframe_url || `/api/meta/ad/${id}/preview`

  return NextResponse.json({
    html,
    shareable_link,
    iframe_url,
    url,
  })
}
