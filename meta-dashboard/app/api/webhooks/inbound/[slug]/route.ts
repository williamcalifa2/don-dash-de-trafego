import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer, insertLead } from '@/lib/supabase'
import { getClientConfig } from '@/lib/clientConfig'
import { safeEqual, markLeadContacted, upsertEcommerceOrder } from '@/lib/integrations'

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
  const expectedToken = cfg.integrations?.webhookToken

  if (expectedToken) {
    const authHeader = req.headers.get('authorization')
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const headerToken = req.headers.get('x-webhook-token')
    const queryToken = new URL(req.url).searchParams.get('token')
    const received = bearer || headerToken || queryToken

    if (!received || !safeEqual(received, expectedToken)) {
      return NextResponse.json({ error: 'Invalid or missing webhook token' }, { status: 401 })
    }
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Ping de teste
  if (body.tipo === 'ping' || body.event === 'ping') {
    return NextResponse.json({
      ok: true,
      message: `Conexão bem-sucedida com o cliente ${client.display_name || client.slug}`,
      timestamp: new Date().toISOString(),
    })
  }

  const tipo = body.tipo || body.type || (body.contacted_at || body.atendido_por ? 'atendimento' : 'lead')

  try {
    // 1. Registro de atendimento / fechamento de SLA
    if (tipo === 'atendimento' || tipo === 'contact') {
      let targetLeadId = body.lead_id || body.id

      // Se não enviou o ID, tenta achar pelo telefone ou email
      if (!targetLeadId && (body.telefone || body.phone || body.email)) {
        const phone = body.telefone || body.phone
        const email = body.email
        let q = db.from('leads').select('id').eq('client_id', client.id)
        if (phone) q = q.eq('telefone', phone)
        else if (email) q = q.eq('email', email)
        const { data: match } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (match?.id) targetLeadId = match.id
      }

      if (targetLeadId) {
        await markLeadContacted(
          client.id,
          targetLeadId,
          body.atendido_por || body.agent_name || null,
          body.contacted_at || body.timestamp || new Date().toISOString()
        )
        return NextResponse.json({ ok: true, action: 'contact_recorded', lead_id: targetLeadId })
      }

      return NextResponse.json({ ok: false, error: 'Lead correspondente não localizado para registrar atendimento' }, { status: 404 })
    }

    // 2. Registro de venda / conversão externa
    if (tipo === 'venda' || tipo === 'order' || tipo === 'purchase') {
      const total = parseFloat(body.valor || body.valor_pedido || body.total || '0') || 0
      const externalId = String(body.external_id || body.order_id || body.id || Date.now())
      const status = body.status === 'paid' || body.status === 'aprovado' ? 'paid' : 'pending'

      const orderResult = await upsertEcommerceOrder({
        client_id: client.id,
        platform: 'custom',
        external_id: externalId,
        order_number: body.order_number || `#${externalId.slice(-6)}`,
        status,
        total,
        currency: body.currency || 'BRL',
        customer_name: body.nome || body.customer_name || null,
        customer_email: body.email || body.customer_email || null,
        customer_phone: body.telefone || body.customer_phone || null,
        utm_source: body.utm_source || body.origem || null,
        utm_campaign: body.utm_campaign || body.campanha || null,
        utm_medium: body.utm_medium || null,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
        raw_payload: body,
      })

      return NextResponse.json({ ok: true, action: 'order_recorded', order_id: orderResult.id })
    }

    // 3. Criação de Lead Genérico (Inbound CRM / RD Station / Typebot / Webhook)
    const nome = body.nome || body.name || null
    const telefone = body.telefone || body.phone || null
    const email = body.email || null
    const campanha = body.campanha || body.campaign || null
    const conjunto = body.conjunto || body.adset || null
    const adName = body.ad_name || body.anuncio || null
    const valorPedido = body.valor_pedido != null ? parseFloat(body.valor_pedido) : null
    const status = body.status === 'Convertido' || body.status === 'Em andamento' || body.status === 'Perdido' ? body.status : 'Novo'
    const notas = body.notas || body.notes || null
    const origem = body.origem || body.source || 'webhook'
    const atendidoPor = body.atendido_por || null

    const saved = await insertLead(client.id, {
      nome,
      telefone,
      email,
      campanha,
      conjunto,
      ad_name: adName,
      valor_pedido: valorPedido,
      status,
      notas,
      origem,
      atendido_por: atendidoPor,
      ultimo_contato: atendidoPor || status !== 'Novo' ? new Date().toISOString() : null,
      primeiro_contato: atendidoPor || status !== 'Novo' ? new Date().toISOString() : null,
      sla_violado: false,
    }, db)

    return NextResponse.json({ ok: true, action: 'lead_created', saved })
  } catch (err) {
    console.error('[inbound-webhook] erro ao processar:', err)
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 })
  }
}

// Suporte a verificação rápida GET (ex: testes de webhook no navegador)
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

  const { data: client } = await db.from('clients').select('slug, display_name').eq('slug', slug).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    service: 'Meta Dashboard Inbound Webhook',
    client: client.display_name || client.slug,
    usage: 'Envie requisições POST com payload JSON para criar leads, registrar atendimentos (SLA) ou pedidos.',
  })
}

