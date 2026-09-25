import { NextRequest, NextResponse } from 'next/server'
import { findSlugByShop, getClientConfig, setClientConfig } from '@/lib/clientConfig'
import { appCredentials, exchangeCode, readState, registerWebhooks, verifyOAuthQuery } from '@/lib/shopifyApp'
import { shopifyHost } from '@/lib/shopifyCatalog'
import { backfillShopify } from '@/lib/shopifyOrders'
import { getSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const page = (origin: string, slug: string | null, result: string) =>
  NextResponse.redirect(slug ? `${origin}/dashboard/${slug}?tab=integracoes&shopify=${result}` : `${origin}/login`)

/** Volta da instalação do app: confere a assinatura e o estado, troca o código pelo token, guarda no cliente e cadastra os webhooks. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const params = req.nextUrl.searchParams
  const app = appCredentials()
  const shop = shopifyHost(params.get('shop'))
  const code = params.get('code')
  if (!app || !shop || !code || !verifyOAuthQuery(params, app.secret)) return page(origin, readState(params.get('state')), 'invalid')

  // Instalação iniciada por nós traz o estado; a iniciada pela Shopify (link de distribuição) só traz a loja, que casamos com o cliente cadastrado.
  const slug = readState(params.get('state')) ?? await findSlugByShop(shop)
  if (!slug) return page(origin, null, 'invalid')

  try {
    const { token, scope } = await exchangeCode(shop, code)
    const cur = (await getClientConfig(slug)).integrations ?? {}
    const hooks = await registerWebhooks(shop, token, `${origin}/api/webhooks/shopify/${slug}`)
    await setClientConfig(slug, { integrations: { ...cur, shopifyDomain: shop, shopifyToken: token, shopifyClientId: undefined, shopifyClientSecret: undefined, shopifyScopes: scope, shopifyConnectedAt: new Date().toISOString(), shopifyBackfilledAt: new Date().toISOString(), shopifyWebhooks: hooks.ok } })
    // Já traz o último mês de pedidos, para o painel não começar vazio. Falha aqui não derruba a instalação.
    const db = getSupabaseServer()
    const { data: client } = db ? await db.from('clients').select('id').eq('slug', slug).maybeSingle() : { data: null }
    if (client) await backfillShopify((client as { id: string }).id, { domain: shop, token }, 30).catch(e => console.error('[shopify-callback] histórico:', e instanceof Error ? e.message : e))
    if (hooks.failed.length) console.error('[shopify-callback] webhooks que falharam:', slug, hooks.failed)
    return page(origin, slug, hooks.failed.length ? 'partial' : 'ok')
  } catch (e) {
    console.error('[shopify-callback]', slug, e instanceof Error ? e.message : e)
    return page(origin, slug, 'error')
  }
}
