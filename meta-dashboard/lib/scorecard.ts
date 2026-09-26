/** Placar de um gestor para o card da gestão: o que ELE fez (não o que aconteceu nas contas), quantas contas ficaram sem movimento e se justifica o que faz. */
import { OPTIMIZATION_KINDS } from './managers'

export interface ScoreRow { at: string; client_slug: string; actor_key: string | null; kind: string }

export interface Score {
  /** otimizações feitas por ele no período; nulo se não há e-mail nem usuário da Meta ligado (não dá para saber quem fez) */
  made: number | null
  /** contas da carteira com pelo menos uma otimização (de quem for) no período, e o total de contas ativas da carteira */
  worked: number; total: number
  /** contas ativas da carteira sem nenhuma ação há `stalledDays` dias ou mais */
  stalled: number
  /** % das otimizações dele (últimos 30 dias) que já têm justificativa; nulo se não teve nenhuma */
  justifiedPct: number | null
  /** última ação feita por ele */
  lastOwnAt: string | null
}

const HOUSEKEEPING = new Set(['sync', 'access'])
const isOpt = (k: string) => (OPTIMIZATION_KINDS as readonly string[]).includes(k)

export function scoreOf(o: {
  manager: { email: string | null; metaActorId: string | null }
  /** contas ativas da carteira */
  slugs: string[]
  /** histórico dos últimos 30 dias */
  rows: ScoreRow[]
  sinceMs: number; nowMs: number; stalledDays: number
  tasks: Array<{ answered: boolean }>
}): Score {
  const keys = new Set([o.manager.email?.toLowerCase(), o.manager.metaActorId ? `meta:${o.manager.metaActorId}` : null].filter((x): x is string => !!x))
  const mine = new Set(o.slugs)
  let made = 0, lastOwnAt: string | null = null
  const worked = new Set<string>()
  const lastAny = new Map<string, number>()
  for (const r of o.rows) {
    const t = Date.parse(r.at)
    const own = !!r.actor_key && keys.has(r.actor_key.toLowerCase())
    if (own && !HOUSEKEEPING.has(r.kind) && (!lastOwnAt || r.at > lastOwnAt)) lastOwnAt = r.at
    if (mine.has(r.client_slug)) {
      if (!HOUSEKEEPING.has(r.kind) && t > (lastAny.get(r.client_slug) ?? 0)) lastAny.set(r.client_slug, t)
      if (t >= o.sinceMs && isOpt(r.kind)) worked.add(r.client_slug)
    }
    if (own && t >= o.sinceMs && isOpt(r.kind)) made++
  }
  const limit = o.nowMs - o.stalledDays * 86_400_000
  const stalled = o.slugs.filter(s => (lastAny.get(s) ?? 0) < limit).length
  const answered = o.tasks.filter(t => t.answered).length
  return {
    made: keys.size ? made : null, worked: worked.size, total: o.slugs.length, stalled,
    justifiedPct: o.tasks.length ? Math.round((answered / o.tasks.length) * 100) : null, lastOwnAt: keys.size ? lastOwnAt : null,
  }
}
