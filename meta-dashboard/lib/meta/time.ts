import type { MetaConfig } from './config'

/** Dentro do horário comercial configurado (fuso configurado). */
export function inBusinessHours(cfg: Pick<MetaConfig, 'businessTimezone' | 'businessHoursStart' | 'businessHoursEnd'>, nowMs: number): boolean {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: cfg.businessTimezone }).format(new Date(nowMs))) % 24
  return h >= cfg.businessHoursStart && h < cfg.businessHoursEnd
}
