/** Estado de uma resposta de métricas: números de verdade ou "ainda sem leitura". Sem leitura, os números vêm zerados e NÃO podem aparecer nem ser guardados como se fossem reais. */
export interface MetricsLike { freshness?: { pending?: boolean } | null; summary?: unknown }

/** A Meta ainda não foi lida para este período: tudo que veio é zero de mentira. */
export const isAwaitingData = (m: MetricsLike | null | undefined): boolean => m?.freshness?.pending === true

/** Só guarda no cache do navegador o que é número de verdade. */
export const shouldCacheMetrics = (m: MetricsLike | null | undefined, ok: boolean): boolean => ok && !!m?.summary && !isAwaitingData(m)

/** Por que a busca na Meta não rodou, em português. */
export function refreshReasonText(reason: string | undefined | null): string | null {
  if (!reason) return null
  if (reason === 'disabled') return 'A leitura automática da Meta está em modo de teste (DRY_RUN) e não busca dados novos.'
  if (reason === 'cap_app_hour') return 'O limite de leituras por hora do app foi atingido. Volta sozinho quando a hora virar.'
  if (reason === 'cap_account_hour') return 'O limite de leituras desta conta na hora foi atingido. Volta sozinho.'
  if (reason === 'paused') return 'A atualização desta conta está pausada.'
  if (reason === 'blocked' || reason === 'rate_limit' || reason === 'cooldown') return 'A Meta pediu para reduzir o ritmo. Volta sozinho em alguns minutos.'
  if (reason === 'not_available') return 'A leitura ainda não está disponível para esta conta.'
  return `Não consegui buscar agora (${reason}).`
}
