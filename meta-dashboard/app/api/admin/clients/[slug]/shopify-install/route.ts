import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { appCredentials, installUrl } from '@/lib/shopifyApp'
import { shopifyHost } from '@/lib/shopifyCatalog'
import { getClientConfig, setClientConfig } from '@/lib/clientConfig'

export const dynamic = 'force-dynamic'

/** Gera o link que o dono da loja abre para instalar o app. Só a equipe. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const isStaff = !(await requireAdmin(req)) || !(await requireRole(req, 'member'))
  if (!isStaff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!appCredentials()) return NextResponse.json({ ok: false, message: 'O app da Shopify ainda não está configurado no servidor (faltam SHOPIFY_APP_CLIENT_ID e SHOPIFY_APP_CLIENT_SECRET na Vercel).' })

  const body = await req.json().catch(() => ({})) as { shop?: string }
  const shop = shopifyHost(body.shop)
  if (!shop) return NextResponse.json({ ok: false, message: 'Informe o endereço da loja no formato nomedaloja.myshopify.com.' })

  // Guarda a loja no cliente: é por ela que o retorno da instalação descobre de quem é.
  const cur = (await getClientConfig(slug)).integrations ?? {}
  await setClientConfig(slug, { integrations: { ...cur, shopifyDomain: shop } })
  const url = installUrl(shop, slug, req.nextUrl.origin)
  return NextResponse.json({ ok: Boolean(url), url, shop })
}
