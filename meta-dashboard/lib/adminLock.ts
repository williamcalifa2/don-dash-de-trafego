import { getSupabaseServer } from '@/lib/supabase'

/** Bloqueio do login do admin que sobrevive entre instâncias (a memória do Vercel zera). Guardado em meta_settings. */
const KEY = 'admin_login_fails'
export const IP_MAX = 8
export const ALL_MAX = 40
export const WINDOW_MS = 15 * 60 * 1000

interface Entry { n: number; first: number }
export interface LockState { all: Entry; ips: Record<string, Entry> }

const fresh = (): LockState => ({ all: { n: 0, first: 0 }, ips: {} })
const live = (e: Entry | undefined, now: number): Entry => (e && e.first + WINDOW_MS > now ? e : { n: 0, first: 0 })

/** Minutos de espera restantes se este IP (ou o painel todo) estourou as tentativas; null se pode tentar. */
export function lockedMinutes(state: LockState, ip: string, now = Date.now()): number | null {
  const hit = [[live(state.ips[ip], now), IP_MAX], [live(state.all, now), ALL_MAX]] as const
  for (const [e, max] of hit) if (e.n >= max) return Math.max(1, Math.ceil((e.first + WINDOW_MS - now) / 60000))
  return null
}

export function withFailure(state: LockState, ip: string, now = Date.now()): LockState {
  const ips: Record<string, Entry> = {}
  for (const [k, e] of Object.entries(state.ips)) if (e.first + WINDOW_MS > now) ips[k] = e
  const cur = live(ips[ip], now), all = live(state.all, now)
  ips[ip] = { n: cur.n + 1, first: cur.n ? cur.first : now }
  return { all: { n: all.n + 1, first: all.n ? all.first : now }, ips }
}

export function withoutIp(state: LockState, ip: string): LockState {
  const ips = { ...state.ips }
  delete ips[ip]
  return { ...state, ips }
}

async function read(): Promise<LockState | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data, error } = await db.from('meta_settings').select('value').eq('key', KEY).maybeSingle()
  if (error) return null
  const v = (data as { value?: Partial<LockState> } | null)?.value
  return { all: v?.all ?? fresh().all, ips: v?.ips && typeof v.ips === 'object' ? v.ips : {} }
}

async function write(state: LockState): Promise<void> {
  const db = getSupabaseServer()
  if (db) await db.from('meta_settings').upsert({ key: KEY, value: state, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/** Se o banco não responde, não trava o admin: o limite em memória continua valendo. */
export async function adminLockedMinutes(ip: string): Promise<number | null> {
  const s = await read()
  return s ? lockedMinutes(s, ip) : null
}
export async function adminRecordFailure(ip: string): Promise<void> {
  const s = await read()
  if (s) await write(withFailure(s, ip)).catch(() => {})
}
export async function adminClearFailures(ip: string): Promise<void> {
  const s = await read()
  if (s && s.ips[ip]) await write(withoutIp(s, ip)).catch(() => {})
}
