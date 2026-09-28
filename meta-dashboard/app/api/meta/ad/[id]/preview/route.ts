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

  // Busca o link oficial compartilhável, prévia do anúncio e detalhes do criativo
  const [adRes, prevRes, detailsRes] = await Promise.all([
    legacyGet<{ preview_shareable_link?: string }>(`${id}?fields=preview_shareable_link`, opts).catch(() => null),
    legacyGet<{ data?: Array<{ body: string }> }>(`${id}/previews?ad_format=MOBILE_FEED_STANDARD`, opts).catch(() => null),
    legacyGet<{ name?: string; creative?: { name?: string; title?: string; body?: string; image_url?: string; thumbnail_url?: string } }>(`${id}?fields=name,creative{name,title,body,image_url,thumbnail_url}`, opts).catch(() => null),
  ])

  const shareable = adRes && adRes.ok && adRes.data.preview_shareable_link ? adRes.data.preview_shareable_link : null
  if (shareable) {
    return NextResponse.redirect(shareable, 302)
  }

  const html = prevRes && prevRes.ok ? prevRes.data.data?.[0]?.body : null
  const iframeUrl = previewSrc(html)
  const adName = detailsRes?.ok ? (detailsRes.data.name || detailsRes.data.creative?.name || 'Prévia do Anúncio') : 'Prévia do Anúncio'
  const creative = detailsRes?.ok ? detailsRes.data.creative : undefined
  const imgUrl = creative?.image_url || creative?.thumbnail_url || ''
  const bodyText = creative?.body || ''
  const titleText = creative?.title || ''

  // Retorna página HTML elegante e pública com iframe oficial ou card do criativo (nunca redireciona para o Gerenciador de Anúncios)
  const pageHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(adName)} · Prévia do Anúncio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .container {
      width: 100%;
      max-width: 440px;
      background: #131c2e;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7);
    }
    .header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .title {
      font-size: 14px;
      font-weight: 600;
      color: #f8fafc;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge {
      font-size: 11px;
      font-weight: 600;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      padding: 2px 8px;
      border-radius: 999px;
      flex-shrink: 0;
    }
    .content {
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #0b1120;
      min-height: ${iframeUrl ? '600px' : 'auto'};
    }
    iframe {
      border: none;
      width: 100%;
      height: 620px;
      display: block;
    }
    .card-preview {
      padding: 20px;
      width: 100%;
    }
    .card-img {
      width: 100%;
      max-height: 380px;
      object-fit: cover;
      border-radius: 10px;
      margin-bottom: 14px;
      display: block;
    }
    .card-title {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .card-body {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .footer {
      padding: 12px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      text-align: center;
      font-size: 11px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">${escapeHtml(adName)}</div>
      <div class="badge">Prévia Oficial</div>
    </div>
    <div class="content">
      ${iframeUrl
        ? `<iframe src="${escapeHtml(iframeUrl)}" sandbox="allow-scripts allow-same-origin allow-popups" referrerpolicy="no-referrer"></iframe>`
        : `<div class="card-preview">
            ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="" class="card-img" />` : ''}
            ${titleText ? `<div class="card-title">${escapeHtml(titleText)}</div>` : ''}
            ${bodyText ? `<div class="card-body">${escapeHtml(bodyText)}</div>` : ''}
          </div>`
      }
    </div>
    <div class="footer">
      Visualização de anúncio Meta
    </div>
  </div>
</body>
</html>`

  return new NextResponse(pageHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
