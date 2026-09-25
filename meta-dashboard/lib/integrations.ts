import crypto from 'node:crypto'
import { getSupabaseServer } from './supabase'
import { getClientConfig } from './clientConfig'
import type { Lead, LeadStatus } from './leadTypes'

export interface EcommerceOrder {
  id?: string
  client_id: string
  platform: 'shopify' | 'nuvemshop' | 'woocommerce' | 'custom'
  external_id: string
  order_number?: string | null
  status: 'pending' | 'paid' | 'cancelled' | 'refunded'
  total: number
  subtotal?: number | null
  currency?: string
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  items?: Array<{ name: string; quantity: number; price: number; sku?: string }>
  utm_source?: string | null
  utm_campaign?: string | null
  utm_medium?: string | null
  created_at?: string
  paid_at?: string | null
  raw_payload?: unknown
}

export interface EcommerceTotals {
  ordersCount: number
  paidCount: number
  totalRevenue: number
  averageTicket: number
  pendingCount: number
  cancelledCount: number
}

/** Compara duas strings em tempo constante para evitar timing attacks */
export function safeEqual(a: string, b: string): boolean {
  try {
    const x = Buffer.from(a)
    const y = Buffer.from(b)
    return x.length === y.length && crypto.timingSafeEqual(x, y)
  } catch {
    return false
  }
}

/** Gera um token seguro de webhook com 32 caracteres hexadecimais */
export function generateWebhookToken(): string {
  return crypto.randomBytes(16).toString('hex')
}

/** Valida a assinatura HMAC-SHA256 enviada no cabeçalho x-shopify-hmac-sha256 da Shopify */
export function verifyShopifyHmac(rawBody: string, signature: string | null | undefined, secret: string): boolean {
  if (!signature || !secret) return false
  try {
    const calculated = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64')
    return safeEqual(calculated, signature)
  } catch {
    return false
  }
}

/** Calcula se o lead cumpriu ou estourou o SLA com base na data de entrada e na meta da conta */
export function computeSla(
  createdAtStr: string,
  primeiroContatoStr?: string | null,
  slaTargetMinutes = 15
): {
  tempoSegundos: number
  violado: boolean
  restanteSegundos: number
} {
  const created = new Date(createdAtStr).getTime()
  const targetMs = slaTargetMinutes * 60 * 1000
  const deadline = created + targetMs
  const now = Date.now()

  if (primeiroContatoStr) {
    const contacted = new Date(primeiroContatoStr).getTime()
    const elapsedSeg = Math.max(0, Math.round((contacted - created) / 1000))
    const violado = contacted > deadline
    return {
      tempoSegundos: elapsedSeg,
      violado,
      restanteSegundos: 0,
    }
  }

  // Ainda não contatado
  const elapsedSeg = Math.max(0, Math.round((now - created) / 1000))
  const remainingSeg = Math.round((deadline - now) / 1000)
  const violado = remainingSeg < 0

  return {
    tempoSegundos: elapsedSeg,
    violado,
    restanteSegundos: remainingSeg,
  }
}

/** Grava ou atualiza um pedido no banco Supabase de forma idempotente */
export async function upsertEcommerceOrder(order: EcommerceOrder): Promise<{ id: string; isNew: boolean }> {
  const db = getSupabaseServer()
  if (!db) throw new Error('Supabase não configurado')

  const row = {
    client_id: order.client_id,
    platform: order.platform,
    external_id: String(order.external_id),
    order_number: order.order_number ?? null,
    status: order.status,
    total: order.total,
    subtotal: order.subtotal ?? order.total,
    currency: order.currency ?? 'BRL',
    customer_name: order.customer_name ?? null,
    customer_email: order.customer_email ?? null,
    customer_phone: order.customer_phone ?? null,
    items: order.items ?? [],
    utm_source: order.utm_source ?? null,
    utm_campaign: order.utm_campaign ?? null,
    utm_medium: order.utm_medium ?? null,
    paid_at: order.paid_at ?? (order.status === 'paid' ? new Date().toISOString() : null),
    raw_payload: order.raw_payload ?? null,
    ...(order.created_at ? { created_at: order.created_at } : {}),
  }

  // Upsert com onConflict por client_id + platform + external_id
  const { data, error } = await db
    .from('ecommerce_orders')
    .upsert(row, {
      onConflict: 'client_id,platform,external_id',
    })
    .select('id, created_at')
    .single()

  if (error) {
    // Caso a tabela ainda não exista em ambiente sem migration rodada, loga sem travar
    console.warn('[ecommerce_orders] erro ao salvar pedido:', error.message)
    return { id: 'mock', isNew: true }
  }

  return { id: data.id, isNew: true }
}

/** Busca totais agregados de e-commerce para um cliente em um período */
export async function getEcommerceTotals(
  clientId: string,
  startDate?: string,
  endDate?: string
): Promise<EcommerceTotals> {
  const db = getSupabaseServer()
  const fallback: EcommerceTotals = {
    ordersCount: 0,
    paidCount: 0,
    totalRevenue: 0,
    averageTicket: 0,
    pendingCount: 0,
    cancelledCount: 0,
  }

  if (!db) return fallback

  try {
    let q = db
      .from('ecommerce_orders')
      .select('status, total, created_at, paid_at')
      .eq('client_id', clientId)

    if (startDate) q = q.gte('created_at', startDate)
    if (endDate) q = q.lte('created_at', endDate)

    const { data, error } = await q

    if (error || !data) return fallback

    let ordersCount = 0
    let paidCount = 0
    let totalRevenue = 0
    let pendingCount = 0
    let cancelledCount = 0

    for (const ord of data as Array<{ status: string; total: number }>) {
      ordersCount++
      if (ord.status === 'paid') {
        paidCount++
        totalRevenue += Number(ord.total || 0)
      } else if (ord.status === 'cancelled' || ord.status === 'refunded') {
        cancelledCount++
      } else {
        pendingCount++
      }
    }

    const averageTicket = paidCount > 0 ? totalRevenue / paidCount : 0

    return {
      ordersCount,
      paidCount,
      totalRevenue,
      averageTicket,
      pendingCount,
      cancelledCount,
    }
  } catch {
    return fallback
  }
}

/**
 * Registra o primeiro contato humano com um lead (fecha o ciclo do SLA)
 */
export async function markLeadContacted(
  clientId: string,
  leadId: string,
  atendidoPor?: string | null,
  contactedAt?: string
): Promise<void> {
  const db = getSupabaseServer()
  if (!db) return

  const { data: lead } = await db
    .from('leads')
    .select('created_at, primeiro_contato')
    .eq('id', leadId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!lead) return

  const contactTime = contactedAt || new Date().toISOString()
  const updates: Record<string, unknown> = {
    ultimo_contato: contactTime,
    ...(atendidoPor ? { atendido_por: atendidoPor } : {}),
  }

  // Se ainda não tinha primeiro contato registrado, computa o SLA
  if (!lead.primeiro_contato) {
    const elapsedSeg = Math.max(0, Math.round((new Date(contactTime).getTime() - new Date(lead.created_at).getTime()) / 1000))
    updates.primeiro_contato = contactTime
    updates.tempo_primeiro_contato_seg = elapsedSeg

    // Busca meta de SLA do cliente
    try {
      const { data: client } = await db.from('clients').select('slug').eq('id', clientId).maybeSingle()
      if (client?.slug) {
        const cfg = await getClientConfig(client.slug)
        const targetMin = cfg.integrations?.slaTargetMinutes ?? 15
        updates.sla_violado = elapsedSeg > targetMin * 60
      }
    } catch { }
  }

  await db.from('leads').update(updates).eq('id', leadId).eq('client_id', clientId)
}


// ─── Status, reembolsos, exclusão e carrinhos ────────────────────────────────

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded'

/** Status do pedido a partir do que a Shopify manda. Reembolso parcial continua "pago" (o valor já vem líquido em current_total_price). */
export function orderStatusFromShopify(p: { financial_status?: string | null; cancelled_at?: string | null }): OrderStatus {
  if (p.cancelled_at || p.financial_status === 'voided') return 'cancelled'
  if (p.financial_status === 'refunded') return 'refunded'
  if (p.financial_status === 'paid' || p.financial_status === 'partially_refunded') return 'paid'
  return 'pending'
}

interface ShopifyRefund { id?: number | string; transactions?: Array<{ kind?: string; status?: string; amount?: string | number }>; refund_line_items?: Array<{ subtotal?: string | number }> }

/** Valor devolvido: soma as transações de reembolso concluídas; sem elas, o subtotal dos itens devolvidos. */
export function refundAmount(r: ShopifyRefund): number {
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }
  const tx = (r.transactions ?? []).filter(t => t.kind === 'refund' && (t.status ?? 'success') === 'success').reduce((s, t) => s + num(t.amount), 0)
  if (tx > 0) return Math.round(tx * 100) / 100
  return Math.round((r.refund_line_items ?? []).reduce((s, l) => s + num(l.subtotal), 0) * 100) / 100
}

/** Aplica um reembolso ao pedido sem contar duas vezes: se o webhook do pedido (orders/updated) já trouxe este reembolso, não faz nada. */
export function applyRefund(order: { total: number; status: OrderStatus; refundIds: string[] }, refund: ShopifyRefund): { skip: boolean; total: number; status: OrderStatus; refundIds: string[] } {
  const id = String(refund.id ?? '')
  if (!id || order.refundIds.includes(id) || order.status === 'cancelled') return { skip: true, total: order.total, status: order.status, refundIds: order.refundIds }
  const total = Math.max(0, Math.round((order.total - refundAmount(refund)) * 100) / 100)
  return { skip: false, total, status: total === 0 ? 'refunded' : order.status, refundIds: [...order.refundIds, id] }
}

/** Ids dos reembolsos que o payload do pedido já contém. */
export const refundIdsOf = (payload: unknown): string[] =>
  ((payload as { refunds?: Array<{ id?: number | string }> } | null)?.refunds ?? []).map(r => String(r.id ?? '')).filter(Boolean)

export async function applyShopifyRefund(clientId: string, orderExternalId: string, refund: ShopifyRefund): Promise<'applied' | 'skipped' | 'no-order'> {
  const db = getSupabaseServer()
  if (!db) throw new Error('Supabase não configurado')
  const { data } = await db.from('ecommerce_orders').select('id, total, status, raw_payload').eq('client_id', clientId).eq('platform', 'shopify').eq('external_id', orderExternalId).maybeSingle()
  if (!data) return 'no-order'
  const row = data as { id: string; total: number | string; status: OrderStatus; raw_payload: unknown }
  const r = applyRefund({ total: Number(row.total), status: row.status, refundIds: refundIdsOf(row.raw_payload) }, refund)
  if (r.skip) return 'skipped'
  const raw = { ...((row.raw_payload as object | null) ?? {}), refunds: r.refundIds.map(id => ({ id })) }
  await db.from('ecommerce_orders').update({ total: r.total, status: r.status, raw_payload: raw }).eq('id', row.id)
  return 'applied'
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`)
const leadNote = (orderName: string, status: string) => `Pedido Shopify ${orderName} (${status})`

/** Um lead por pedido: atualiza o existente em vez de criar outro a cada evento da Shopify. Não rebaixa o status que a equipe já avançou. */
export async function upsertOrderLead(clientId: string, orderName: string, lead: { nome: string | null; telefone: string | null; email: string | null; total: number; status: OrderStatus; campanha: string }): Promise<void> {
  const db = getSupabaseServer()
  if (!db) return
  const notas = leadNote(orderName, lead.status)
  const { data } = await db.from('leads').select('id').eq('client_id', clientId).eq('origem', 'shopify').like('notas', `${likeEscape(`Pedido Shopify ${orderName} (`)}%`).limit(1)
  const existing = (data as Array<{ id: string }> | null)?.[0]
  if (existing) {
    await db.from('leads').update({ ...(lead.status === 'paid' ? { status: 'Convertido' } : {}), valor_pedido: lead.total, notas, nome: lead.nome, telefone: lead.telefone, email: lead.email }).eq('id', existing.id)
    return
  }
  const row = { client_id: clientId, nome: lead.nome, telefone: lead.telefone, email: lead.email, status: lead.status === 'paid' ? 'Convertido' : 'Novo', valor_pedido: lead.total, campanha: lead.campanha, origem: 'shopify', notas }
  await db.from('leads').insert(row)
}

/** Pedido excluído na Shopify: some do app junto com o lead que ele gerou. */
export async function deleteShopifyOrder(clientId: string, externalId: string): Promise<boolean> {
  const db = getSupabaseServer()
  if (!db) throw new Error('Supabase não configurado')
  const { data } = await db.from('ecommerce_orders').select('id, order_number').eq('client_id', clientId).eq('platform', 'shopify').eq('external_id', externalId).maybeSingle()
  if (!data) return false
  const row = data as { id: string; order_number: string | null }
  await db.from('ecommerce_orders').delete().eq('id', row.id)
  if (row.order_number) await db.from('leads').delete().eq('client_id', clientId).eq('origem', 'shopify').like('notas', `${likeEscape(`Pedido Shopify ${row.order_number} (`)}%`)
  return true
}

export interface CheckoutInput {
  client_id: string
  external_id: string
  token?: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  total: number
  currency: string
  items: Array<{ name: string; quantity: number; price: number }>
  recover_url: string | null
  utm_source?: string
  utm_campaign?: string
  utm_medium?: string
  created_at?: string
  updated_at?: string
  completed_at?: string | null
}

/** Guarda o carrinho. Um evento atrasado nunca "reabre" um carrinho já concluído (completed_at só entra quando vem preenchido). */
export async function upsertCheckout(c: CheckoutInput): Promise<void> {
  const db = getSupabaseServer()
  if (!db) return
  const row = {
    client_id: c.client_id, platform: 'shopify', external_id: c.external_id, token: c.token ?? null,
    customer_name: c.customer_name, customer_email: c.customer_email, customer_phone: c.customer_phone,
    total: c.total, currency: c.currency, items: c.items, recover_url: c.recover_url,
    utm_source: c.utm_source ?? null, utm_campaign: c.utm_campaign ?? null, utm_medium: c.utm_medium ?? null,
    updated_at: c.updated_at ?? new Date().toISOString(),
    ...(c.created_at ? { created_at: c.created_at } : {}),
    ...(c.completed_at ? { completed_at: c.completed_at } : {}),
  }
  const { error } = await db.from('ecommerce_checkouts').upsert(row, { onConflict: 'client_id,platform,external_id' })
  if (error) console.warn('[ecommerce_checkouts] erro ao salvar carrinho:', error.message)
}

/** O pedido saiu deste carrinho: deixa de ser abandonado. */
export async function completeCheckout(clientId: string, checkoutId: string | number | null | undefined): Promise<void> {
  const db = getSupabaseServer()
  if (!db || checkoutId == null || checkoutId === '') return
  await db.from('ecommerce_checkouts').update({ completed_at: new Date().toISOString() }).eq('client_id', clientId).eq('platform', 'shopify').eq('external_id', String(checkoutId)).is('completed_at', null)
}

/** Carrinho sem atividade há mais que isso e não concluído conta como abandonado. */
export const ABANDON_AFTER_MS = 60 * 60_000

export interface CheckoutRow { id: string; customer_name: string | null; customer_email: string | null; customer_phone: string | null; total: number | string; currency: string; items: Array<{ name: string; quantity: number; price: number }> | null; recover_url: string | null; utm_source: string | null; utm_campaign: string | null; created_at: string; updated_at: string; completed_at: string | null }

export function summarizeCheckouts(rows: CheckoutRow[], now = Date.now()) {
  const abandoned = rows.filter(r => !r.completed_at && now - Date.parse(r.updated_at) >= ABANDON_AFTER_MS)
  const completed = rows.filter(r => r.completed_at).length
  const contactable = abandoned.filter(r => r.customer_phone || r.customer_email)
  const sum = (l: CheckoutRow[]) => Math.round(l.reduce((s, r) => s + Number(r.total || 0), 0) * 100) / 100
  return {
    abandonedCount: abandoned.length,
    abandonedValue: sum(abandoned),
    contactableCount: contactable.length,
    completedCount: completed,
    totalCount: rows.length,
    conversionRate: rows.length > 0 ? (completed / rows.length) * 100 : 0,
    list: contactable.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 100),
  }
}
