import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { tenantOwns } from '@/lib/metaAccess'
import { legacyGet } from '@/lib/meta/legacy'
import { previewSrc } from '@/lib/adPreview'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const { id } = await params
  if (!(await tenantOwns(tenant, id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const opts = { accountId: tenant.adAccountId, clientId: tenant.clientId, purpose: 'painel:previa' }

  // Busca o link oficial compartilhável e a prévia do anúncio da Meta em paralelo
  const [adRes, prevRes] = await Promise.all([
    legacyGet<{ preview_shareable_link?: string }>(`${id}?fields=preview_shareable_link`, opts).catch(() => null),
    legacyGet<{ data?: Array<{ body: string }> }>(`${id}/previews?ad_format=MOBILE_FEED_STANDARD`, opts).catch(() => null),
  ])

  const shareable = adRes && adRes.ok && adRes.data.preview_shareable_link ? adRes.data.preview_shareable_link : null
  if (shareable) {
    return NextResponse.redirect(shareable, 302)
  }

  const html = prevRes && prevRes.ok ? prevRes.data.data?.[0]?.body : null
  const iframeUrl = previewSrc(html)
  if (iframeUrl) {
    return NextResponse.redirect(iframeUrl, 302)
  }

  // Fallback seguro: abre o Gerenciador de Anúncios na filtragem do anúncio exato
  const act = tenant.adAccountId ? tenant.adAccountId.replace(/^act_/, '') : ''
  const fallbackUrl = act
    ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act}&filter_set=AD_ID_IN.${id}`
    : `https://adsmanager.facebook.com/adsmanager/manage/ads`
  return NextResponse.redirect(fallbackUrl, 302)
}
