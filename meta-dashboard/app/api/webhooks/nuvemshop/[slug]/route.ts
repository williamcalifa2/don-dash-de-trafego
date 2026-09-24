import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { getClientConfig } from '@/lib/clientConfig'
import { safeEqual, upsertEcommerceOrder } from '@/lib/integrations'
import { insertLead } from '@/lib/supabase'

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

  const cfg = await getClientConfig(slug)
  const expectedToken = cfg.integrations?.nuvemshopSecret || cfg.integrations?.webhookToken

  if (expectedToken) {
    const receivedToken =
      req.headers.get('x-webhook-token') ||
      req.headers.get('x-nuvemshop-token') ||
      new URL(req.url).searchParams.get('token')

    if (!receivedToken || !safeEqual(receivedToken, expectedToken)) {
      return NextResponse.json({ error: 'Unauthorized webhook token' }, { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const event = payload.event || req.headers.get('x-event') || 'order/created'

  try {
    // Pedidos Nuvemshop
    const paymentStatus = payload.payment_status || (payload.status === 'paid' ? 'paid' : 'pending')
    let status: 'pending' | 'paid' | 'cancelled' | 'refunded' = 'pending'

    if (payload.status === 'cancelled' || paymentStatus === 'voided') {
      status = 'cancelled'
    } else if (paymentStatus === 'refunded') {
      status = 'refunded'
    } else if (paymentStatus === 'paid') {
      status = 'paid'
    }

    const total = parseFloat(payload.total || payload.subtotal || '0') || 0
    const customer = payload.customer
    const customerName = customer?.name || payload.contact_name || null
    const customerEmail = customer?.email || payload.contact_email || null
    const customerPhone = customer?.phone || payload.contact_phone || null

    const items = Array.isArray(payload.products)
      ? payload.products.map((p: any) => ({
          name: p.name || 'Produto',
          quantity: Number(p.quantity || 1),
          price: parseFloat(p.price || '0') || 0,
          sku: p.sku || undefined,
        }))
      : []

    const orderResult = await upsertEcommerceOrder({
      client_id: client.id,
      platform: 'nuvemshop',
      external_id: String(payload.id),
      order_number: payload.number ? `#${payload.number}` : null,
      status,
      total,
      subtotal: parseFloat(payload.subtotal || '0') || total,
      currency: payload.currency || 'BRL',
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      items,
      paid_at: status === 'paid' ? (payload.paid_at || new Date().toISOString()) : null,
      created_at: payload.created_at || new Date().toISOString(),
      raw_payload: payload,
    })

    if (customerPhone || customerEmail) {
      await insertLead(client.id, {
        nome: customerName,
        telefone: customerPhone,
        email: customerEmail,
        status: status === 'paid' ? 'Convertido' : 'Novo',
        valor_pedido: total,
        campanha: 'Nuvemshop',
        origem: 'nuvemshop',
        notas: `Pedido Nuvemshop #${payload.number || payload.id} (${status})`,
      }, db).catch(() => {})
    }

    return NextResponse.json({ ok: true, event, order_id: orderResult.id })
  } catch (err) {
    console.error('[nuvemshop-webhook] erro ao processar:', err)
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 })
  }
}

