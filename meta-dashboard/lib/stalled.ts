/** Contas sem movimento: para cada conta da carteira de um gestor, há quantos dias ele não mexeu nela e não abriu no painel. Só funções puras. */

export type StalledBy = 'action' | 'access' | 'any'
export const STALLED_DAYS = [3, 7, 14] as const

export interface StalledInput {
  managers: Array<{ id: string; name: string; email: string | null; avatarUrl: string | null }>
  /** cliente → gestor responsável */
  byClient: Map<string, string>
  /** cliente → data da última ação (alteração na conta, feita por qualquer pessoa) */
  lastAction: Map<string, string>
  /** `${e-mail do gestor}|${cliente}` → última vez que o gestor abriu o cliente no painel */
  lastAccess: Map<string, string>
  names: Map<string, string>
  /** clientes pausados ficam de fora */
  paused: Set<string>
  now: number
}

export interface StalledRow {
  managerId: string; managerName: string; managerAvatar: string | null
  slug: string; clientName: string
  lastAction: string | null; lastAccess: string | null
  /** dias desde a última ação (nulo = nenhuma registrada) */
  daysAction: number | null
  /** dias desde o último acesso do gestor ao cliente no painel (nulo = nunca, ou gestor sem e-mail ligado) */
  daysAccess: number | null
  /** o maior dos dois: há quantos dias a conta está sem movimento */
  daysIdle: number | null
  /** gestor sem e-mail ligado: não dá para saber se abriu no painel */
  accessUnknown: boolean
}

const dayDiff = (iso: string | null | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000)) : null)

export function buildStalled(i: StalledInput, days: number, by: StalledBy): StalledRow[] {
  const mgr = new Map(i.managers.map(m => [m.id, m]))
  const rows: StalledRow[] = []
  for (const [slug, mid] of i.byClient) {
    const m = mgr.get(mid)
    if (!m || i.paused.has(slug)) continue
    const lastAction = i.lastAction.get(slug) ?? null
    const lastAccess = m.email ? i.lastAccess.get(`${m.email}|${slug}`) ?? null : null
    const daysAction = dayDiff(lastAction, i.now)
    const daysAccess = dayDiff(lastAccess, i.now)
    const accessUnknown = !m.email
    // Nunca (nulo) conta como parada há tempo indeterminado.
    const A = daysAction ?? Infinity
    const C = accessUnknown ? Infinity : daysAccess ?? Infinity
    const hit = by === 'action' ? A >= days : by === 'access' ? !accessUnknown && C >= days : A >= days && (accessUnknown || C >= days)
    if (!hit) continue
    // "Parada" = sem ação E sem abrir: o que aconteceu por último.
    const both = accessUnknown ? A : Math.min(A, C)
    rows.push({ managerId: m.id, managerName: m.name, managerAvatar: m.avatarUrl, slug, clientName: i.names.get(slug) ?? slug, lastAction, lastAccess, daysAction, daysAccess, daysIdle: Number.isFinite(both) ? both : null, accessUnknown })
  }
  const key = (r: StalledRow) => (by === 'access' ? r.daysAccess : by === 'action' ? r.daysAction : r.daysIdle) ?? 1e9
  return rows.sort((a, b) => key(b) - key(a) || a.managerName.localeCompare(b.managerName, 'pt-BR') || a.clientName.localeCompare(b.clientName, 'pt-BR'))
}

export function countByManager(rows: StalledRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.managerId, (m.get(r.managerId) ?? 0) + 1)
  return m
}
