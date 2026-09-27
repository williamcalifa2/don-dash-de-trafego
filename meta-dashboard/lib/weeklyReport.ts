/** Relatório semanal para mandar ao cliente no WhatsApp: mensagem pronta com os números dos últimos 7 dias. Só funções puras. */
import { KIND_LABELS, type ResultKind } from './resultKind'

export interface WeekNumbers {
  spend: number; clicks: number; link_clicks: number; ctr: number
  /** resultado do cliente: leads de formulário quando o tipo é "form"; senão os resultados somados */
  leads: number; results: number
  cpl: number | null; cost_per_result: number | null
  purchase_value: number; roas: number | null
}
export interface WeekCampaign { name: string; spend: number; results: number; leads: number; cost_per_result?: number | null; cpl?: number | null }

export interface WeeklyInput {
  business: string
  /** datas inclusivas, "AAAA-MM-DD" */
  range: { since: string; until: string }
  kind: ResultKind
  current: WeekNumbers
  previous?: WeekNumbers | null
  campaigns: WeekCampaign[]
}

const brl = (v: number, digits = 2) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
const int = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v))
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** "(+12%)" ou "(−9%)"; nada quando não há base de comparação. */
export function delta(cur: number, prev: number | null | undefined): string {
  if (prev == null || !Number.isFinite(prev) || prev <= 0 || !Number.isFinite(cur)) return ''
  const p = Math.round(((cur - prev) / prev) * 100)
  if (p === 0) return ' (igual à semana anterior)'
  return ` (${p > 0 ? '+' : '−'}${Math.abs(p)}% vs semana anterior)`
}

const ICON: Record<ResultKind, string> = { form: '📝', site: '🌐', conversa: '💬', sales: '🛒', custom: '🎯', misto: '🎯' }
const RESULT_LABEL: Record<ResultKind, string> = { form: 'Leads', site: 'Leads do site', conversa: 'Conversas iniciadas', sales: 'Compras', custom: 'Conversões', misto: 'Resultados' }

const resultOf = (kind: ResultKind, n: WeekNumbers) => (kind === 'form' ? n.leads : n.results)
const costOf = (kind: ResultKind, n: WeekNumbers) => (kind === 'form' ? n.cpl : n.cost_per_result)

/** A mensagem, ou null quando a conta não gastou nem gerou nada na semana. */
export function buildWeeklyMessage(i: WeeklyInput): string | null {
  const { current: c, previous: p, kind } = i
  const res = resultOf(kind, c)
  if (c.spend <= 0 && res <= 0) return null
  const L = KIND_LABELS[kind]
  const lines: string[] = [
    'Bom dia, pessoal! ☀️',
    '',
    `Segue o resumo da semana (${dm(i.range.since)} a ${dm(i.range.until)}) da ${i.business}:`,
    '',
    `📊 Investimento: ${brl(c.spend)}${delta(c.spend, p?.spend)}`,
    `${ICON[kind]} ${RESULT_LABEL[kind]}: ${int(res)}${p ? delta(res, resultOf(kind, p)) : ''}`,
  ]
  const cost = costOf(kind, c)
  if (cost != null && cost > 0) lines.push(`💰 ${L.costFull}: ${brl(cost)}${p ? delta(cost, costOf(kind, p)) : ''}`)
  if (kind === 'sales' && c.purchase_value > 0) {
    lines.push(`💵 Faturamento: ${brl(c.purchase_value)}`)
    if (c.roas != null && c.roas > 0) lines.push(`📈 Retorno sobre o investimento: ${c.roas.toFixed(1).replace('.', ',')}x`)
  }
  const clicks = c.link_clicks || c.clicks
  if (clicks > 0) lines.push(`👆 Cliques: ${int(clicks)}${c.ctr > 0 ? ` · CTR ${c.ctr.toFixed(1).replace('.', ',')}%` : ''}`)

  const top = [...i.campaigns].filter(x => resultOf(kind, { leads: x.leads, results: x.results } as WeekNumbers) > 0 && x.spend > 0)
    .sort((a, b) => resultOf(kind, { leads: b.leads, results: b.results } as WeekNumbers) - resultOf(kind, { leads: a.leads, results: a.results } as WeekNumbers) || a.spend - b.spend)[0]
  if (top) {
    const n = resultOf(kind, { leads: top.leads, results: top.results } as WeekNumbers)
    lines.push('', `🏆 Destaque: a campanha "${top.name}" trouxe ${int(n)} ${n === 1 ? L.one : L.many.toLowerCase()} (${brl(top.spend / n)} cada).`)
  }
  lines.push('', 'Qualquer dúvida, é só chamar! 🙌')
  return lines.join('\n')
}

/** Segunda-feira da semana atual no Brasil ("AAAA-MM-DD"): identifica o relatório da semana. */
export function weekKeyBr(nowMs = Date.now()): string {
  const br = new Date(nowMs - 3 * 3_600_000)
  const d = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Datas dos "últimos 7 dias" da Meta (sem contar hoje), no Brasil. Na segunda: a semana anterior inteira. */
export function last7Range(nowMs = Date.now()): { since: string; until: string } {
  const br = new Date(nowMs - 3 * 3_600_000)
  const t = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate())
  const f = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return { since: f(t - 7 * 86_400_000), until: f(t - 86_400_000) }
}
