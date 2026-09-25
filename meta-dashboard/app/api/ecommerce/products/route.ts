import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { getClientConfig } from '@/lib/clientConfig'
import { canLoadCatalog, loadCatalog } from '@/lib/shopifyCatalog'

export const dynamic = 'force-dynamic'

/** Foto e link reais dos produtos da loja. Sem credenciais da Shopify, avisa que não está configurado (a tela não inventa foto). */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const i = (await getClientConfig(tenant.slug)).integrations ?? {}
  const creds = { storeUrl: i.shopifyStoreUrl, domain: i.shopifyDomain, token: i.shopifyToken, clientId: i.shopifyClientId, clientSecret: i.shopifyClientSecret }
  if (!canLoadCatalog(creds)) return NextResponse.json({ ok: true, configured: false, products: [] })
  try {
    const products = await loadCatalog(creds)
    return NextResponse.json({ ok: true, configured: true, products })
  } catch (e) {
    console.error('[ecommerce/products]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true, configured: true, products: [], error: 'Não foi possível ler os produtos da Shopify agora.' })
  }
}
