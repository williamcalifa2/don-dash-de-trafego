import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'node:crypto'
import { extractLeadEvents, MemoryEventStore, verifySignature, type EventStore } from '@/lib/meta/webhook'
import { eventStore, runWebhookEvents } from '@/lib/meta/webhookRunner'
import { StoreNotMigrated } from '@/lib/meta/limits'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && !!token && !!process.env.META_WEBHOOK_VERIFY_TOKEN && safeEqual(token, process.env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

/**
 * Recebe leads em tempo real. Fluxo: valida assinatura -> guarda só os IDs (idempotente) -> responde 200 -> processa depois.
 * Nada aqui chama a Meta antes da resposta, e nada de dado pessoal é guardado ou logado.
 */
export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return new NextResponse('Missing app secret', { status: 500 })

  const rawBody = await req.text()
  if (!verifySignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) return new NextResponse('Invalid signature', { status: 401 })

  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch { return new NextResponse('Bad JSON', { status: 400 }) }

  const events = extractLeadEvents(payload)
  let store: EventStore = eventStore
  let received = 0
  try {
    for (const e of events) if (await store.add(e, Date.now())) received++
  } catch (e) {
    if (!(e instanceof StoreNotMigrated)) { console.error('[webhook] falha ao guardar eventos'); return new NextResponse('Retry later', { status: 500 }) }
    // Banco sem a tabela de eventos: processa só em memória, nesta invocação.
    store = new MemoryEventStore(); received = 0
    for (const ev of events) if (await store.add(ev, Date.now())) received++
  }

  after(async () => { try { await runWebhookEvents(store) } catch { console.error('[webhook] falha no processamento em segundo plano') } })
  return NextResponse.json({ ok: true, received, duplicates: events.length - received })
}
