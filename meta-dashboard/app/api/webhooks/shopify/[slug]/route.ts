import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { getClientConfig } from '@/lib/clientConfig'
import { verifyShopifyHmac, upsertEcommerceOrder } from '@/lib/integrations'
import { insertLead } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function extractUtm(urlStr?: string | null): { utm_source?: string; utm_campaign?: string; utm_medium?: string } {
  if (!urlStr) return {}
  try {
    const url = new URL(urlStr.startsWith('http') ? urlStr : `https://dummy.local${urlStr.startsWith('/') ? '' : '/'}${urlStr}`)
    return {
      utm_source: url.searchParams.get('utm_source') || undefined,
      utm_campaign: url.searchParams.get('utm_campaign') || undefined,
      utm_medium: url.searchParams.get('utm_medium') || undefined,
    }
  } catch {
    return {}
  }
}

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

  // Se o cliente cadastrou um segredo da Shopify, valida obrigatoriamente a assinatura HMAC
  if (secret) {
    const signature = req.headers.get('x-shopify-hmac-sha256')
    if (!verifyShopifyHmac(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 })
    }
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const topic = req.headers.get('x-shopify-topic') || 'orders/create'

  try {
    if (topic.startsWith('orders/')) {
      const financialStatus = payload.financial_status
      const cancelledAt = payload.cancelled_at
      let status: 'pending' | 'paid' | 'cancelled' | 'refunded' = 'pending'

      if (cancelledAt || financialStatus === 'voided') {
        status = 'cancelled'
      } else if (financialStatus === 'refunded') {
        status = 'refunded'
      } else if (financialStatus === 'paid') {
        status = 'paid'
      }

      const total = parseFloat(payload.current_total_price || payload.total_price || '0') || 0
      const subtotal = parseFloat(payload.current_subtotal_price || payload.subtotal_price || '0') || total
      const customer = payload.customer
      const shipping = payload.shipping_address || payload.billing_address

      const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || shipping?.name || null
      const customerEmail = customer?.email || payload.email || null
      const customerPhone = customer?.phone || shipping?.phone || payload.phone || null

      const utms = {
        ...extractUtm(payload.landing_site),
        ...extractUtm(payload.referring_site),
      }

      // Procura UTMs adicionais em note_attributes
      if (Array.isArray(payload.note_attributes)) {
        for (const attr of payload.note_attributes) {
          if (attr.name === 'utm_source' && !utms.utm_source) utms.utm_source = attr.value
          if (attr.name === 'utm_campaign' && !utms.utm_campaign) utms.utm_campaign = attr.value
          if (attr.name === 'utm_medium' && !utms.utm_medium) utms.utm_medium = attr.value
        }
      }

      const items = Array.isArray(payload.line_items)
        ? payload.line_items.map((it: any) => ({
            name: it.title || it.name || 'Produto',
            quantity: Number(it.quantity || 1),
            price: parseFloat(it.price || '0') || 0,
            sku: it.sku || undefined,
          }))
        : []

      const orderResult = await upsertEcommerceOrder({
        client_id: client.id,
        platform: 'shopify',
        external_id: String(payload.id),
        order_number: payload.name || (payload.order_number ? `#${payload.order_number}` : null),
        status,
        total,
        subtotal,
        currency: payload.currency || 'BRL',
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        items,
        utm_source: utms.utm_source,
        utm_campaign: utms.utm_campaign,
        utm_medium: utms.utm_medium,
        paid_at: status === 'paid' ? (payload.processed_at || new Date().toISOString()) : null,
        created_at: payload.created_at || new Date().toISOString(),
        raw_payload: payload,
      })

      // Se temos contato do cliente, registra / atualiza o lead no CRM
      if (customerPhone || customerEmail) {
        await insertLead(client.id, {
          nome: customerName,
          telefone: customerPhone,
          email: customerEmail,
          status: status === 'paid' ? 'Convertido' : 'Novo',
          valor_pedido: total,
          campanha: utms.utm_campaign || 'Shopify',
          origem: 'shopify',
          notas: `Pedido Shopify ${payload.name || payload.id} (${status})`,
        }, db).catch(() => {})
      }

      return NextResponse.json({ ok: true, topic, order_id: orderResult.id })
    }

    if (topic.startsWith('checkouts/')) {
      // Carrinho criado ou atualizado
      const total = parseFloat(payload.total_price || '0') || 0
      const customer = payload.customer
      const shipping = payload.shipping_address
      const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || shipping?.name || null
      const customerEmail = customer?.email || payload.email || null
      const customerPhone = customer?.phone || shipping?.phone || payload.phone || null

      if (customerPhone || customerEmail) {
        const utms = extractUtm(payload.landing_site)
        await insertLead(client.id, {
          nome: customerName,
          telefone: customerPhone,
          email: customerEmail,
          status: 'Novo',
          valor_pedido: total > 0 ? total : null,
          campanha: utms.utm_campaign || 'Carrinho Abandonado',
          origem: 'shopify_checkout',
          notas: `Checkout Shopify ${payload.token || payload.id}`,
        }, db).catch(() => {})
      }

      return NextResponse.json({ ok: true, topic, checkout_id: payload.id })
    }

    return NextResponse.json({ ok: true, ignored: topic })
  } catch (err) {
    console.error('[shopify-webhook] erro ao processar:', err)
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 })
  }
}

