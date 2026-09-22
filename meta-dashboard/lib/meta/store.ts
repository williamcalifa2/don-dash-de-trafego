import { getSupabaseServer } from '../supabase'
import { defaultAccountState, StoreNotMigrated, type AccountState, type AlertInput, type LimitStore, type UsageSummary } from './limits'
import type { UsageEntry } from './client'

type Row = Record<string, unknown>
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString())
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : null)

function check(error: { code?: string; message?: string } | null): void {
  if (!error) return
  // 42P01 = tabela inexistente no Postgres; PGRST205/PGRST204 = tabela/coluna fora do cache do PostgREST.
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204' || /does not exist|schema cache/i.test(error.message ?? '')) throw new StoreNotMigrated()
  throw new Error(`Banco: ${error.message ?? 'erro'}`)
}

function db() {
  const c = getSupabaseServer()
  if (!c) throw new StoreNotMigrated() // sem banco configurado (ambiente local): mesmo tratamento de "não migrado"
  return c
}

/** Pequeno cache (segundos) para não repetir a mesma leitura em rajadas de chamadas do mesmo painel. */
const memo = new Map<string, { at: number; v: unknown }>()
const MEMO_MS = 2000
async function memoized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.v as T
  const v = await fn()
  memo.set(key, { at: Date.now(), v })
  return v
}

function toState(r: Row | null): AccountState {
  if (!r) return defaultAccountState()
  const lu = r.last_usage as AccountState['lastUsage'] | null
  return {
    enabled: !!r.enabled, paused: !!r.paused, suspended: !!r.suspended,
    blockedUntil: ms(r.blocked_until),
    blockEvents: ((r.block_events as string[] | null) ?? []).map(x => Date.parse(x)),
    freqMultiplier: Number(r.freq_multiplier ?? 1),
    activeAds: r.active_ads == null ? null : Number(r.active_ads),
    lastUsage: lu ?? null,
    lastError: (r.last_error as string | null) ?? null,
    lastSynced: Object.fromEntries(Object.entries((r.last_synced as Record<string, string> | null) ?? {}).map(([k, v]) => [k, Date.parse(v)]).filter(([, v]) => Number.isFinite(v))),
    cursors: (r.cursors as Record<string, string> | null) ?? {},
  }
}

export class SupabaseLimitStore implements LimitStore {
  async getState(clientId: string) {
    const { data, error } = await db().from('meta_sync_state').select('*').eq('client_id', clientId).maybeSingle()
    check(error)
    return toState(data as Row | null)
  }

  async patchState(clientId: string, p: Partial<AccountState>) {
    const row: Row = { client_id: clientId, updated_at: new Date().toISOString() }
    if (p.enabled !== undefined) row.enabled = p.enabled
    if (p.paused !== undefined) row.paused = p.paused
    if (p.suspended !== undefined) row.suspended = p.suspended
    if (p.blockedUntil !== undefined) row.blocked_until = iso(p.blockedUntil)
    if (p.blockEvents !== undefined) row.block_events = p.blockEvents.map(e => new Date(e).toISOString())
    if (p.freqMultiplier !== undefined) row.freq_multiplier = p.freqMultiplier
    if (p.activeAds !== undefined) row.active_ads = p.activeAds
    if (p.lastUsage !== undefined) row.last_usage = p.lastUsage
    if (p.lastError !== undefined) row.last_error = p.lastError
    if (p.lastSynced !== undefined) row.last_synced = Object.fromEntries(Object.entries(p.lastSynced).map(([k, v]) => [k, new Date(v).toISOString()]))
    if (p.cursors !== undefined) row.cursors = p.cursors
    const { error } = await db().from('meta_sync_state').upsert(row, { onConflict: 'client_id' })
    check(error)
  }

  async getSetting<T>(key: string) {
    return memoized(`s:${key}`, async () => {
      const { data, error } = await db().from('meta_settings').select('value').eq('key', key).maybeSingle()
      check(error)
      return ((data as Row | null)?.value as T | undefined) ?? null
    })
  }

  async setSetting(key: string, value: unknown) {
    const { error } = await db().from('meta_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    check(error)
    memo.delete(`s:${key}`)
  }

  async callsSince(sinceMs: number, clientId?: string) {
    return memoized(`c:${sinceMs - (sinceMs % 1000)}:${clientId ?? '*'}`, async () => {
      let q = db().from('meta_api_usage').select('calls').eq('dry_run', false).not('outcome', 'like', 'blocked%').gte('created_at', new Date(sinceMs).toISOString()).limit(20000)
      if (clientId) q = q.eq('client_id', clientId)
      const { data, error } = await q
      check(error)
      return ((data ?? []) as Row[]).reduce((n, r) => n + Number(r.calls ?? 1), 0)
    })
  }

  async usageSummary(sinceMs: number): Promise<UsageSummary> {
    const { data, error } = await db().from('meta_api_usage').select('calls,outcome,dry_run,app_pct,account_pct').gte('created_at', new Date(sinceMs).toISOString()).limit(50000)
    check(error)
    const rows = (data ?? []) as Row[]
    const real = rows.filter(r => !r.dry_run && !String(r.outcome).startsWith('blocked'))
    return {
      calls: real.reduce((n, r) => n + Number(r.calls ?? 1), 0),
      rateLimitErrors: real.filter(r => r.outcome === 'rate_limit').length,
      peakAccountPct: Math.max(0, ...real.map(r => Number(r.account_pct ?? 0))),
      peakAppPct: Math.max(0, ...real.map(r => Number(r.app_pct ?? 0))),
      dryRunCalls: rows.filter(r => r.dry_run).reduce((n, r) => n + Number(r.calls ?? 1), 0),
    }
  }

  async recentAlerts(limit: number) {
    const { data, error } = await db().from('meta_alerts').select('level,kind,client_id,message,created_at').order('created_at', { ascending: false }).limit(limit)
    check(error)
    return ((data ?? []) as Row[]).map(r => ({ level: String(r.level), kind: String(r.kind), clientId: (r.client_id as string | null) ?? null, message: String(r.message), at: Date.parse(String(r.created_at)) }))
  }

  async callsByClient(sinceMs: number, dryRun: boolean) {
    const { data, error } = await db().from('meta_api_usage').select('client_id,calls,outcome').eq('dry_run', dryRun).gte('created_at', new Date(sinceMs).toISOString()).limit(50000)
    check(error)
    const out: Record<string, number> = {}
    for (const r of (data ?? []) as Row[]) if (r.client_id && !String(r.outcome).startsWith('blocked')) out[String(r.client_id)] = (out[String(r.client_id)] ?? 0) + Number(r.calls ?? 1)
    return out
  }

  async purgeOld(usageBeforeMs: number, alertsBeforeMs: number) {
    check((await db().from('meta_api_usage').delete().lt('created_at', new Date(usageBeforeMs).toISOString())).error)
    check((await db().from('meta_alerts').delete().lt('created_at', new Date(alertsBeforeMs).toISOString())).error)
  }

  async tryLock(key: string, ttlMs: number, owner: string) {
    const k = `lock:${key}`
    const cur = (await db().from('meta_settings').select('value').eq('key', k).maybeSingle())
    check(cur.error)
    const v = (cur.data as Row | null)?.value as { until: number; owner: string } | undefined
    if (v && v.until > Date.now() && v.owner !== owner) return false
    await this.setSetting(k, { until: Date.now() + ttlMs, owner })
    // Reconfere: se duas execuções escreveram ao mesmo tempo, só a última dona segue.
    const chk = await db().from('meta_settings').select('value').eq('key', k).maybeSingle()
    check(chk.error)
    return ((chk.data as Row | null)?.value as { owner?: string } | undefined)?.owner === owner
  }

  async unlock(key: string, owner: string) {
    const k = `lock:${key}`
    const cur = await db().from('meta_settings').select('value').eq('key', k).maybeSingle()
    check(cur.error)
    if (((cur.data as Row | null)?.value as { owner?: string } | undefined)?.owner === owner) await this.setSetting(k, { until: 0, owner: '' })
  }

  async insertUsage(e: UsageEntry) {
    const u = e.usage
    const buc = u ? Object.values(u.buc).flat() : []
    const max = (f: (x: { call_count: number; total_cputime: number; total_time: number }) => number, app: number | undefined) => Math.max(app ?? 0, ...buc.map(f))
    const { error } = await db().from('meta_api_usage').insert({
      client_id: e.clientId ?? null, endpoint: e.endpoint.slice(0, 200), status: e.status ?? null, calls: e.calls,
      outcome: e.outcome.slice(0, 80), error_code: e.errorCode ?? null,
      call_pct: u ? max(x => x.call_count, u.app?.call_count) : null,
      cputime_pct: u ? max(x => x.total_cputime, u.app?.total_cputime) : null,
      time_pct: u ? max(x => x.total_time, u.app?.total_time) : null,
      app_pct: u ? u.appMaxPct : null, account_pct: u ? u.accountMaxPct : null,
      dry_run: e.dryRun, origin: e.origin, created_at: new Date(e.at).toISOString(),
    })
    check(error)
  }

  async insertAlert(a: AlertInput) {
    const { error } = await db().from('meta_alerts').insert({ level: a.level, kind: a.kind, client_id: a.clientId ?? null, message: a.message.slice(0, 500), data: a.data ?? null })
    check(error)
  }

  async alertSince(kind: string, clientId: string | null, sinceMs: number) {
    let q = db().from('meta_alerts').select('id').eq('kind', kind).gte('created_at', new Date(sinceMs).toISOString()).limit(1)
    q = clientId ? q.eq('client_id', clientId) : q.is('client_id', null)
    const { data, error } = await q
    check(error)
    return (data ?? []).length > 0
  }
}
