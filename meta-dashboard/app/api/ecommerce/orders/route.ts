import { NextRequest, NextResponse, after } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { getSupabaseServer } from '@/lib/supabase'
import { distinct, presetRangeBr } from '@/lib/ecomFunnel'
import { getClientConfig, setClientConfig } from '@/lib/clientConfig'
import { backfillShopify } from '@/lib/shopifyOrders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface TopProduct {
  name: string
  quantity: number
  revenue: number
  sku?: string
}

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant

  const db = getSupabaseServer()
  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')
  const search = searchParams.get('q')?.toLowerCase()
  const preset = searchParams.get('preset')
  const { since, until } = presetRangeBr(preset)

  try {
    let orders: any[] = []
    let isMock = false

    if (db) {
      let q = db
        .from('ecommerce_orders')
        .select('*')
        .eq('client_id', tenant.clientId)
        .gte('created_at', since)
        .lt('created_at', until ?? '9999-12-31')
        .order('created_at', { ascending: false })
        .limit(500)

      if (statusFilter && statusFilter !== 'all') {
        q = q.eq('status', statusFilter)
      }

      const { data, error } = await q
      if (!error && data && data.length > 0) {
        orders = data
      }
    }

    // Demonstração só para quem nunca recebeu um pedido real: período vazio de uma loja com pedidos mostra vazio, não pedido falso.
    let hasAnyOrder = orders.length > 0
    if (!hasAnyOrder && db) {
      const any = await db.from('ecommerce_orders').select('id', { count: 'exact', head: true }).eq('client_id', tenant.clientId)
      hasAnyOrder = (any.count ?? 0) > 0
    }
    if (orders.length === 0 && !hasAnyOrder) {
      isMock = true
      const now = Date.now()
      const dayMs = 86400000

      orders = [
        {
          id: 'demo-1',
          platform: 'shopify',
          order_number: '#1094',
          status: 'paid',
          total: 389.90,
          customer_name: 'Juliana Mendes',
          customer_email: 'juliana.mendes@email.com',
          customer_phone: '(11) 98765-4321',
          items: [
            { name: 'Kit Sérum Facial Rejuvenescedor', quantity: 2, price: 149.95 },
            { name: 'Espuma de Limpeza Suave', quantity: 1, price: 89.99 },
          ],
          utm_source: 'instagram',
          utm_campaign: 'Campanha Escala Feed',
          created_at: new Date(now - 45 * 60000).toISOString(),
          paid_at: new Date(now - 40 * 60000).toISOString(),
        },
        {
          id: 'demo-2',
          platform: 'shopify',
          order_number: '#1093',
          status: 'paid',
          total: 219.00,
          customer_name: 'Rodrigo Alves',
          customer_email: 'rodrigo.alves@email.com',
          customer_phone: '(21) 99876-1234',
          items: [
            { name: 'Hidratante Antioxidante FPS 50', quantity: 1, price: 219.00 },
          ],
          utm_source: 'facebook',
          utm_campaign: 'Remarketing Checkout',
          created_at: new Date(now - 3 * 3600000).toISOString(),
          paid_at: new Date(now - 3 * 3600000).toISOString(),
        },
        {
          id: 'demo-3',
          platform: 'nuvemshop',
          order_number: '#1092',
          status: 'pending',
          total: 450.00,
          customer_name: 'Camila Torres',
          customer_email: 'camila.torres@email.com',
          customer_phone: '(31) 98456-7890',
          items: [
            { name: 'Combo Glow Total (3 Itens)', quantity: 1, price: 450.00 },
          ],
          utm_source: 'instagram',
          utm_campaign: 'Reels Vendas Novas',
          created_at: new Date(now - 7 * 3600000).toISOString(),
          paid_at: null,
        },
        {
          id: 'demo-4',
          platform: 'shopify',
          order_number: '#1091',
          status: 'paid',
          total: 179.90,
          customer_name: 'Marcelo Castro',
          customer_email: 'marcelo.castro@email.com',
          customer_phone: '(41) 99123-4567',
          items: [
            { name: 'Gel Creme Noturno Revitalizante', quantity: 1, price: 179.90 },
          ],
          utm_source: 'google',
          utm_campaign: 'Pesquisa Institucional',
          created_at: new Date(now - 1 * dayMs).toISOString(),
          paid_at: new Date(now - 1 * dayMs).toISOString(),
        },
        {
          id: 'demo-5',
          platform: 'shopify',
          order_number: '#1090',
          status: 'cancelled',
          total: 299.00,
          customer_name: 'Fernanda Lima',
          customer_email: 'fernanda.lima@email.com',
          customer_phone: '(51) 98234-5678',
          items: [
            { name: 'Kit Sérum Facial Rejuvenescedor', quantity: 2, price: 149.50 },
          ],
          utm_source: 'instagram',
          utm_campaign: 'Campanha Escala Feed',
          created_at: new Date(now - 2 * dayMs).toISOString(),
          paid_at: null,
        },
      ]
    }

    if (search) {
      orders = orders.filter(o =>
        (o.order_number && o.order_number.toLowerCase().includes(search)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(search)) ||
        (o.customer_email && o.customer_email.toLowerCase().includes(search)) ||
        (o.utm_campaign && o.utm_campaign.toLowerCase().includes(search)) ||
        (Array.isArray(o.items) && o.items.some((it: any) => it.name?.toLowerCase().includes(search)))
      )
    }

    // Calcular estatísticas agregadas
    let totalRevenue = 0
    let paidCount = 0
    let pendingCount = 0
    let cancelledCount = 0

    const productMap = new Map<string, { quantity: number; revenue: number }>()

    for (const ord of orders) {
      const val = Number(ord.total || 0)
      if (ord.status === 'paid') {
        paidCount++
        totalRevenue += val
      } else if (ord.status === 'cancelled' || ord.status === 'refunded') {
        cancelledCount++
      } else {
        pendingCount++
      }

      if (Array.isArray(ord.items)) {
        for (const it of ord.items) {
          const name = it.name || 'Produto'
          const curr = productMap.get(name) || { quantity: 0, revenue: 0 }
          curr.quantity += Number(it.quantity || 1)
          if (ord.status === 'paid') {
            curr.revenue += (Number(it.price || 0) * Number(it.quantity || 1))
          }
          productMap.set(name, curr)
        }
      }
    }

    const topProducts: TopProduct[] = Array.from(productMap.entries())
      .map(([name, data]) => ({ name, quantity: data.quantity, revenue: data.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    const totalOrders = orders.length
    const averageTicket = paidCount > 0 ? totalRevenue / paidCount : 0
    const approvalRate = totalOrders > 0 ? (paidCount / totalOrders) * 100 : 0

    // Funil real dos últimos 30 dias: visitas, carrinho e checkout vêm do pixel; pedidos e pagos, da loja.
    const funnel = { pixel: false, sessions: 0, carts: 0, checkouts: 0, orders: 0, paid: 0 }
    if (db) {
      const [sess, carts, checks, ord, paidOrd] = await Promise.all([
        db.from('store_sessions').select('sid', { count: 'exact', head: true }).eq('client_id', tenant.clientId).gte('first_seen', since).lt('first_seen', until ?? '9999-12-31'),
        db.from('store_events').select('sid').eq('client_id', tenant.clientId).eq('type', 'cart').gte('created_at', since).lt('created_at', until ?? '9999-12-31').limit(20000),
        db.from('store_events').select('sid').eq('client_id', tenant.clientId).eq('type', 'checkout').gte('created_at', since).lt('created_at', until ?? '9999-12-31').limit(20000),
        db.from('ecommerce_orders').select('id', { count: 'exact', head: true }).eq('client_id', tenant.clientId).gte('created_at', since).lt('created_at', until ?? '9999-12-31'),
        db.from('ecommerce_orders').select('id', { count: 'exact', head: true }).eq('client_id', tenant.clientId).eq('status', 'paid').gte('created_at', since).lt('created_at', until ?? '9999-12-31'),
      ])
      funnel.pixel = !sess.error && (sess.count ?? 0) > 0
      funnel.sessions = sess.count ?? 0
      funnel.carts = distinct(((carts.data ?? []) as Array<{ sid: string }>).map(r => r.sid))
      funnel.checkouts = distinct(((checks.data ?? []) as Array<{ sid: string }>).map(r => r.sid))
      funnel.orders = ord.count ?? 0
      funnel.paid = paidOrd.count ?? 0
    }

    // Loja conectada pelo app que ainda não importou o histórico: importa sozinha, uma vez, em segundo plano.
    let importing = false
    try {
      const i = (await getClientConfig(tenant.slug)).integrations ?? {}
      if (db && i.shopifyToken && i.shopifyDomain && i.shopifyConnectedAt && !i.shopifyBackfilledAt) {
        importing = true
        await setClientConfig(tenant.slug, { integrations: { ...i, shopifyBackfilledAt: new Date().toISOString() } }) // marca antes, para outra aba aberta não repetir
        const clientId = tenant.clientId, domain = i.shopifyDomain, token = i.shopifyToken
        after(async () => { try { await backfillShopify(clientId, { domain, token }, 30) } catch (e) { console.error('[orders] histórico automático:', e instanceof Error ? e.message : e) } })
      }
    } catch { /* sem configuração: segue sem importar */ }

    return NextResponse.json({
      ok: true,
      is_mock: isMock,
      importing,
      period: { preset: preset ?? 'last_30d', since, until },
      funnel,
      orders,
      totals: {
        totalOrders,
        paidCount,
        pendingCount,
        cancelledCount,
        totalRevenue,
        averageTicket,
        approvalRate,
      },
      topProducts,
    })
  } catch (err) {
    console.error('[/api/ecommerce/orders] erro:', err)
    return NextResponse.json({ error: 'Erro ao carregar dados de e-commerce' }, { status: 500 })
  }
}

