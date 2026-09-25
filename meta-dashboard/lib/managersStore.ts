/** Gestores de tráfego no banco: cadastro, carteira de clientes, histórico de ações e leitura das alterações feitas na Meta. */
import { getSupabaseServer } from './supabase'
import { legacyGet } from './meta/legacy'
import { liveOrigin } from './meta/mode'
import { metaConfig } from './meta/config'
import { loadRegistry, toManager, __resetManagersMemo, type ManagerRow } from './activityLog'
import {
  cleanManagerInput, isHumanMetaEvent, managerId as slugFromName, metaToLog,
  type LogInsert, type LogRow, type Manager, type ManagerInput, type MetaActivity,
} from './managers'

/** Cria ou atualiza o gestor e refaz a carteira dele. Cliente que já era de outro gestor passa para este. */
export async function saveManager(input: ManagerInput, existingId?: string): Promise<{ manager: Manager } | { error: string }> {
  const db = getSupabaseServer()
  if (!db) return { error: 'Banco indisponível.' }
  const id = existingId ?? slugFromName(input.name)
  if (!id) return { error: 'Nome inválido.' }
  const reg = await loadRegistry(true)
  if (!reg) return { error: 'Rode o SQL supabase/2026-09-gestores.sql no Supabase antes.' }
  if (!existingId && reg.managers.some(m => m.id === id)) return { error: 'Já existe um gestor com esse nome.' }
  if (input.email && reg.managers.some(m => m.id !== id && m.email === input.email)) return { error: 'Esse e-mail já está em outro gestor.' }
  const { data, error } = await db.from('traffic_managers').upsert({ id, name: input.name, email: input.email, meta_actor_id: input.metaActorId, meta_actor_name: input.metaActorName }, { onConflict: 'id' }).select('*').single()
  if (error) return { error: error.message }
  const keep = new Set(input.clients)
  const drop = [...reg.byClient.entries()].filter(([slug, mid]) => mid === id && !keep.has(slug)).map(([slug]) => slug)
  if (drop.length) { const r = await db.from('manager_clients').delete().in('client_slug', drop); if (r.error) return { error: r.error.message } }
  if (input.clients.length) {
    const r = await db.from('manager_clients').upsert(input.clients.map(client_slug => ({ client_slug, manager_id: id, assigned_at: new Date().toISOString() })), { onConflict: 'client_slug' })
    if (r.error) return { error: r.error.message }
  }
  __resetManagersMemo()
  return { manager: toManager(data as ManagerRow) }
}

export async function deleteManager(id: string): Promise<string | null> {
  const db = getSupabaseServer()
  if (!db) return 'Banco indisponível.'
  const { error } = await db.from('traffic_managers').delete().eq('id', id)
  __resetManagersMemo()
  return error ? error.message : null
}

/** Coloca um cliente na carteira de um gestor (ou tira, com managerId nulo). */
export async function assignClient(slug: string, managerId: string | null): Promise<string | null> {
  const db = getSupabaseServer()
  if (!db) return 'Banco indisponível.'
  const r = managerId
    ? await db.from('manager_clients').upsert({ client_slug: slug, manager_id: managerId, assigned_at: new Date().toISOString() }, { onConflict: 'client_slug' })
    : await db.from('manager_clients').delete().eq('client_slug', slug)
  __resetManagersMemo()
  return r.error ? r.error.message : null
}

// ─── Histórico ───────────────────────────────────────────────────────────────

const LOG_COLUMNS = 'at,source,client_slug,manager_id,actor_key,actor_name,kind,summary,object_name,detail'

/** Histórico do gestor: o que aconteceu nas contas dele ("accounts") ou o que ele mesmo fez em qualquer conta ("actor"). */
export async function readLog(o: { managerId?: string; actorKeys?: string[]; sinceIso: string; client?: string; kind?: string; limit?: number }): Promise<LogRow[] | null> {
  const db = getSupabaseServer()
  if (!db) return null
  let q = db.from('activity_log').select(LOG_COLUMNS).gte('at', o.sinceIso).order('at', { ascending: false }).limit(o.limit ?? 5000)
  if (o.managerId) q = q.eq('manager_id', o.managerId)
  if (o.actorKeys) q = q.in('actor_key', o.actorKeys)
  if (o.client) q = q.eq('client_slug', o.client)
  if (o.kind) q = q.eq('kind', o.kind)
  const { data, error } = await q
  if (error) return null
  return (data ?? []) as LogRow[]
}

// ─── Leitura do histórico da Meta ────────────────────────────────────────────

const FIELDS = 'event_time,event_type,actor_name,actor_id,object_name,object_type,object_id,translated_event_type,extra_data'
const FIRST_DAYS = 30
const MAX_PAGES = 5
const CONCURRENCY = 4

export interface SyncResult { clients: number; events: number; skipped: number; errors: Array<{ slug: string; error: string }>; dryRun: boolean }

/** Le, para cada cliente, as alterações feitas na conta de anúncios desde a última leitura e grava as que têm autor humano. */
export async function syncMetaActivity(opts: { only?: string[]; budgetMs?: number; /** máximo de contas por rodada (as mais atrasadas, gestores primeiro); sem valor lê todas */ limit?: number } = {}): Promise<SyncResult> {
  const out: SyncResult = { clients: 0, events: 0, skipped: 0, errors: [], dryRun: false }
  const db = getSupabaseServer()
  if (!db) return out
  const reg = await loadRegistry()
  const [cl, st] = await Promise.all([db.from('clients').select('id,slug,ad_account_id'), db.from('activity_sync').select('client_slug,synced_through')])
  if (cl.error) return out
  const through = new Map(((st.data ?? []) as Array<{ client_slug: string; synced_through: string | null }>).map(r => [r.client_slug, r.synced_through]))
  let todo = ((cl.data ?? []) as Array<{ id: string; slug: string; ad_account_id: string | null }>)
    .filter(c => c.ad_account_id && (!opts.only || opts.only.includes(c.slug)))
    .map(c => ({ id: c.id, slug: c.slug, act: c.ad_account_id!.startsWith('act_') ? c.ad_account_id! : `act_${c.ad_account_id!.replace(/\D/g, '')}` }))
  // Cada leitura conta no orçamento de chamadas por hora da Meta (o mesmo das métricas). Nas rodadas automáticas lê só as contas mais atrasadas, as de gestores primeiro.
  if (opts.limit && todo.length > opts.limit) {
    const managed = (slug: string) => (reg?.byClient.has(slug) ? 0 : 1)
    todo = [...todo].sort((a, b) => managed(a.slug) - managed(b.slug) || (through.get(a.slug) ?? '').localeCompare(through.get(b.slug) ?? '')).slice(0, opts.limit)
  }
  // Mesma via das outras consultas sob demanda: o caminho antigo enquanto o corte não foi feito (o pipeline novo em teste, DRY_RUN, não chama a Meta) e a via central depois.
  const origin = await liveOrigin()
  const deadline = Date.now() + (opts.budgetMs ?? 40_000)

  async function one(c: { id: string; slug: string; act: string }) {
    if (Date.now() > deadline) { out.skipped++; return }
    const since = Math.floor((through.get(c.slug) ? Date.parse(through.get(c.slug)!) - 3_600_000 : Date.now() - FIRST_DAYS * 86_400_000) / 1000) // 1 h de folga: evento que a Meta registra com atraso
    const rows: LogInsert[] = []
    let after: string | undefined
    let failed: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const path = `${c.act}/activities?fields=${FIELDS}&limit=${metaConfig().pageSize}&since=${since}${after ? `&after=${after}` : ''}`
      const r = await legacyGet<{ data?: MetaActivity[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, { origin, purpose: 'activity_log', accountId: c.act, clientId: c.id })
      if (r.dryRun) { out.dryRun = true; return }
      if (!r.ok) { failed = r.blocked ?? r.error?.message ?? 'falha na Meta'; break }
      for (const e of r.data.data ?? []) if (isHumanMetaEvent(e)) rows.push(metaToLog(e, c.slug, reg?.byClient.get(c.slug) ?? null, c.act))
      after = r.data.paging?.next ? r.data.paging.cursors?.after : undefined
      if (!after) break
    }
    if (rows.length) {
      const { error } = await db!.from('activity_log').upsert(rows, { onConflict: 'ext_id', ignoreDuplicates: true })
      if (error) failed = error.message
      else out.events += rows.length
    }
    out.clients++
    await db!.from('activity_sync').upsert({ client_slug: c.slug, synced_through: failed ? through.get(c.slug) ?? null : new Date().toISOString(), last_run: new Date().toISOString(), last_error: failed }, { onConflict: 'client_slug' })
    if (failed) out.errors.push({ slug: c.slug, error: failed.slice(0, 160) })
  }

  let i = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => { while (i < todo.length) await one(todo[i++]) }))
  return out
}

export async function lastSyncAt(): Promise<string | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('activity_sync').select('last_run').order('last_run', { ascending: false }).limit(1)
  return (data?.[0] as { last_run?: string } | undefined)?.last_run ?? null
}

/** Pessoas que aparecem como autores no histórico da Meta, para ligar cada uma a um gestor. */
export async function metaActors(): Promise<Array<{ id: string; name: string; n: number }>> {
  const db = getSupabaseServer()
  if (!db) return []
  const { data } = await db.from('activity_log').select('actor_key,actor_name').eq('source', 'meta').order('at', { ascending: false }).limit(5000)
  const m = new Map<string, { id: string; name: string; n: number }>()
  for (const r of (data ?? []) as Array<{ actor_key: string | null; actor_name: string | null }>) {
    if (!r.actor_key?.startsWith('meta:')) continue
    const id = r.actor_key.slice(5)
    const e = m.get(id) ?? { id, name: r.actor_name ?? id, n: 0 }
    e.n++; m.set(id, e)
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

export { cleanManagerInput }
export { tablesMissing, loadRegistry, logStaffActivity } from './activityLog'

// ─── Tempo no painel (da análise de uso) ─────────────────────────────────────

/** Tempo ativo no painel de uma pessoa (pelo e-mail de login), no total e por cliente. */
export async function timeByEmail(emails: string[], sinceIso: string): Promise<Map<string, { total: number; byClient: Map<string, number> }>> {
  const out = new Map<string, { total: number; byClient: Map<string, number> }>()
  const db = getSupabaseServer()
  if (!db || !emails.length) return out
  const { data: sess } = await db.from('usage_sessions').select('sid,user_key,active_sec').in('user_key', emails).gte('last_seen', sinceIso).limit(5000)
  const owner = new Map<string, string>()
  for (const s of (sess ?? []) as Array<{ sid: string; user_key: string; active_sec: number }>) {
    owner.set(s.sid, s.user_key)
    const e = out.get(s.user_key) ?? { total: 0, byClient: new Map<string, number>() }
    e.total += s.active_sec; out.set(s.user_key, e)
  }
  const sids = [...owner.keys()]
  for (let i = 0; i < sids.length; i += 200) {
    const { data } = await db.from('usage_views').select('sid,client_slug,seconds').in('sid', sids.slice(i, i + 200)).limit(20000)
    for (const v of (data ?? []) as Array<{ sid: string; client_slug: string; seconds: number }>) {
      if (!v.client_slug) continue
      const e = out.get(owner.get(v.sid)!)
      if (e) e.byClient.set(v.client_slug, (e.byClient.get(v.client_slug) ?? 0) + v.seconds)
    }
  }
  return out
}

export async function clientNames(): Promise<Map<string, string>> {
  const db = getSupabaseServer()
  const { data } = db ? await db.from('clients').select('slug,display_name') : { data: [] }
  return new Map(((data ?? []) as Array<{ slug: string; display_name: string | null }>).map(c => [c.slug, c.display_name || c.slug]))
}

// ─── Carona no uso do app ────────────────────────────────────────────────────

const STALE_MS = 4 * 60_000
/** Contas lidas por rodada automática: mantém a leitura em cerca de 8 chamadas a cada 4 min, longe do teto por hora das métricas. */
const AUTO_LIMIT = 8
let lastCheck = 0
let running = false

/**
 * Mantém o histórico de alterações em dia pelo mesmo gatilho das métricas: quando alguém usa o app e a última leitura tem mais de 4 min, lê de novo.
 * Barato quando não precisa: no máximo uma consulta por minuto por instância. Sem tabela dos gestores (SQL não rodou) não faz nada.
 */
export async function maybeSyncActivity(): Promise<void> {
  if (running || Date.now() - lastCheck < 60_000) return
  lastCheck = Date.now()
  running = true
  try {
    const reg = await loadRegistry()
    if (!reg) return
    const last = await lastSyncAt()
    if (last && Date.now() - Date.parse(last) < STALE_MS) return
    await syncMetaActivity({ budgetMs: 25_000, limit: AUTO_LIMIT })
  } catch { /* o histórico é secundário */ } finally { running = false }
}
