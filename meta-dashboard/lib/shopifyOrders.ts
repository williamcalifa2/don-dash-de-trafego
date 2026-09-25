/** Traduz pedidos e carrinhos da Shopify (webhook ou API) para o nosso formato, e importa o histórico de uma loja conectada. */
import { getSupabaseServer } from './supabase'
import { orderStatusFromShopify, upsertCheckout, type CheckoutInput, type EcommerceOrder } from './integrations'
import { SHOPIFY_API_VERSION, shopifyHost } from './shopifyCatalog'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = Record<string, any>

export function extractUtm(urlStr?: string | null): { utm_source?: string; utm_campaign?: string; utm_medium?: string } {
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

const contact = (p: Payload, shipping: Payload | undefined) => {
  const c = p.customer
  return {
    name: [c?.first_name, c?.last_name].filter(Boolean).join(' ') || shipping?.name || null,
    email: c?.email || p.email || null,
    phone: c?.phone || shipping?.phone || p.phone || null,
  }
}

/** Pedido da Shopify → nosso pedido. Vale para o webhook e para a API, que trazem o mesmo formato. */
export function mapShopifyOrder(clientId: string, p: Payload): EcommerceOrder {
  const status = orderStatusFromShopify(p)
  const total = parseFloat(p.current_total_price || p.total_price || '0') || 0
  const subtotal = parseFloat(p.current_subtotal_price || p.subtotal_price || '0') || total
  const who = contact(p, p.shipping_address || p.billing_address)
  const utms = { ...extractUtm(p.landing_site), ...extractUtm(p.referring_site) }
  if (Array.isArray(p.note_attributes)) {
    for (const a of p.note_attributes) {
      if (a.name === 'utm_source' && !utms.utm_source) utms.utm_source = a.value
      if (a.name === 'utm_campaign' && !utms.utm_campaign) utms.utm_campaign = a.value
      if (a.name === 'utm_medium' && !utms.utm_medium) utms.utm_medium = a.value
    }
  }
  const items = Array.isArray(p.line_items)
    ? p.line_items.map((it: any) => ({ name: it.title || it.name || 'Produto', quantity: Number(it.quantity || 1), price: parseFloat(it.price || '0') || 0, sku: it.sku || undefined }))
    : []
  return {
    client_id: clientId, platform: 'shopify', external_id: String(p.id),
    order_number: p.name || (p.order_number ? `#${p.order_number}` : null),
    status, total, subtotal, currency: p.currency || 'BRL',
    customer_name: who.name, customer_email: who.email, customer_phone: who.phone, items,
    utm_source: utms.utm_source, utm_campaign: utms.utm_campaign, utm_medium: utms.utm_medium,
    paid_at: status === 'paid' ? (p.processed_at || new Date().toISOString()) : null,
    created_at: p.created_at || new Date().toISOString(),
    raw_payload: p,
  }
}

/** Carrinho/checkout da Shopify → nosso carrinho. */
export function mapShopifyCheckout(clientId: string, p: Payload): CheckoutInput {
  const who = contact(p, p.shipping_address)
  const utms = { ...extractUtm(p.referring_site), ...extractUtm(p.landing_site) }
  return {
    client_id: clientId, external_id: String(p.id), token: p.token ?? null,
    customer_name: who.name, customer_email: who.email, customer_phone: who.phone,
    total: parseFloat(p.total_price || '0') || 0, currency: p.currency || 'BRL',
    items: Array.isArray(p.line_items) ? p.line_items.map((it: any) => ({ name: it.title || it.name || 'Produto', quantity: Number(it.quantity || 1), price: parseFloat(it.price || '0') || 0 })) : [],
    recover_url: p.abandoned_checkout_url ?? null,
    utm_source: utms.utm_source, utm_campaign: utms.utm_campaign, utm_medium: utms.utm_medium,
    created_at: p.created_at, updated_at: p.updated_at, completed_at: p.completed_at ?? null,
  }
}

/** Grava vários pedidos de uma vez (idempotente). */
async function saveOrders(orders: EcommerceOrder[]): Promise<number> {
  const db = getSupabaseServer()
  if (!db || !orders.length) return 0
  const rows = orders.map(o => ({
    client_id: o.client_id, platform: o.platform, external_id: String(o.external_id), order_number: o.order_number ?? null, status: o.status,
    total: o.total, subtotal: o.subtotal ?? o.total, currency: o.currency ?? 'BRL', customer_name: o.customer_name ?? null, customer_email: o.customer_email ?? null,
    customer_phone: o.customer_phone ?? null, items: o.items ?? [], utm_source: o.utm_source ?? null, utm_campaign: o.utm_campaign ?? null, utm_medium: o.utm_medium ?? null,
    paid_at: o.paid_at ?? null, raw_payload: o.raw_payload ?? null, created_at: o.created_at,
  }))
  const { error } = await db.from('ecommerce_orders').upsert(rows, { onConflict: 'client_id,platform,external_id' })
  if (error) throw new Error(`Não foi possível gravar os pedidos: ${error.message}`)
  return rows.length
}

async function get(host: string, token: string, path: string): Promise<{ json: any; next: string | null; status: number }> {
  const base = `https://${host}/admin/api/${SHOPIFY_API_VERSION}/`
  const res = await fetch(`${base}${path}`, { headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) return { json: null, next: null, status: res.status }
  const m = (res.headers.get('link') ?? '').match(/<([^>]+)>;\s*rel="next"/)
  return { json: await res.json(), next: m ? m[1].replace(base, '') : null, status: res.status }
}

export interface BackfillResult { orders: number; checkouts: number; days: number; note?: string }

/** Importa pedidos (e, se a Shopify permitir, carrinhos) dos últimos dias. Sem a permissão read_all_orders a Shopify só entrega ~60 dias. Não cria leads (só o que chega ao vivo cria). */
export async function backfillShopify(clientId: string, c: { domain?: string; token?: string }, days = 30): Promise<BackfillResult> {
  const host = shopifyHost(c.domain)
  if (!host || !c.token) throw new Error('Esta loja ainda não está conectada pelo app da Shopify.')
  const d = Math.min(60, Math.max(1, Math.round(days)))
  const since = new Date(Date.now() - d * 86_400_000).toISOString()

  let orders = 0
  let path: string | null = `orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since)}`
  for (let page = 0; path && page < 8; page++) {
    const r = await get(host, c.token, path)
    if (r.status === 401 || r.status === 403) throw new Error('A Shopify negou a leitura dos pedidos. Reinstale o app com a permissão read_orders.')
    if (!r.json) throw new Error(`A Shopify respondeu ${r.status} ao listar pedidos.`)
    orders += await saveOrders((r.json.orders ?? []).map((p: Payload) => mapShopifyOrder(clientId, p)))
    path = r.next
  }

  // Carrinhos abandonados: nem toda versão da API entrega; se recusar, segue só com pedidos.
  let checkouts = 0
  let note: string | undefined
  let cpath: string | null = `checkouts.json?limit=250&created_at_min=${encodeURIComponent(since)}`
  for (let page = 0; cpath && page < 4; page++) {
    const r = await get(host, c.token, cpath)
    if (!r.json) { note = 'A Shopify não entregou o histórico de carrinhos abandonados; eles passam a aparecer dos próximos em diante.'; break }
    for (const p of r.json.checkouts ?? []) { await upsertCheckout(mapShopifyCheckout(clientId, p)); checkouts++ }
    cpath = r.next
  }
  return { orders, checkouts, days: d, note }
}
