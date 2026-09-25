import { NextRequest, NextResponse } from 'next/server'
import { findSlugByShop } from '@/lib/clientConfig'
import { appCredentials, makeState, redirectUri, APP_SCOPES, verifyOAuthQuery } from '@/lib/shopifyApp'
import { shopifyHost } from '@/lib/shopifyCatalog'

export const dynamic = 'force-dynamic'

/** URL do app na Shopify. Depois que o dono aprova a instalação, a Shopify abre este endereço; daqui seguimos para a autorização que devolve o token. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const params = req.nextUrl.searchParams
  const app = appCredentials()
  const shop = shopifyHost(params.get('shop'))
  if (!app || !shop || !verifyOAuthQuery(params, app.secret)) return NextResponse.redirect(`${origin}/login`)

  // Já veio com código: é o retorno da autorização.
  if (params.get('code')) return NextResponse.redirect(`${origin}/api/shopify/callback?${params.toString()}`)

  const slug = await findSlugByShop(shop)
  if (!slug) return new NextResponse('Loja não cadastrada. Informe o endereço desta loja em Integrações, no painel do cliente, e instale de novo.', { status: 404 })

  const q = new URLSearchParams({ client_id: app.id, scope: APP_SCOPES.join(','), redirect_uri: redirectUri(origin), state: makeState(slug) })
  return NextResponse.redirect(`https://${shop}/admin/oauth/authorize?${q.toString()}`)
}
