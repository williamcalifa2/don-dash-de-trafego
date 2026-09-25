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

export interface Manager { id: string; name: string; email: string | null; metaActorId: string | null; metaActorName: string | null; createdAt: string; /** endereço da foto (imagem à parte, com cache); nulo = sem foto */ avatarUrl: string | null }
/** `avatar`: imagem nova (data URL), `null` remove a foto, ausente mantém a que já está. */
export interface ManagerInput { name: string; email: string | null; metaActorId: string | null; metaActorName: string | null; clients: string[]; avatar?: string | null }

const AVATAR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
export const MAX_AVATAR = 200_000

/** Endereço da foto do gestor. O `v` muda quando a foto muda, então o cache longo nunca mostra foto velha. */
export function managerAvatarUrl(id: string, avatar: string | null | undefined): string | null {
  if (!avatar) return null
  let h = 5381
  for (let i = 0; i < avatar.length; i += 7) h = ((h << 5) + h + avatar.charCodeAt(i)) | 0
  return `/api/admin/managers/${id}/avatar?v=${(h >>> 0).toString(36)}${avatar.length.toString(36)}`
}

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
  const out: ManagerInput = { name, email, metaActorId: actorId, metaActorName: actorName, clients }
  if (o.avatar === null) out.avatar = null
  else if (typeof o.avatar === 'string' && o.avatar.startsWith('/api/admin/managers/')) { /* devolveu o endereço da foto atual: mantém */ }
  else if (typeof o.avatar === 'string') {
    if (o.avatar.length > MAX_AVATAR || !AVATAR.test(o.avatar)) return { error: 'Foto inválida ou grande demais. Use PNG, JPG ou WebP pequenos.' }
    out.avatar = o.avatar
  }
  return out
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

/** Ações por hora do dia (horário de Brasília): mostra quando o gestor trabalha. */
export function hourCounts(rows: Array<{ at: string }>): number[] {
  const h = new Array<number>(24).fill(0)
  for (const r of rows) h[new Date(Date.parse(r.at) - BR_MS).getUTCHours()]++
  return h
}

export function countBySource(rows: Array<{ source: string }>): { app: number; meta: number } {
  let app = 0, meta = 0
  for (const r of rows) { if (r.source === 'meta') meta++; else app++ }
  return { app, meta }
}

const NAME_STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const nameTokens = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !NAME_STOP.has(t))

/**
 * Acha, entre os autores do histórico da Meta, o usuário que é este gestor pelo nome: todas as palavras do nome do gestor
 * precisam estar no nome da Meta ("William de Castro" acha "William Castro Fagundes"). Só vale se houver um único candidato.
 * Nome de uma palavra só ("Will") exige nome igual, para não juntar pessoas diferentes.
 */
export function matchActor(name: string, actors: Array<{ id: string; name: string }>): { id: string; name: string } | null {
  const want = nameTokens(name)
  if (!want.length) return null
  const hits = actors.filter(a => {
    const have = nameTokens(a.name)
    return want.length === 1 ? have.length === 1 && have[0] === want[0] : want.every(t => have.includes(t))
  })
  return hits.length === 1 ? hits[0] : null
}

// ─── Justificativas: "por que você fez essa alteração?" ──────────────────────

/** Só otimizações viram tarefa (pausa, orçamento, público, criativo, lance, estrutura). Renomear conjunto ou ler dado não. */
export const TASK_KINDS: readonly ActivityKind[] = OPTIMIZATION_KINDS
/** Alterações do mesmo tipo, no mesmo cliente e pela mesma pessoa, com menos de 30 min entre uma e outra, viram uma tarefa só. */
export const TASK_GAP_MS = 30 * 60_000

export const REASONS: ReadonlyArray<readonly [string, string]> = [
  ['performance', 'Baixo desempenho'], ['cost', 'Custo alto'], ['scale', 'Escalar o que funciona'], ['fatigue', 'Fadiga do criativo'],
  ['test', 'Teste'], ['client', 'Pedido do cliente'], ['budget', 'Ajuste de verba'], ['fix', 'Correção de erro'], ['other', 'Outro'],
]
export const REASON_LABEL: Record<string, string> = Object.fromEntries(REASONS)
export const isReasonKind = (v: unknown): v is string => typeof v === 'string' && v in REASON_LABEL

export interface TaskRow {
  id: number; at: string; source: string; client_slug: string; manager_id: string | null; actor_key: string | null; actor_name: string | null
  kind: string; summary: string; object_name: string | null; detail: { from?: string | null; to?: string | null; level?: string } | null
  reason: string | null; reason_kind: string | null; reasoned_at: string | null
}
export interface TaskItem { summary: string; objectName: string | null; change: string | null; level: string | null }
export interface Task {
  key: string; ids: number[]; startedAt: string; at: string; clientSlug: string; managerId: string | null; actorKey: string | null; actorName: string | null
  kind: ActivityKind; count: number; items: TaskItem[]; reason: string | null; reasonKind: string | null; reasonedAt: string | null
}

/** Junta as alterações em tarefas. Uma tarefa está respondida quando alguma das alterações dela já tem justificativa. */
export function groupTasks(rows: TaskRow[], gapMs = TASK_GAP_MS): Task[] {
  const eligible = rows.filter(r => (TASK_KINDS as readonly string[]).includes(r.kind))
  const by = new Map<string, TaskRow[]>()
  for (const r of eligible) { const k = `${r.client_slug}|${r.actor_key ?? ''}|${r.kind}`; (by.get(k) ?? by.set(k, []).get(k)!).push(r) }
  const out: Task[] = []
  for (const list of by.values()) {
    list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    let cur: TaskRow[] = []
    const flush = () => {
      if (!cur.length) return
      const first = cur[0], last = cur[cur.length - 1]
      const seen = new Set<string>()
      const items: TaskItem[] = []
      for (const r of cur) {
        const change = r.detail && (r.detail.from != null || r.detail.to != null) ? `${r.detail.from ?? '—'} → ${r.detail.to ?? '—'}` : null
        const k = `${r.summary}|${r.object_name}|${change}`
        if (seen.has(k) || items.length >= 5) continue
        seen.add(k); items.push({ summary: r.summary, objectName: r.object_name, change, level: r.detail?.level ?? null })
      }
      const answered = cur.find(r => r.reason || r.reason_kind)
      out.push({
        key: String(first.id), ids: cur.map(r => r.id), startedAt: first.at, at: last.at, clientSlug: first.client_slug, managerId: last.manager_id, actorKey: first.actor_key, actorName: first.actor_name,
        kind: first.kind as ActivityKind, count: cur.length, items, reason: answered?.reason ?? null, reasonKind: answered?.reason_kind ?? null, reasonedAt: answered?.reasoned_at ?? null,
      })
      cur = []
    }
    for (const r of list) {
      if (cur.length && Date.parse(r.at) - Date.parse(cur[cur.length - 1].at) > gapMs) flush()
      cur.push(r)
    }
    flush()
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

export const isAnswered = (t: Task) => !!(t.reason || t.reasonKind)

/** De quem é a tarefa: de quem fez a alteração, se essa pessoa é um gestor cadastrado; senão, do gestor da conta. */
export function taskOwner(t: Pick<Task, 'actorKey' | 'managerId'>, managers: Array<{ id: string; email: string | null; metaActorId: string | null }>): string | null {
  const own = t.actorKey ? managers.find(m => (m.metaActorId && t.actorKey === `meta:${m.metaActorId}`) || (m.email && t.actorKey === m.email)) : undefined
  return own?.id ?? t.managerId
}

/** Valida a justificativa: um motivo da lista e/ou texto (pelo menos um dos dois). */
export function cleanReason(body: unknown): { reasonKind: string | null; reason: string | null } | { error: string } {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const kind = isReasonKind(o.reasonKind) ? o.reasonKind : null
  const text = typeof o.reason === 'string' ? o.reason.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
  if (!kind && text.length < 3) return { error: 'Escolha um motivo ou escreva a justificativa.' }
  return { reasonKind: kind, reason: text || null }
}
