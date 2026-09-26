/** Resumo do período: quantos objetos (campanhas, conjuntos, anúncios) cada gestor criou, pausou, ativou e quantos orçamentos, públicos, lances e criativos alterou. Só funções puras. */
import { classifyChange, type LogRow } from './managers'

export const LEVELS = ['campanha', 'conjunto', 'anúncio'] as const
export type Level = (typeof LEVELS)[number]
export const VERBS = ['criou', 'pausou', 'ativou'] as const
export const THINGS = ['orcamento', 'publico', 'lance', 'criativo'] as const

export interface Counts {
  criou: Record<Level, number>; pausou: Record<Level, number>; ativou: Record<Level, number>
  orcamento: number; publico: number; lance: number; criativo: number
}

export const emptyCounts = (): Counts => ({
  criou: { campanha: 0, conjunto: 0, 'anúncio': 0 }, pausou: { campanha: 0, conjunto: 0, 'anúncio': 0 }, ativou: { campanha: 0, conjunto: 0, 'anúncio': 0 },
  orcamento: 0, publico: 0, lance: 0, criativo: 0,
})

export const sumLevels = (r: Record<Level, number>) => r.campanha + r.conjunto + r['anúncio']
export const totalOf = (c: Counts) => sumLevels(c.criou) + sumLevels(c.pausou) + sumLevels(c.ativou) + c.orcamento + c.publico + c.lance + c.criativo

/** Um objeto é contado uma vez por tipo de ação, mesmo que tenha mudado várias vezes no período. O id da Meta identifica; sem ele, o nome. */
const objectKey = (r: LogRow) => `${r.client_slug}|${(r.detail as { objectId?: string } | null)?.objectId ?? r.object_name ?? ''}`

/**
 * Agrupa as ações por `groupOf` (gestor, cliente…). Linha sem grupo é ignorada.
 * Devolve, por grupo, os números do resumo.
 */
export function summarize(rows: LogRow[], groupOf: (r: LogRow) => string | null): Map<string, Counts> {
  const seen = new Map<string, Set<string>>()
  const out = new Map<string, Counts>()
  for (const r of rows) {
    const g = groupOf(r)
    if (g == null) continue
    const c = classifyChange({ kind: r.kind, event_type: r.event_type ?? null, object_type: r.object_type ?? null, detail: r.detail as never, summary: r.summary })
    if (!c) continue
    const slot = c.action === 'criou' || c.action === 'pausou' || c.action === 'ativou' ? `${c.action}|${c.level ?? ''}` : c.action === 'alterou' ? null : c.action
    if (!slot) continue
    const key = `${g}|${slot}|${objectKey(r)}`
    const s = seen.get(key)
    if (s) continue
    seen.set(key, new Set())
    const cur = out.get(g) ?? emptyCounts()
    if (c.action === 'criou' || c.action === 'pausou' || c.action === 'ativou') { if (c.level) cur[c.action][c.level]++ }
    else cur[c.action as (typeof THINGS)[number]]++
    out.set(g, cur)
  }
  return out
}

export function addCounts(a: Counts, b: Counts): Counts {
  const r = emptyCounts()
  for (const v of VERBS) for (const l of LEVELS) r[v][l] = a[v][l] + b[v][l]
  for (const t of THINGS) r[t] = a[t] + b[t]
  return r
}
