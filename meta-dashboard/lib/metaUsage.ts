/** Consumo da API da Meta por tipo de consulta. Só funções puras. */

export type UsageType = 'insights' | 'estrutura' | 'historico' | 'conta' | 'leads' | 'organico' | 'conversoes' | 'acesso' | 'outros'

export const USAGE_LABEL: Record<UsageType, string> = {
  insights: 'Métricas e público', estrutura: 'Campanhas, conjuntos e anúncios', historico: 'Histórico de alterações', conta: 'Conta e faturamento',
  leads: 'Leads', organico: 'Orgânico (Instagram e Facebook)', conversoes: 'Conversões personalizadas', acesso: 'Acesso e token', outros: 'Outros',
}

/** O caminho gravado vem com os números trocados por `#` (ex.: `act_#/insights`). */
export function usageTypeOf(endpoint: string): UsageType {
  const p = endpoint.toLowerCase()
  if (/activities/.test(p)) return 'historico'
  if (/leadgen_forms|\/leads|^leads/.test(p)) return 'leads'
  if (/customconversions/.test(p)) return 'conversoes'
  if (/published_posts|\/media|\/stories|\/previews/.test(p) || /^#\/insights/.test(p) || /^#_#\/insights/.test(p)) return 'organico'
  if (/act_#\/insights|\/insights/.test(p)) return 'insights'
  if (/act_#\/(campaigns|adsets|ads)|^#\/(adsets|ads)/.test(p)) return 'estrutura'
  if (/debug_token|^me\//.test(p)) return 'acesso'
  if (/^act_#(\?|$)/.test(p) || /^act_#$/.test(p)) return 'conta'
  return 'outros'
}

export interface UsageRow { client_id: string | null; endpoint: string; calls: number; outcome: string; dry_run: boolean; app_pct: number | null; account_pct: number | null }

export interface UsageReport {
  calls: number
  rateLimitErrors: number
  peakAppPct: number
  peakAccountPct: number
  byType: Array<{ type: UsageType; label: string; calls: number }>
  byClient: Array<{ clientId: string; calls: number }>
}

/** Conta só o que saiu de verdade (não previsão, não bloqueada). */
export function buildReport(rows: UsageRow[]): UsageReport {
  const real = rows.filter(r => !r.dry_run && !String(r.outcome).startsWith('blocked'))
  const byType = new Map<UsageType, number>()
  const byClient = new Map<string, number>()
  let calls = 0
  for (const r of real) {
    const n = Number(r.calls ?? 1)
    calls += n
    const t = usageTypeOf(r.endpoint)
    byType.set(t, (byType.get(t) ?? 0) + n)
    if (r.client_id) byClient.set(r.client_id, (byClient.get(r.client_id) ?? 0) + n)
  }
  return {
    calls,
    rateLimitErrors: real.filter(r => r.outcome === 'rate_limit').length,
    peakAppPct: Math.max(0, ...real.map(r => Number(r.app_pct ?? 0))),
    peakAccountPct: Math.max(0, ...real.map(r => Number(r.account_pct ?? 0))),
    byType: [...byType.entries()].map(([type, c]) => ({ type, label: USAGE_LABEL[type], calls: c })).sort((a, b) => b.calls - a.calls),
    byClient: [...byClient.entries()].map(([clientId, c]) => ({ clientId, calls: c })).sort((a, b) => b.calls - a.calls),
  }
}
