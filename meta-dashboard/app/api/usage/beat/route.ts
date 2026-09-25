import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { geoFromHeaders } from '@/lib/storeTrack'
import { usageIdentity } from '@/lib/usageStore'
import { normalizeBeat } from '@/lib/usage'
import { allow } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

/** Batimento do navegador (~15 s): presença, tempo ativo por tela/cliente e cliques. Só quem está logado; nunca guarda o que a pessoa digita. */
export async function POST(req: NextRequest) {
  const who = await usageIdentity(req)
  if (!who) return NextResponse.json({ ok: false }, { status: 401 })

  const raw = await req.text()
  if (raw.length > 40_000) return NextResponse.json({ ok: false }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  const beat = normalizeBeat(body)
  if (!beat) return NextResponse.json({ ok: false }, { status: 400 })
  if (!allow(`beat:${beat.sid}`, 12, 60_000)) return NextResponse.json({ ok: true, throttled: true })

  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ ok: false }, { status: 503 })

  // Cliente que usa o painel dele: o cliente da sessão manda; a equipe informa qual painel está vendo.
  const client = who.tenantSlug ?? beat.client
  const now = new Date().toISOString()
  const geo = geoFromHeaders(req.headers)

  const { error } = await db.from('usage_sessions').upsert({
    sid: beat.sid, user_key: who.userKey, role: who.role, last_seen: now, last_view: beat.view, last_client: client || null, device: beat.device, country: geo.country,
  }, { onConflict: 'sid' })
  if (error) { console.error('[usage] sessão:', error.message); return NextResponse.json({ ok: false, error: 'db' }, { status: 500 }) }

  for (const e of beat.entries) {
    const { error: e2 } = await db.rpc('usage_add_time', { p_sid: beat.sid, p_client: who.tenantSlug ?? e.client, p_view: e.view, p_delta: e.delta })
    if (e2) { console.error('[usage] tempo:', e2.message); break }
  }

  if (beat.clicks.length) {
    const rows = beat.clicks.map(c => ({ sid: beat.sid, user_key: who.userKey, client_slug: who.tenantSlug ?? c.client ?? client, view: c.view ?? beat.view, device: beat.device, sel: c.sel, rx: c.rx, ry: c.ry, label: c.label }))
    let { error: e3 } = await db.from('usage_clicks').insert(rows)
    // Banco ainda sem a coluna "label" (SQL da 2ª parte não rodou): grava sem ela em vez de perder o clique.
    if (e3 && /label/i.test(e3.message)) ({ error: e3 } = await db.from('usage_clicks').insert(rows.map(({ label: _l, ...r }) => { void _l; return r })))
    if (e3) console.error('[usage] cliques:', e3.message)
  }

  // Sinais de qualidade (raiva, mortos, rolagem, erros, desempenho). Banco sem a tabela (SQL da 3ª parte não rodou): só registra no log, o resto do batimento já foi salvo.
  if (beat.events.length) {
    const rows = beat.events.map(e => ({ sid: beat.sid, user_key: who.userKey, client_slug: who.tenantSlug ?? e.client ?? client, view: e.view ?? beat.view, device: beat.device, kind: e.kind, sel: e.sel, rx: e.rx, ry: e.ry, n: e.n, value: e.value, label: e.label, msg: e.msg, meta: e.meta }))
    const { error: e4 } = await db.from('usage_events').insert(rows)
    if (e4) console.error('[usage] eventos:', e4.message)
  }

  // Limpeza: de vez em quando apaga cliques com mais de 60 dias e sessões com mais de 120.
  if (Math.random() < 0.01) {
    await db.from('usage_clicks').delete().lt('at', new Date(Date.now() - 60 * 86_400_000).toISOString())
    await db.from('usage_events').delete().lt('at', new Date(Date.now() - 60 * 86_400_000).toISOString())
    await db.from('usage_sessions').delete().lt('last_seen', new Date(Date.now() - 120 * 86_400_000).toISOString())
    await db.from('usage_logins').delete().lt('at', new Date(Date.now() - 180 * 86_400_000).toISOString())
  }
  return NextResponse.json({ ok: true })
}
