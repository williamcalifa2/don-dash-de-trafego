import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { getClientConfig } from '@/lib/clientConfig'
import { canLoadCatalog, loadCatalog } from '@/lib/shopifyCatalog'

export const dynamic = 'force-dynamic'

/** Testa as credenciais salvas: lê o catálogo e diz quantos produtos (e quantos com foto) vieram. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const isStaff = !(await requireAdmin(req)) || !(await requireRole(req, 'member'))
  if (!isStaff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const i = (await getClientConfig(slug)).integrations ?? {}
  const creds = { storeUrl: i.shopifyStoreUrl, domain: i.shopifyDomain, token: i.shopifyToken, clientId: i.shopifyClientId, clientSecret: i.shopifyClientSecret }
  if (!canLoadCatalog(creds)) return NextResponse.json({ ok: false, message: 'Preencha o endereço público da loja e salve antes de testar.' })
  try {
    const products = await loadCatalog(creds, true)
    return NextResponse.json({ ok: true, message: `Conectado. ${products.length} produto(s) lido(s), ${products.filter(p => p.image).length} com foto.` })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Falha ao conectar na Shopify.' })
  }
}
