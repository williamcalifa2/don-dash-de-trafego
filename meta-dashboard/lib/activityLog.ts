/** Registro leve das ações do painel no histórico dos gestores. Separado de managersStore para as rotas não puxarem o cliente da Meta. */
import type { NextRequest } from 'next/server'
import { getSupabaseServer } from './supabase'
import { requestIdentity } from './admin'
import { getProfile, nameFromEmail } from './adminProfile'
import { managerAvatarUrl, type ActivityKind, type LogInsert, type Manager } from './managers'

export const tablesMissing = (m: string) => /relation|schema cache|does not exist/i.test(m)

export interface ManagerRow { id: string; name: string; email: string | null; meta_actor_id: string | null; meta_actor_name: string | null; created_at: string; avatar?: string | null }
export const toManager = (r: ManagerRow): Manager => ({ id: r.id, name: r.name, email: r.email, metaActorId: r.meta_actor_id, metaActorName: r.meta_actor_name, createdAt: r.created_at, avatarUrl: managerAvatarUrl(r.id, r.avatar) })

let memo: { at: number; managers: Manager[]; byClient: Map<string, string> } | null = null
export const __resetManagersMemo = () => { memo = null }

/** Gestores e a carteira (cliente -> gestor). `null` = tabelas ainda não criadas ou banco fora. */
export async function loadRegistry(force = false): Promise<{ managers: Manager[]; byClient: Map<string, string> } | null> {
  if (!force && memo && Date.now() - memo.at < 30_000) return memo
  const db = getSupabaseServer()
  if (!db) return null
  const [m, c] = await Promise.all([db.from('traffic_managers').select('*').order('name'), db.from('manager_clients').select('client_slug,manager_id')])
  if (m.error || c.error) return null
  memo = { at: Date.now(), managers: ((m.data ?? []) as ManagerRow[]).map(toManager), byClient: new Map(((c.data ?? []) as Array<{ client_slug: string; manager_id: string }>).map(x => [x.client_slug, x.manager_id])) }
  return memo
}


export interface AppActivity { kind: ActivityKind; summary: string; objectName?: string | null; detail?: Record<string, unknown> | null }

/**
 * Registra uma ação feita no painel por alguém da equipe. Fica no histórico do cliente e do gestor da conta.
 * Nunca derruba a ação de quem chamou: qualquer falha é engolida. Ações de clientes (não da equipe) não entram.
 */
export async function logStaffActivity(req: NextRequest, clientSlug: string, a: AppActivity): Promise<void> {
  try {
    const db = getSupabaseServer()
    if (!db || !clientSlug) return
    const who = await requestIdentity(req)
    if (!who) return
    const reg = await loadRegistry()
    if (!reg) return // tabelas ainda não criadas (SQL dos gestores): nada a registrar
    const own = reg.managers.find(m => m.email === who.email)
    const name = own?.name ?? (await getProfile(who.email).catch(() => ({} as { name?: string }))).name ?? nameFromEmail(who.email)
    const row: LogInsert = {
      at: new Date().toISOString(), source: 'app', client_slug: clientSlug, manager_id: reg.byClient.get(clientSlug) ?? null,
      actor_key: who.email, actor_name: name, kind: a.kind, event_type: null, object_type: null, object_name: a.objectName ?? null, summary: a.summary.slice(0, 160), detail: a.detail ?? null, ext_id: null,
    }
    await db.from('activity_log').insert(row)
  } catch { /* o histórico é secundário */ }
}

