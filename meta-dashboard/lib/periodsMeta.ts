/** Períodos no formato do Gerenciador de Anúncios da Meta (horário de Brasília). Só funções puras. */

export type ExtraPreset = 'yesterday' | 'today_yesterday' | 'last_28d' | 'this_week' | 'last_week'
export const EXTRA_PRESETS: readonly ExtraPreset[] = ['yesterday', 'today_yesterday', 'last_28d', 'this_week', 'last_week']
export const isExtraPreset = (p: string): p is ExtraPreset => (EXTRA_PRESETS as readonly string[]).includes(p)

/** Períodos que a Meta entende direto pelo nome (`date_preset`). Os outros vão como intervalo de datas (`time_range`). */
export const NATIVE_PRESETS: ReadonlySet<string> = new Set(['today', 'yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'this_month', 'last_month'])

const DAY = 86_400_000
const fmt = (d: Date) => d.toISOString().slice(0, 10)

/** Hoje no Brasil, como data em UTC (00:00). */
function today(nowMs: number): Date {
  const br = new Date(nowMs - 3 * 3_600_000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()))
}
const shift = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
/** Segunda-feira da semana de `d` (a semana da Meta no Brasil começa na segunda). */
const monday = (d: Date) => shift(d, -((d.getUTCDay() + 6) % 7))

/** Intervalo (datas inclusivas) dos períodos extras. Outros períodos: null. */
export function extraRange(preset: string, nowMs = Date.now()): { since: string; until: string } | null {
  const t = today(nowMs)
  switch (preset) {
    case 'yesterday': return { since: fmt(shift(t, -1)), until: fmt(shift(t, -1)) }
    case 'today_yesterday': return { since: fmt(shift(t, -1)), until: fmt(t) }
    case 'last_28d': return { since: fmt(shift(t, -28)), until: fmt(shift(t, -1)) } // como a Meta: 28 dias sem contar hoje
    case 'this_week': return { since: fmt(monday(t)), until: fmt(t) }
    case 'last_week': { const m = shift(monday(t), -7); return { since: fmt(m), until: fmt(shift(m, 6)) } }
    default: return null
  }
}

/** Período anterior equivalente, para o comparativo (mesmo tamanho, logo antes). */
export function prevExtraRange(preset: string, nowMs = Date.now()): { since: string; until: string } | null {
  const t = today(nowMs)
  switch (preset) {
    case 'yesterday': return { since: fmt(shift(t, -2)), until: fmt(shift(t, -2)) }
    case 'today_yesterday': return { since: fmt(shift(t, -3)), until: fmt(shift(t, -2)) }
    case 'last_28d': return { since: fmt(shift(t, -56)), until: fmt(shift(t, -29)) }
    case 'this_week': { const m = monday(t); const days = Math.round((t.getTime() - m.getTime()) / DAY); const pm = shift(m, -7); return { since: fmt(pm), until: fmt(shift(pm, days)) } }
    case 'last_week': { const pm = shift(monday(t), -14); return { since: fmt(pm), until: fmt(shift(pm, 6)) } }
    default: return null
  }
}

/** Trecho da consulta à Meta: nome do período quando ela conhece, senão o intervalo de datas. */
export function periodQuery(preset: string, range: { since: string; until: string } | null): string {
  if (NATIVE_PRESETS.has(preset) || !range) return `date_preset=${preset}`
  return `time_range=${encodeURIComponent(`{"since":"${range.since}","until":"${range.until}"}`)}`
}

/** Períodos da lista, na ordem e com os nomes do seletor da Meta. Cada um carrega sob demanda; "Este mês" e "Mês passado" mostram o nome do mês. */
export function dashboardPresets(nowMs = Date.now()): Array<{ value: string; label: string }> {
  const br = new Date(nowMs - 3 * 3_600_000)
  const M = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const cur = M[br.getUTCMonth()]
  const prev = M[(br.getUTCMonth() + 11) % 12]
  return [
    { value: 'today', label: 'Hoje' },
    { value: 'yesterday', label: 'Ontem' },
    { value: 'today_yesterday', label: 'Hoje e ontem' },
    { value: 'last_7d', label: 'Últimos 7 dias' },
    { value: 'last_14d', label: 'Últimos 14 dias' },
    { value: 'last_28d', label: 'Últimos 28 dias' },
    { value: 'last_30d', label: 'Últimos 30 dias' },
    { value: 'this_week', label: 'Esta semana' },
    { value: 'last_week', label: 'Semana passada' },
    { value: 'this_month', label: `Este mês (${cur})` },
    { value: 'last_month', label: `Mês passado (${prev})` },
  ]
}

/** Todos os períodos que as rotas de métricas aceitam (os meses antigos ficam por compatibilidade com endereços salvos). */
export const METRIC_PRESETS = ['today', 'yesterday', 'today_yesterday', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'this_week', 'last_week', 'this_month', 'last_month', 'month_2', 'month_3'] as const
