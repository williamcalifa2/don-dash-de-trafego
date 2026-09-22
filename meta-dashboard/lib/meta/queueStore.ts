import { getSupabaseServer } from '../supabase'
import { StoreNotMigrated } from './limits'
import type { Job, JobKind, JobStatus, JobStore } from './queue'

type Row = Record<string, unknown>
const db = () => { const c = getSupabaseServer(); if (!c) throw new StoreNotMigrated(); return c }
function check(error: { code?: string; message?: string } | null) {
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')) throw new StoreNotMigrated()
  throw new Error(`Banco: ${error.message ?? 'erro'}`)
}
const toJob = (r: Row): Job => ({
  id: String(r.id), clientId: String(r.client_id), kind: r.kind as JobKind, status: r.status as JobStatus,
  attempts: Number(r.attempts ?? 0), runAfter: Date.parse(String(r.run_after)), lockedUntil: r.locked_until ? Date.parse(String(r.locked_until)) : null,
  error: (r.error as string | null) ?? null,
  finishedAt: r.finished_at ? Date.parse(String(r.finished_at)) : null,
})
const iso = (ms: number) => new Date(ms).toISOString()

export class SupabaseJobStore implements JobStore {
  async enqueue(clientId: string, kind: JobKind, runAfter: number) {
    const { data, error } = await db().from('meta_sync_jobs').select('id').eq('client_id', clientId).eq('kind', kind).in('status', ['pending', 'running', 'dead']).limit(1) // dead-letter também bloqueia: sem reprocessamento automático
    check(error)
    if ((data ?? []).length) return 'exists' as const
    const ins = await db().from('meta_sync_jobs').insert({ client_id: clientId, kind, status: 'pending', run_after: iso(runAfter) })
    if (ins.error?.code === '23505') return 'exists' as const // índice único parcial: outro ciclo enfileirou primeiro
    check(ins.error)
    return 'created' as const
  }

  async claim(now: number, leaseMs: number, maxRunning: number) {
    const running = await db().from('meta_sync_jobs').select('client_id').eq('status', 'running').gt('locked_until', iso(now))
    check(running.error)
    const rows = (running.data ?? []) as Row[]
    if (rows.length >= maxRunning) return null
    const busy = new Set(rows.map(r => String(r.client_id)))
    const due = await db().from('meta_sync_jobs').select('*').eq('status', 'pending').lte('run_after', iso(now)).order('run_after').limit(20)
    check(due.error)
    for (const r of (due.data ?? []) as Row[]) {
      if (busy.has(String(r.client_id))) continue
      const upd = await db().from('meta_sync_jobs')
        .update({ status: 'running', attempts: Number(r.attempts ?? 0) + 1, locked_until: iso(now + leaseMs) })
        .eq('id', r.id).eq('status', 'pending').select('*')
      if (upd.error?.code === '23505') continue // índice único: já há um job rodando nesta conta
      check(upd.error)
      if ((upd.data ?? []).length) return toJob((upd.data as Row[])[0])
    }
    return null
  }

  async complete(id: string, now: number) {
    check((await db().from('meta_sync_jobs').update({ status: 'done', locked_until: null, finished_at: iso(now), error: null }).eq('id', id)).error)
  }
  async defer(id: string, runAfter: number) {
    const { data, error } = await db().from('meta_sync_jobs').select('attempts').eq('id', id).maybeSingle()
    check(error)
    const attempts = Math.max(0, Number((data as Row | null)?.attempts ?? 1) - 1)
    check((await db().from('meta_sync_jobs').update({ status: 'pending', attempts, run_after: iso(runAfter), locked_until: null }).eq('id', id)).error)
  }
  async fail(id: string, error: string, retryAt: number | null, now: number) {
    const patch: Row = retryAt == null
      ? { status: 'dead', locked_until: null, error: error.slice(0, 500), finished_at: iso(now) }
      : { status: 'pending', locked_until: null, error: error.slice(0, 500), run_after: iso(retryAt) }
    check((await db().from('meta_sync_jobs').update(patch).eq('id', id)).error)
  }
  async reapExpired(now: number, maxAttempts: number) {
    const { data, error } = await db().from('meta_sync_jobs').select('id,attempts').eq('status', 'running').lte('locked_until', iso(now))
    check(error)
    for (const r of (data ?? []) as Row[]) {
      const dead = Number(r.attempts) >= maxAttempts
      await db().from('meta_sync_jobs').update(dead ? { status: 'dead', locked_until: null, error: 'lease expirado' } : { status: 'pending', locked_until: null, run_after: iso(now), error: 'lease expirado' }).eq('id', r.id)
    }
    return (data ?? []).length
  }
  async counts() {
    const c: Record<JobStatus, number> = { pending: 0, running: 0, done: 0, failed: 0, dead: 0 }
    for (const st of Object.keys(c) as JobStatus[]) {
      const { count, error } = await db().from('meta_sync_jobs').select('id', { count: 'exact', head: true }).eq('status', st)
      check(error); c[st] = count ?? 0
    }
    return c
  }
  async listDead(limit: number) {
    const { data, error } = await db().from('meta_sync_jobs').select('*').eq('status', 'dead').order('created_at', { ascending: false }).limit(limit)
    check(error)
    return ((data ?? []) as Row[]).map(toJob)
  }
  async requeueDead(id: string, now: number) {
    const { data, error } = await db().from('meta_sync_jobs').select('*').eq('id', id).eq('status', 'dead').maybeSingle()
    check(error)
    if (!data) return false
    const j = toJob(data as Row)
    const upd = await db().from('meta_sync_jobs').update({ status: 'pending', attempts: 0, run_after: iso(now), error: null, finished_at: null }).eq('id', id).eq('status', 'dead').select('id')
    if (upd.error?.code === '23505') return false // já existe um pendente do mesmo tipo
    check(upd.error)
    void j
    return (upd.data ?? []).length > 0
  }
  async dismissDead(id: string) {
    const { data, error } = await db().from('meta_sync_jobs').update({ status: 'failed' }).eq('id', id).eq('status', 'dead').select('id')
    check(error)
    return (data ?? []).length > 0
  }
  async purge(olderThanMs: number) {
    check((await db().from('meta_sync_jobs').delete().eq('status', 'done').lt('created_at', iso(olderThanMs))).error)
  }
}
