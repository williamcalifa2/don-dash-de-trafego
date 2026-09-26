import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { allow } from '@/lib/rateLimit'
import { normalizeVisit, verifyExtToken } from '@/lib/extension'

export const dynamic = 'force-dynamic'

const missing = (m: string) => /relation|schema cache|does not exist|function/i.test(m)

/**
 * Aviso da extensão: "esta pessoa está com esta conta de anúncios aberta". Só conta de cliente da agência é registrada.
 * Responde se a conta é da agência (a extensão só mostra o brilho nessas). Nunca recebe nada além da conta e do tempo.
 */
export async function POST(req: NextRequest) {
  const email = await verifyExtToken(req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''))
  if (!email) return NextResponse.json({ ok: false, error: 'token' }, { status: 401 })
  if (!allow(`ext:${email}`, 40, 60_000)) return NextResponse.json({ ok: true, throttled: true })
  const raw = await req.text()
  if (raw.length > 2000) return NextResponse.json({ ok: false }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  const v = normalizeVisit(body)
  if (!v) return NextResponse.json({ ok: false }, { status: 400 })

  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ ok: false }, { status: 503 })
  const { data } = await db.from('clients').select('slug,display_name').eq('ad_account_id', `act_${v.act}`).maybeSingle()
  const client = data as { slug: string; display_name: string | null } | null
  if (!client) return NextResponse.json({ ok: true, tracked: false })
  const { error } = await db.rpc('account_visit_beat', { p_visit: v.visit, p_user: email, p_slug: client.slug, p_act: `act_${v.act}`, p_delta: v.sec })
  if (error) {
    console.error('[ext] visita:', error.message)
    return NextResponse.json({ ok: false, error: missing(error.message) ? 'sql' : 'db', tracked: true, client: client.display_name ?? client.slug }, { status: 500 })
  }
  return NextResponse.json({ ok: true, tracked: true, client: client.display_name ?? client.slug })
}
