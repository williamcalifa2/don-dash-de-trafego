import { getSupabaseServer } from '../supabase'
import { StoreNotMigrated } from './limits'
import type { EventRow, EventStore, LeadEvent } from './webhook'

type Row = Record<string, unknown>
const db = () => { const c = getSupabaseServer(); if (!c) throw new StoreNotMigrated(); return c }
function check(error: { code?: string; message?: string } | null) {
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')) throw new StoreNotMigrated()
  throw new Error(`Banco: ${error.message ?? 'erro'}`)
}
const iso = (ms: number) => new Date(ms).toISOString()

export class SupabaseEventStore implements EventStore {
  async add(e: LeadEvent, now: number) {
    const { data, error } = await db().from('meta_webhook_events')
      .upsert({ leadgen_id: e.leadgenId, page_id: e.pageId || null, ad_id: e.adId || null, run_after: iso(now) }, { onConflict: 'leadgen_id', ignoreDuplicates: true }).select('leadgen_id')
    check(error)
    return (data ?? []).length > 0
  }
  async claimDue(now: number, limit: number) {
    const { data, error } = await db().from('meta_webhook_events').select('*').eq('status', 'pending').lte('run_after', iso(now)).order('received_at').limit(limit)
    check(error)
    const out: EventRow[] = []
    for (const r of (data ?? []) as Row[]) {
      // Reserva otimista: só quem consegue subir attempts a partir do valor lido processa o evento.
      const upd = await db().from('meta_webhook_events').update({ attempts: Number(r.attempts) + 1, run_after: iso(now + 120_000) }).eq('leadgen_id', r.leadgen_id).eq('attempts', r.attempts).eq('status', 'pending').select('leadgen_id')
      check(upd.error)
      if ((upd.data ?? []).length) out.push({ leadgenId: String(r.leadgen_id), pageId: String(r.page_id ?? ''), adId: String(r.ad_id ?? ''), status: 'pending', attempts: Number(r.attempts) + 1, runAfter: Date.parse(String(r.run_after)) })
    }
    return out
  }
  async done(id: string, now: number) { check((await db().from('meta_webhook_events').update({ status: 'done', processed_at: iso(now), error: null }).eq('leadgen_id', id)).error) }
  async retry(id: string, runAfter: number, error: string) { check((await db().from('meta_webhook_events').update({ run_after: iso(runAfter), error: error.slice(0, 200) }).eq('leadgen_id', id)).error) }
  async fail(id: string, error: string, now: number) { check((await db().from('meta_webhook_events').update({ status: 'failed', processed_at: iso(now), error: error.slice(0, 200) }).eq('leadgen_id', id)).error) }
  async defer(id: string, runAfter: number) {
    const cur = await db().from('meta_webhook_events').select('attempts').eq('leadgen_id', id).maybeSingle()
    check(cur.error)
    check((await db().from('meta_webhook_events').update({ attempts: Math.max(0, Number((cur.data as Row | null)?.attempts ?? 1) - 1), run_after: iso(runAfter) }).eq('leadgen_id', id)).error)
  }
  async counts() {
    const c = async (s: string) => { const r = await db().from('meta_webhook_events').select('leadgen_id', { count: 'exact', head: true }).eq('status', s); check(r.error); return r.count ?? 0 }
    return { pending: await c('pending'), failed: await c('failed') }
  }
}
