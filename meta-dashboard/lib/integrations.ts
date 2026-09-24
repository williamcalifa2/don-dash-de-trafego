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

