import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { isMetricKey, isPeriod, MAX_CARD_METRICS } from '@/lib/adminCard'
import { SLUG_RE } from '@/lib/host'

export const dynamic = 'force-dynamic'
const KEY = 'admin_card_metrics'

/** Salva quais métricas aparecem no card de um cliente, em que ordem e para qual período. Corpo: { slug, metrics: string[], days: 7|14|30 } (lista vazia = voltar ao padrão). */
export async function PUT(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const b = await req.json().catch(() => ({})) as { slug?: unknown; metrics?: unknown; days?: unknown }
  if (typeof b.slug !== 'string' || !SLUG_RE.test(b.slug)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })
  if (!Array.isArray(b.metrics) || !b.metrics.every(isMetricKey) || new Set(b.metrics).size !== b.metrics.length || b.metrics.length > MAX_CARD_METRICS)
    return NextResponse.json({ error: `Escolha de 1 a ${MAX_CARD_METRICS} métricas.` }, { status: 400 })

  const days = b.days === undefined ? 7 : b.days
  if (!isPeriod(days)) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
  const { data } = await db.from('meta_settings').select('value').eq('key', KEY).maybeSingle()
  const cur = ((data as { value: unknown } | null)?.value ?? {}) as Record<string, unknown>
  const next = { ...(cur && typeof cur === 'object' ? cur : {}) }
  if (b.metrics.length) next[b.slug] = { metrics: b.metrics, days }; else delete next[b.slug]
  const { error } = await db.from('meta_settings').upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: /does not exist|schema cache/i.test(error.message) ? 'Rode o SQL supabase/2026-09-meta-sync.sql no Supabase antes.' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
