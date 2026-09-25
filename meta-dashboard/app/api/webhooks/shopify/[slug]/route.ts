import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { getClientConfig, setClientConfig } from '@/lib/clientConfig'
import { applyShopifyRefund, completeCheckout, deleteShopifyOrder, upsertCheckout, upsertEcommerceOrder, upsertOrderLead } from '@/lib/integrations'
import { shopifyWebhookAuthorized } from '@/lib/shopifyApp'
import { mapShopifyCheckout, mapShopifyOrder } from '@/lib/shopifyOrders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

  const { data: client } = await db
    .from('clients')
    .select('id, slug, display_name')
    .eq('slug', slug)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const rawBody = await req.text()
  const cfg = await getClientConfig(slug)
  const secret = cfg.integrations?.shopifySecret

  // A assinatura é obrigatória: vale a chave cadastrada à mão pelo cliente, ou o segredo do app (só para a loja conectada por ele).
  const signature = req.headers.get('x-shopify-hmac-sha256')
  const authorized = shopifyWebhookAuthorized({
    raw: rawBody, signature, shopHeader: req.headers.get('x-shopify-shop-domain'),
    storeSecret: secret, connectedShop: cfg.integrations?.shopifyDomain, appSecret: process.env.SHOPIFY_APP_CLIENT_SECRET,
  })
  if (!authorized) {
    return NextResponse.json({ error: secret || cfg.integrations?.shopifyConnectedAt ? 'Invalid HMAC signature' : 'Segredo da Shopify não cadastrado para este cliente' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const topic = req.headers.get('x-shopify-topic') || 'orders/create'

  // O dono desinstalou o app: o token deixa de valer, então tira do cliente.
  if (topic === 'app/uninstalled') {
    const cur = cfg.integrations ?? {}
    await setClientConfig(slug, { integrations: { ...cur, shopifyToken: undefined, shopifyScopes: undefined, shopifyConnectedAt: undefined, shopifyWebhooks: undefined } })
    return NextResponse.json({ ok: true, topic })
  }

  try {
    if (topic.startsWith('orders/')) {
      const order = mapShopifyOrder(client.id, payload)
      const { status, total } = order
      const orderResult = await upsertEcommerceOrder(order)

      // Um lead por pedido: os eventos seguintes (pago, atualizado) atualizam o mesmo lead.
      if (order.customer_phone || order.customer_email) {
        await upsertOrderLead(client.id, payload.name || `#${payload.order_number ?? payload.id}`, {
          nome: order.customer_name ?? null, telefone: order.customer_phone ?? null, email: order.customer_email ?? null, total, status, campanha: order.utm_campaign || 'Shopify',
        }).catch(() => {})
      }

      // O pedido fechou o carrinho de origem: deixa de contar como abandonado.
      await completeCheckout(client.id, payload.checkout_id).catch(() => {})

      return NextResponse.json({ ok: true, topic, order_id: orderResult.id })
    }

    if (topic.startsWith('checkouts/')) {
      await upsertCheckout(mapShopifyCheckout(client.id, payload))
      return NextResponse.json({ ok: true, topic, checkout_id: payload.id })
    }

    if (topic === 'refunds/create') {
      const result = await applyShopifyRefund(client.id, String(payload.order_id), payload)
      return NextResponse.json({ ok: true, topic, result })
    }

    if (topic === 'orders/delete') {
      const removed = await deleteShopifyOrder(client.id, String(payload.id))
      return NextResponse.json({ ok: true, topic, removed })
    }

    return NextResponse.json({ ok: true, ignored: topic })
  } catch (err) {
    console.error('[shopify-webhook] erro ao processar:', err)
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 })
  }
}

