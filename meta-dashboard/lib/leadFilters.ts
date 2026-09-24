/** Filtros da lista de leads: tudo que dá para filtrar num lugar só. Funções puras (sem tela), para testar. */
import type { Lead, LeadStatus } from './leadTypes'
import { isStale } from './leadUtils'

export type LeadPeriod = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom'
export interface LeadFilters {
  status: LeadStatus[]
  /** novos que ninguém contatou há muito tempo */
  stale: boolean
  campanhas: string[]
  conjuntos: string[]
  anuncios: string[]
  ddds: string[]
  atendentes: string[]
  /** de onde o lead veio */
  origem: Array<'meta' | 'manual'>
  period: LeadPeriod
  from: string
  to: string
}

export const EMPTY_FILTERS: LeadFilters = { status: [], stale: false, campanhas: [], conjuntos: [], anuncios: [], ddds: [], atendentes: [], origem: [], period: 'all', from: '', to: '' }

const BR = 3 * 3_600_000
const DAY = 86_400_000
const dayKey = (t: number) => new Date(t - BR).toISOString().slice(0, 10)

/** DDD do telefone: aceita +55 e 55 na frente, com ou sem máscara. Sem dígitos suficientes, null. */
export function dddOf(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '')
  const local = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d
  return local.length >= 10 ? local.slice(0, 2) : null
}

/** Dia do lead no formato AAAA-MM-DD (dia do Brasil). */
export const leadDay = (l: Lead): string => (l.date && /^\d{4}-\d{2}-\d{2}/.test(l.date) ? l.date.slice(0, 10) : dayKey(Date.parse(l.created_at)))
export const leadOrigin = (l: Lead): 'meta' | 'manual' => (l.manual || !l.meta_lead_id ? 'manual' : 'meta')

/** Início e fim (AAAA-MM-DD, inclusive) do período; null = sem limite. */
export function periodRange(f: Pick<LeadFilters, 'period' | 'from' | 'to'>, now = Date.now()): { from: string | null; to: string | null } {
  const today = dayKey(now)
  switch (f.period) {
    case 'today': return { from: today, to: today }
    case '7d': return { from: dayKey(now - 6 * DAY), to: today }
    case '30d': return { from: dayKey(now - 29 * DAY), to: today }
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today }
    case 'custom': return { from: f.from || null, to: f.to || null }
    default: return { from: null, to: null }
  }
}

export function activeCount(f: LeadFilters): number {
  return f.status.length + (f.stale ? 1 : 0) + f.campanhas.length + f.conjuntos.length + f.anuncios.length + f.ddds.length + f.atendentes.length + f.origem.length + (f.period !== 'all' ? 1 : 0)
}

const anyOf = <T,>(sel: T[], v: T | null | undefined) => sel.length === 0 || (v != null && sel.includes(v))

/** Dentro de cada grupo vale "qualquer um"; entre grupos, "todos" (status Novo OU Perdido, E campanha X). */
export function applyFilters(leads: Lead[], f: LeadFilters, now = Date.now()): Lead[] {
  const { from, to } = periodRange(f, now)
  return leads.filter(l => {
    if (f.status.length && !f.status.includes(l.status)) return false
    if (f.stale && !isStale(l, now)) return false
    if (!anyOf(f.campanhas, l.campanha) || !anyOf(f.conjuntos, l.conjunto) || !anyOf(f.anuncios, l.ad_name)) return false
    if (!anyOf(f.ddds, dddOf(l.telefone)) || !anyOf(f.atendentes, l.atendido_por?.trim() || null)) return false
    if (f.origem.length && !f.origem.includes(leadOrigin(l))) return false
    if (from || to) { const d = leadDay(l); if ((from && d < from) || (to && d > to)) return false }
    return true
  })
}

export interface Facet { value: string; count: number }
const facet = (leads: Lead[], pick: (l: Lead) => string | null | undefined): Facet[] => {
  const m = new Map<string, number>()
  for (const l of leads) { const v = pick(l)?.trim(); if (v) m.set(v, (m.get(v) ?? 0) + 1) }
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'pt-BR', { numeric: true }))
}

/** Opções de cada filtro, com quantos leads têm cada uma (a partir de todos os leads, não só dos filtrados). */
export function facets(leads: Lead[]) {
  return {
    campanhas: facet(leads, l => l.campanha), conjuntos: facet(leads, l => l.conjunto), anuncios: facet(leads, l => l.ad_name),
    ddds: facet(leads, l => dddOf(l.telefone)).sort((a, b) => a.value.localeCompare(b.value)), atendentes: facet(leads, l => l.atendido_por),
  }
}
