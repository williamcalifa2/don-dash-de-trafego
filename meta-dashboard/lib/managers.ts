/** Gestores de tráfego: cadastro, histórico de ações e as contas de cada um. Só funções puras (banco e Meta ficam em managersStore.ts). */

export type ActivityKind = 'status' | 'budget' | 'audience' | 'creative' | 'bid' | 'structure' | 'lead' | 'report' | 'config' | 'access' | 'sync' | 'client' | 'other'

export const KIND_LABEL: Record<ActivityKind, string> = {
  status: 'Pausas e ativações', budget: 'Orçamento', audience: 'Público', creative: 'Criativos', bid: 'Lance e otimização', structure: 'Campanhas e conjuntos',
  lead: 'Leads', report: 'Relatórios', config: 'Configurações', access: 'Acessos', sync: 'Atualizações', client: 'Cliente', other: 'Outros',
}
export const KINDS = Object.keys(KIND_LABEL) as ActivityKind[]
/** Ações que mexem no que roda na Meta: contam como "otimizações". */
export const OPTIMIZATION_KINDS: readonly ActivityKind[] = ['status', 'budget', 'audience', 'creative', 'bid', 'structure']
export const isKind = (v: unknown): v is ActivityKind => typeof v === 'string' && (KINDS as readonly string[]).includes(v)

export interface Manager { id: string; name: string; email: string | null; metaActorId: string | null; metaActorName: string | null; createdAt: string }
export interface ManagerInput { name: string; email: string | null; metaActorId: string | null; metaActorName: string | null; clients: string[] }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function managerId(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

/** Valida o formulário do gestor. */
export function cleanManagerInput(body: unknown): ManagerInput | { error: string } {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  if (name.length < 2) return { error: 'Informe o nome do gestor.' }
  const email = typeof o.email === 'string' && o.email.trim() ? o.email.trim().toLowerCase().slice(0, 120) : null
  if (email && !EMAIL.test(email)) return { error: 'E-mail inválido.' }
  const actorId = typeof o.metaActorId === 'string' && /^\d{5,25}$/.test(o.metaActorId.trim()) ? o.metaActorId.trim() : null
  const actorName = typeof o.metaActorName === 'string' && o.metaActorName.trim() ? o.metaActorName.replace(/\s+/g, ' ').trim().slice(0, 80) : null
  const clients = [...new Set((Array.isArray(o.clients) ? o.clients : []).filter((c): c is string => typeof c === 'string' && c.length <= 40 && SLUG.test(c)))].slice(0, 200)
  return { name, email, metaActorId: actorId, metaActorName: actorName, clients }
}

// ─── Eventos da Meta ─────────────────────────────────────────────────────────

export interface MetaActivity {
  event_time: string; event_type: string; actor_id?: string; actor_name?: string
  object_id?: string; object_name?: string; object_type?: string; translated_event_type?: string; extra_data?: string
}

/** Autor humano: a Meta assina os eventos automáticos (cobrança, primeira entrega, público automático) com id 0. */
export const isHumanMetaEvent = (e: MetaActivity) => !!e.actor_id && e.actor_id !== '0' && e.actor_name !== 'Meta'

export function kindOfMetaEvent(type: string): ActivityKind {
  const t = type.toLowerCase()
  if (t.includes('run_status') || t === 'delete_ad' || t.startsWith('delete_') || t.startsWith('archive_')) return 'status'
  if (t.includes('budget')) return 'budget'
  if (t.includes('target') || t.includes('audience') || t.includes('placement')) return 'audience'
  if (t.includes('bid') || t.includes('optimization') || t.includes('schedule')) return 'bid'
  if (t.includes('creative') || t.includes('image') || t.includes('video') || t === 'create_ad' || t === 'update_ad') return 'creative'
  if (t.startsWith('create_')) return 'structure'
  return 'other'
}

const OBJECT_LABEL: Record<string, string> = { CAMPAIGN_GROUP: 'Campanha', CAMPAIGN: 'Conjunto', ADGROUP: 'Anúncio', ACCOUNT: 'Conta' }
/** A Meta chama a campanha de CAMPAIGN_GROUP e o conjunto de CAMPAIGN; aqui volta para os nomes que a equipe usa. */
export const objectLabel = (t?: string) => (t ? OBJECT_LABEL[t] ?? '' : '')

const STRATEGY: Record<string, string> = { LOWEST_COST_BID_STRATEGY: 'Menor custo', LOWEST_COST_WITH_BID_CAP: 'Limite de lance', COST_CAP: 'Limite de custo', LOWEST_COST_WITH_MIN_ROAS: 'ROAS mínimo' }

function money(cents: unknown, currency: unknown): string | null {
  const n = Number(cents)
  if (!Number.isFinite(n)) return null
  const cur = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'BRL'
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(n / 100) } catch { return null }
}
const text = (v: unknown): string | null => {
  if (typeof v === 'string') return v ? (STRATEGY[v] ?? v).slice(0, 60) : null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

/** De onde para onde mudou (status, orçamento, lance, meta). Eventos sem valor simples (público, criativo) devolvem null. */
export function metaDelta(extra: string | undefined): { from: string | null; to: string | null } | null {
  if (!extra) return null
  let o: unknown
  try { o = JSON.parse(extra) } catch { return null }
  if (!o || typeof o !== 'object') return null
  const x = o as Record<string, unknown>
  const oldV = x.old_value, newV = x.new_value
  const pay = (v: unknown, key: 'old_value' | 'new_value') => (v && typeof v === 'object' && (v as Record<string, unknown>).type === 'payment_amount' ? money((v as Record<string, unknown>)[key], (v as Record<string, unknown>).currency) : null)
  const from = pay(oldV, 'old_value') ?? text(oldV)
  const to = pay(newV, 'new_value') ?? text(newV)
  if (from == null && to == null) return null
  return { from, to }
}

export interface LogInsert {
  at: string; source: 'app' | 'meta'; client_slug: string; manager_id: string | null; actor_key: string | null; actor_name: string | null
  kind: ActivityKind; event_type: string | null; object_type: string | null; object_name: string | null; summary: string
  detail: Record<string, unknown> | null; ext_id: string | null
}

/** Um evento da Meta já no formato do histórico. */
export function metaToLog(e: MetaActivity, clientSlug: string, managerId: string | null, adAccount: string): LogInsert {
  const kind = kindOfMetaEvent(e.event_type)
  const delta = metaDelta(e.extra_data)
  const at = new Date(e.event_time).toISOString()
  return {
    at, source: 'meta', client_slug: clientSlug, manager_id: managerId, actor_key: `meta:${e.actor_id}`, actor_name: e.actor_name ?? null, kind,
    event_type: e.event_type, object_type: e.object_type ?? null, object_name: e.object_name ? e.object_name.slice(0, 160) : null,
    summary: (e.translated_event_type || e.event_type).slice(0, 160), detail: delta ? { ...delta, level: objectLabel(e.object_type) || undefined } : (objectLabel(e.object_type) ? { level: objectLabel(e.object_type) } : null),
    ext_id: `${adAccount}:${at}:${e.event_type}:${e.object_id ?? ''}:${e.actor_id}:${(e.extra_data ?? '').length}`,
  }
}

// ─── Números do perfil ───────────────────────────────────────────────────────

export interface LogRow { at: string; source: string; client_slug: string; manager_id: string | null; actor_key: string | null; actor_name: string | null; kind: string; summary: string; object_name: string | null; detail: Record<string, unknown> | null }

const BR_MS = 3 * 3_600_000
export const brDay = (ms: number) => new Date(ms - BR_MS).toISOString().slice(0, 10)

export function countByKind(rows: Array<{ kind: string }>): Array<{ kind: ActivityKind; n: number }> {
  const m = new Map<ActivityKind, number>()
  for (const r of rows) { const k = isKind(r.kind) ? r.kind : 'other'; m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n)
}

/** Ações por dia (horário de Brasília), com os dias sem nenhuma ação também. */
export function dailyCounts(rows: Array<{ at: string }>, sinceMs: number, nowMs: number): Array<{ day: string; n: number }> {
  const by = new Map<string, number>()
  for (const r of rows) { const d = brDay(Date.parse(r.at)); by.set(d, (by.get(d) ?? 0) + 1) }
  const out: Array<{ day: string; n: number }> = []
  for (let t = sinceMs; t <= nowMs + 86_399_999; t += 86_400_000) {
    const d = brDay(t)
    if (!out.some(x => x.day === d)) out.push({ day: d, n: by.get(d) ?? 0 })
    if (d >= brDay(nowMs)) break
  }
  return out
}

export interface ClientActivity { slug: string; actions: number; optimizations: number; lastAt: string | null; byKind: Array<{ kind: ActivityKind; n: number }> }

/** Por cliente da carteira: quantas ações, quantas otimizações na Meta e quando foi a última. Cliente sem nenhuma ação aparece com zero. */
export function activityByClient(slugs: string[], rows: LogRow[]): ClientActivity[] {
  const by = new Map<string, LogRow[]>(slugs.map(s => [s, []]))
  for (const r of rows) by.get(r.client_slug)?.push(r)
  return [...by.entries()].map(([slug, list]) => ({
    slug, actions: list.length, optimizations: list.filter(r => (OPTIMIZATION_KINDS as readonly string[]).includes(r.kind)).length,
    lastAt: list.reduce<string | null>((m, r) => (!m || r.at > m ? r.at : m), null), byKind: countByKind(list),
  })).sort((a, b) => b.actions - a.actions || a.slug.localeCompare(b.slug))
}

/** Clientes da carteira sem nenhuma ação nos últimos `days` dias (a última ação pode ser mais antiga que o período mostrado). */
export function idleSlugs(lastActionBySlug: Map<string, string | null>, slugs: string[], days: number, nowMs: number): Array<{ slug: string; lastAt: string | null; daysIdle: number | null }> {
  return slugs.flatMap(slug => {
    const last = lastActionBySlug.get(slug) ?? null
    const idle = last ? Math.floor((nowMs - Date.parse(last)) / 86_400_000) : null
    return idle == null || idle >= days ? [{ slug, lastAt: last, daysIdle: idle }] : []
  }).sort((a, b) => (b.daysIdle ?? 1e9) - (a.daysIdle ?? 1e9))
}
