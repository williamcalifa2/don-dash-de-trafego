/** Períodos dos números do painel de controle. Módulo leve, seguro para usar no navegador. */
export const PERIODS = [7, 14, 30] as const
export type PeriodDays = (typeof PERIODS)[number]

/** O que o admin escolhe no topo: hoje, os últimos N dias ou o mês corrente (do dia 1 até hoje). */
export type AdminPeriod = 'today' | PeriodDays | 'month'
export const ADMIN_PERIODS: ReadonlyArray<{ v: AdminPeriod; label: string; noun: string }> = [
  { v: 'today', label: 'Hoje', noun: 'hoje' },
  { v: 7, label: '7 dias', noun: '7 dias' },
  { v: 14, label: '14 dias', noun: '14 dias' },
  { v: 30, label: '30 dias', noun: '30 dias' },
  { v: 'month', label: 'Este mês', noun: 'este mês' },
]
export const ADMIN_PERIOD_KEYS: ReadonlyArray<AdminPeriod> = ADMIN_PERIODS.map(p => p.v)
export const parseAdminPeriod = (raw: unknown): AdminPeriod | null => {
  const s = String(raw)
  return s === 'today' || s === 'month' ? s : (PERIODS as readonly number[]).includes(Number(s)) ? (Number(s) as PeriodDays) : null
}
