import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { geoFromHeaders, normalizeTrack, trackKeyValid } from '@/lib/storeTrack'

export const dynamic = 'force-dynamic'

// O pixel roda no domínio da loja e chama daqui, então a resposta precisa liberar CORS.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS })

const ids = new Map<string, { id: string | null; at: number }>()
async function clientId(slug: string): Promise<string | null> {
  const hit = ids.get(slug)
  if (hit && Date.now() - hit.at < 300_000) return hit.id
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('clients').select('id').eq('slug', slug).maybeSingle()
  const id = (data as { id: string } | null)?.id ?? null
  ids.set(slug, { id, at: Date.now() })
  return id
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!trackKeyValid(slug, req.nextUrl.searchParams.get('k'))) return reply({ error: 'invalid key' }, 401)

  const raw = await req.text()
  if (raw.length > 2000) return reply({ error: 'too large' }, 413)
  let body: unknown
  try { body = JSON.parse(raw) } catch { return reply({ error: 'invalid json' }, 400) }
  const ev = normalizeTrack(body)
  if (!ev) return reply({ error: 'invalid event' }, 400)

  const cid = await clientId(slug)
  const db = getSupabaseServer()
  if (!cid || !db) return reply({ error: 'unavailable' }, 503)

  const geo = geoFromHeaders(req.headers)
  const now = new Date().toISOString()

  // Sessão: quem já existe só atualiza o último sinal; a localização e a origem ficam as da entrada.
  const session: Record<string, unknown> = { client_id: cid, sid: ev.sid, last_seen: now, path: ev.path }
  if (ev.type === 'visit') Object.assign(session, { ...geo, source: ev.source, first_seen: now })
  const { error: sErr } = await db.from('store_sessions').upsert(session, { onConflict: 'client_id,sid' })
  if (sErr) { console.error('[track] sessão:', sErr.message); return reply({ error: 'db' }, 500) }

  // Ping sem sessão nova não traz localização: completa se a sessão ainda estiver sem cidade.
  if (ev.type !== 'visit' && geo.lat != null) {
    await db.from('store_sessions').update({ ...geo, source: ev.source }).eq('client_id', cid).eq('sid', ev.sid).is('lat', null)
  }

  if (ev.type !== 'ping') {
    const { error: eErr } = await db.from('store_events').insert({ client_id: cid, sid: ev.sid, type: ev.type, ...geo, product: ev.product, value: ev.value, path: ev.path, source: ev.source })
    if (eErr) console.error('[track] evento:', eErr.message)
  }

  // Limpeza: de vez em quando apaga o que tem mais de 45 dias (o funil da Visão Geral olha 30).
  if (Math.random() < 0.01) {
    const cut = new Date(Date.now() - 45 * 86_400_000).toISOString()
    await db.from('store_events').delete().eq('client_id', cid).lt('created_at', cut)
    await db.from('store_sessions').delete().eq('client_id', cid).lt('last_seen', cut)
  }

  return reply({ ok: true })
}
