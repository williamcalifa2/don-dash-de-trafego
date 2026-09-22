import { getSupabaseServer } from '../supabase'
import { StoreNotMigrated } from './limits'

/** Cópia local dos dados da Meta. O painel lê SÓ daqui (o front nunca chama a Meta). */
export interface Snapshot<T = unknown> { payload: T; fetchedAt: number }

export interface SnapshotStore {
  get<T>(clientId: string, kind: string, key: string): Promise<Snapshot<T> | null>
  put(clientId: string, kind: string, key: string, payload: unknown, now: number): Promise<void>
  delete(clientId: string, kind: string, key: string): Promise<void>
  /** Idade dos dados por tipo/chave (para "última atualização" e alerta de dado velho). */
  fetchedTimes(clientId: string): Promise<Array<{ kind: string; key: string; fetchedAt: number }>>
  purgeClient(clientId: string): Promise<void>
  /** Uma leitura só para todos os clientes: um tipo e várias chaves (ex.: os resumos dos períodos, para os cards do admin). */
  listKind<T = unknown>(kind: string, keys: string[]): Promise<Array<{ clientId: string; key: string; payload: T; fetchedAt: number }>>
}

export class MemorySnapshotStore implements SnapshotStore {
  data = new Map<string, Snapshot>()
  private k = (c: string, kind: string, key: string) => `${c}|${kind}|${key}`
  async get<T>(c: string, kind: string, key: string) { return (this.data.get(this.k(c, kind, key)) as Snapshot<T> | undefined) ?? null }
  async put(c: string, kind: string, key: string, payload: unknown, now: number) { this.data.set(this.k(c, kind, key), { payload: structuredClone(payload), fetchedAt: now }) }
  async delete(c: string, kind: string, key: string) { this.data.delete(this.k(c, kind, key)) }
  async fetchedTimes(c: string) {
    return [...this.data.entries()].filter(([k]) => k.startsWith(`${c}|`)).map(([k, v]) => { const [, kind, key] = k.split('|'); return { kind, key, fetchedAt: v.fetchedAt } })
  }
  async purgeClient(c: string) { for (const k of [...this.data.keys()]) if (k.startsWith(`${c}|`)) this.data.delete(k) }
  async listKind<T>(kind: string, keys: string[]) {
    return [...this.data.entries()].flatMap(([k, v]) => { const [clientId, kd, key] = k.split('|'); return kd === kind && keys.includes(key) ? [{ clientId, key, payload: v.payload as T, fetchedAt: v.fetchedAt }] : [] })
  }
}

type Row = Record<string, unknown>
function db() { const c = getSupabaseServer(); if (!c) throw new StoreNotMigrated(); return c }
function check(error: { code?: string; message?: string } | null) {
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')) throw new StoreNotMigrated()
  throw new Error(`Banco: ${error.message ?? 'erro'}`)
}

export class SupabaseSnapshotStore implements SnapshotStore {
  async get<T>(clientId: string, kind: string, key: string) {
    const { data, error } = await db().from('meta_snapshots').select('payload,fetched_at').eq('client_id', clientId).eq('kind', kind).eq('key', key).maybeSingle()
    check(error)
    const r = data as Row | null
    return r ? { payload: r.payload as T, fetchedAt: Date.parse(String(r.fetched_at)) } : null
  }
  async put(clientId: string, kind: string, key: string, payload: unknown, now: number) {
    check((await db().from('meta_snapshots').upsert({ client_id: clientId, kind, key, payload, fetched_at: new Date(now).toISOString() }, { onConflict: 'client_id,kind,key' })).error)
  }
  async delete(clientId: string, kind: string, key: string) {
    check((await db().from('meta_snapshots').delete().eq('client_id', clientId).eq('kind', kind).eq('key', key)).error)
  }
  async fetchedTimes(clientId: string) {
    const { data, error } = await db().from('meta_snapshots').select('kind,key,fetched_at').eq('client_id', clientId)
    check(error)
    return ((data ?? []) as Row[]).map(r => ({ kind: String(r.kind), key: String(r.key), fetchedAt: Date.parse(String(r.fetched_at)) }))
  }
  async purgeClient(clientId: string) { check((await db().from('meta_snapshots').delete().eq('client_id', clientId)).error) }
  async listKind<T>(kind: string, keys: string[]) {
    const { data, error } = await db().from('meta_snapshots').select('client_id,key,payload,fetched_at').eq('kind', kind).in('key', keys)
    check(error)
    return ((data ?? []) as Row[]).map(r => ({ clientId: String(r.client_id), key: String(r.key), payload: r.payload as T, fetchedAt: Date.parse(String(r.fetched_at)) }))
  }
}
