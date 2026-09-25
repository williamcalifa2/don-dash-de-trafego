/** Faturamento das contas de anúncios: situação da conta, forma de pagamento, saldo e alertas. Só funções puras. */

/** Campos lidos de cada conta (todos na allowlist, somente leitura). */
export const BILLING_FIELDS = 'name,currency,account_status,disable_reason,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details'

export interface RawAccount {
  name?: string; currency?: string; account_status?: number | string; disable_reason?: number | string
  balance?: string | number; amount_spent?: string | number; spend_cap?: string | number; is_prepay_account?: boolean
  funding_source_details?: { id?: string; type?: number | string; display_string?: string } | null
}

export type Severity = 'ok' | 'attention' | 'critical'
export type PayKind = 'prepaid' | 'card' | 'credit' | 'debit' | 'paypal' | 'other' | 'none'

export interface Billing {
  status: { code: number; label: string; severity: Severity }
  disableReason: string | null
  currency: string
  pay: { kind: PayKind; label: string }
  /** Pré-pago: saldo disponível. Pós-pago: null. */
  available: number | null
  /** Pós-pago: quanto já foi gasto e ainda vai ser cobrado. */
  owed: number | null
  spent: number
  spendCap: number | null
  capLeftPct: number | null
  alerts: Array<{ severity: Severity; text: string }>
  severity: Severity
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
/** Meta devolve valores em centavos (menor unidade), como texto. */
export const minor = (v: unknown) => Math.round(num(v)) / 100

const STATUS: Record<number, { label: string; severity: Severity }> = {
  1: { label: 'Ativa', severity: 'ok' },
  2: { label: 'Desativada', severity: 'critical' },
  3: { label: 'Pagamento pendente', severity: 'critical' },
  7: { label: 'Em análise de risco', severity: 'attention' },
  8: { label: 'Aguardando liquidação', severity: 'attention' },
  9: { label: 'Prazo de carência', severity: 'attention' },
  100: { label: 'Fechamento pendente', severity: 'critical' },
  101: { label: 'Fechada', severity: 'critical' },
  201: { label: 'Ativa', severity: 'ok' },
  202: { label: 'Fechada', severity: 'critical' },
}

const DISABLE: Record<number, string> = {
  1: 'Política de anúncios (integridade)', 2: 'Análise de propriedade intelectual', 3: 'Análise de risco de pagamento', 4: 'Conta encerrada por atividade suspeita',
  5: 'Análise de fraude', 6: 'Integridade do negócio', 7: 'Encerrada permanentemente', 8: 'Conta de revendedor sem uso', 9: 'Conta sem uso', 11: 'Integridade do Gerenciador de Negócios', 12: 'Representação incorreta',
}

/** Tipos de forma de pagamento (funding_source_details.type). 20 = saldo pré-pago. */
function payOf(raw: RawAccount): { kind: PayKind; label: string } {
  const f = raw.funding_source_details
  const t = Number(f?.type)
  const label = f?.display_string?.trim()
  if (raw.is_prepay_account || t === 20) return { kind: 'prepaid', label: 'Saldo disponível' }
  if (!f && !label) return { kind: 'none', label: 'Sem forma de pagamento' }
  if (t === 1) return { kind: 'card', label: label || 'Cartão' }
  if (t === 4) return { kind: 'debit', label: label || 'Débito direto' }
  if (t === 12 || t === 15) return { kind: 'credit', label: label || 'Linha de crédito' }
  if (t === 2) return { kind: 'paypal', label: label || 'PayPal' }
  return { kind: 'other', label: label || 'Outra forma' }
}

/** Valor dentro de um texto como "Saldo disponível (R$ 0,74)" ou "Available balance (R$0.74)". Aceita vírgula ou ponto decimal. */
export function amountInText(text: string | undefined | null): number | null {
  const m = text?.match(/(\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2}|\d+)(?!.*\d)/)
  if (!m) return null
  let s = m[1].replace(/\s/g, '')
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  if (lastSep >= 0 && s.length - lastSep - 1 === 2) s = `${s.slice(0, lastSep).replace(/[.,]/g, '')}.${s.slice(lastSep + 1)}`
  else s = s.replace(/[.,]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Abaixo disso, uma conta pré-paga é sinalizada (na moeda da conta). */
export const LOW_PREPAID = 100

export function billingOf(raw: RawAccount): Billing {
  const code = Number(raw.account_status) || 0
  const st = STATUS[code] ?? { label: 'Situação desconhecida', severity: 'attention' as Severity }
  const currency = raw.currency || 'BRL'
  const pay = payOf(raw)
  const spent = minor(raw.amount_spent)
  const cap = num(raw.spend_cap) > 0 ? minor(raw.spend_cap) : null
  const available = pay.kind === 'prepaid' ? amountInText(raw.funding_source_details?.display_string) : null
  const owed = pay.kind === 'prepaid' ? null : minor(raw.balance)
  const capLeftPct = cap ? Math.max(0, Math.round(((cap - spent) / cap) * 100)) : null
  const dr = Number(raw.disable_reason)

  const alerts: Billing['alerts'] = []
  if (st.severity !== 'ok') alerts.push({ severity: st.severity, text: code === 3 ? 'Pagamento pendente: a conta pode parar de veicular.' : code === 9 ? 'Conta em prazo de carência de pagamento.' : st.label })
  if (dr > 0 && DISABLE[dr]) alerts.push({ severity: 'critical', text: `Motivo: ${DISABLE[dr]}` })
  if (pay.kind === 'none' && code === 1) alerts.push({ severity: 'critical', text: 'Sem forma de pagamento cadastrada.' })
  if (pay.kind === 'prepaid' && available != null) {
    if (available <= 0) alerts.push({ severity: 'critical', text: 'Saldo zerado: os anúncios param.' })
    else if (available < LOW_PREPAID) alerts.push({ severity: 'attention', text: 'Saldo baixo.' })
  }
  // Só o limite esgotado alerta (a conta para de veicular); "restam X%" é só informação na coluna Limite.
  if (capLeftPct === 0) alerts.push({ severity: 'critical', text: 'Limite de gastos da conta atingido.' })

  const severity: Severity = alerts.some(a => a.severity === 'critical') ? 'critical' : alerts.length ? 'attention' : 'ok'
  return { status: { code, ...st }, disableReason: dr > 0 ? DISABLE[dr] ?? null : null, currency, pay, available, owed, spent, spendCap: cap, capLeftPct, alerts, severity }
}

const RANK: Record<Severity, number> = { critical: 0, attention: 1, ok: 2 }
/** Contas que pedem ação primeiro. */
export const bySeverity = <T extends { severity: Severity; name: string }>(a: T, b: T) => RANK[a.severity] - RANK[b.severity] || a.name.localeCompare(b.name, 'pt-BR')
