/** Relatório semanal para mandar ao cliente no WhatsApp: mensagem pronta com os números dos últimos 7 dias. Só funções puras. */
import { KIND_LABELS, type ResultKind } from './resultKind'
export interface WeekNumbers {
  spend: number
  /** pessoas alcançadas */
  reach: number
  /** resultado do cliente: leads de formulário quando o tipo é "form"; senão os resultados somados */
  leads: number; results: number
  cpl: number | null; cost_per_result: number | null
  purchase_value: number; roas: number | null
}
export interface WeekCampaign { name: string; spend: number; results: number; leads: number }

/** Um número com o valor da semana anterior, quando dá para comparar (a série guardada cobre o período inteiro). */
export interface WithPrev { value: number | null; prev: number | null }

/** Engajamento, visitas ao perfil e seguidores novos: dado orgânico real (Instagram/Facebook Insights), não vem dos anúncios. */
export interface OrganicWeekly {
  engagement: WithPrev
  visits: WithPrev
  newFollowers: WithPrev
  /** verba de campanhas de visita ao perfil (achadas pelo nome); null = não deu para saber */
  spend: number | null
}
export const EMPTY_ORGANIC: OrganicWeekly = { engagement: { value: null, prev: null }, visits: { value: null, prev: null }, newFollowers: { value: null, prev: null }, spend: null }

/** Extrai engajamento, visitas ao perfil e seguidores novos do que a aba Orgânico já calcula (cada um já vem com o comparativo certo da semana anterior). */
interface OrganicKpi { key: string; value: number | null; prev: number | null }
interface OrganicLike { status: string; kpis: { ig: OrganicKpi[] } }

export function organicWeekly(view: OrganicLike | null, adSpend: number | null): OrganicWeekly {
  if (!view || view.status !== 'ok') return { ...EMPTY_ORGANIC, spend: adSpend }
  const of = (key: string): WithPrev => { const k = view.kpis.ig.find(x => x.key === key); return { value: k?.value ?? null, prev: k?.prev ?? null } }
  return { engagement: of('interactions'), visits: of('visits'), newFollowers: of('gained'), spend: adSpend }
}

/** Soma a verba das campanhas cujo nome indica visita ao perfil (convenção "VISITAS AO PERFIL" usada pela agência). Null se nenhuma bater. */
export function profileCampaignSpend(campaigns: WeekCampaign[]): number | null {
  const hit = campaigns.filter(c => /visita.*perfil|perfil.*visita|profile.*visit/i.test(c.name))
  return hit.length ? hit.reduce((n, c) => n + c.spend, 0) : null
}

export interface WeeklyInput {
  business: string
  /** datas inclusivas, "AAAA-MM-DD" */
  range: { since: string; until: string }
  kind: ResultKind
  current: WeekNumbers
  previous?: WeekNumbers | null
  campaigns: WeekCampaign[]
  profile?: OrganicWeekly | null
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v).replace(/ /g, ' ')
const int = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v))

/** "14 a 20/09" (mesmo mês) ou "28/09 a 04/10" (meses diferentes). */
export function rangeLabel(r: { since: string; until: string }): string {
  const d = (s: string) => s.slice(8, 10), m = (s: string) => s.slice(5, 7)
  return m(r.since) === m(r.until) && r.since.slice(0, 4) === r.until.slice(0, 4) ? `${d(r.since)} a ${d(r.until)}/${m(r.until)}` : `${d(r.since)}/${m(r.since)} a ${d(r.until)}/${m(r.until)}`
}

/** A semana de antes: o mesmo intervalo, 7 dias atrás. */
export function prevWeek(r: { since: string; until: string }): { since: string; until: string } {
  const back = (s: string) => new Date(Date.parse(`${s}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
  return { since: back(r.since), until: back(r.until) }
}

/** "+73%" / "-48%"; nulo sem base de comparação ou variação de zero para zero. */
function pct(cur: number, prev: number): string | null {
  if (!(prev > 0) || !Number.isFinite(cur)) return null
  const p = Math.round(((cur - prev) / prev) * 100)
  return p > 0 ? `+${p}%` : `${p}%`
}

/** " (vs N | +X%)" no formato do relatório; "" quando não há base de comparação. */
function compare(cur: number, prev: number | null): string {
  if (prev == null) return ''
  if (prev === 0) return ' (vs 0 semana anterior)'
  const p = pct(cur, prev)
  return p ? ` (vs ${int(prev)} | ${p})` : ''
}

const ICON: Record<ResultKind, string> = { conversa: '💬', form: '📝', site: '🌐', sales: '🛒', custom: '🎯', misto: '🎯' }
const RESULT: Record<ResultKind, [string, string]> = {
  conversa: ['conversa iniciada no WhatsApp', 'conversas iniciadas no WhatsApp'], form: ['lead', 'leads'], site: ['lead do site', 'leads do site'],
  sales: ['compra', 'compras'], custom: ['conversão', 'conversões'], misto: ['resultado', 'resultados'],
}
const COST_LABEL: Record<ResultKind, string> = { conversa: 'CPL médio', form: 'CPL médio', site: 'CPL médio', sales: 'CPA médio', custom: 'Custo por conversão médio', misto: 'Custo por resultado médio' }

const resultOf = (kind: ResultKind, n: WeekNumbers) => (kind === 'form' ? n.leads : n.results)
const costOf = (kind: ResultKind, n: WeekNumbers) => (kind === 'form' ? n.cpl : n.cost_per_result)

/** A mensagem, ou null quando a conta não gastou nem gerou nada na semana (e não há dado orgânico para mostrar). */
export function buildWeeklyMessage(i: WeeklyInput): string | null {
  const { current: c, previous: p, kind, profile } = i
  const res = resultOf(kind, c)
  if (c.spend <= 0 && res <= 0 && !((profile?.visits.value ?? 0) > 0)) return null
  const pw = prevWeek(i.range)
  const lines: string[] = [
    `Bom dia, pessoal! ☀️ Tudo bem? Segue o report dos últimos 7 dias (${rangeLabel(i.range)}) da ${i.business}${p ? `, com comparativo da semana anterior (${rangeLabel(pw)})` : ''}:`,
    '',
  ]
  if (c.spend > 0 || res > 0) {
    lines.push(`📊 Investimos ${brl(c.spend)} no período.`, '', 'Resultados da semana:', '')
    const [one, many] = RESULT[kind]
    const resPrev = p ? resultOf(kind, p) : null
    const resPct = resPrev != null ? pct(res, resPrev) : null
    lines.push(`${ICON[kind]} ${int(res)} ${res === 1 ? one : many}${resPrev != null && resPct ? ` (vs ${int(resPrev)} | ${resPct})` : ''}`)

    const cost = costOf(kind, c), costPrev = p ? costOf(kind, p) : null
    if (cost != null && cost > 0) {
      const cp = costPrev != null && costPrev > 0 ? pct(cost, costPrev) : null
      lines.push(`💰 ${COST_LABEL[kind]} ${brl(cost)}${cp ? ` (vs ${brl(costPrev as number)} | ${cp})` : ''}`)
    }
    if (kind === 'sales' && c.purchase_value > 0) {
      lines.push(`💵 Faturamento ${brl(c.purchase_value)}`)
      if (c.roas != null && c.roas > 0) lines.push(`📈 Retorno sobre o investimento ${c.roas.toFixed(1).replace('.', ',')}x`)
    }
  } else {
    lines.push('Sem investimento em anúncios na semana. Resultados do orgânico:', '')
  }

  const eng = profile?.engagement.value
  if (eng != null && eng > 0) lines.push(`❤️ ${int(eng)} ${eng === 1 ? 'interação no Instagram' : 'interações no Instagram'}${compare(eng, profile!.engagement.prev)}`)
  const visits = profile?.visits.value
  if (visits != null && visits > 0) {
    lines.push(`👀 ${int(visits)} ${visits === 1 ? 'visita ao perfil' : 'visitas ao perfil'}${compare(visits, profile!.visits.prev)}`)
    if (profile!.spend != null && profile!.spend > 0) lines.push(`🏷️ Custo por visita ${brl(profile!.spend / visits)}`)
  }
  const gained = profile?.newFollowers.value
  if (gained != null && gained !== 0) {
    const label = Math.abs(gained) === 1 ? 'seguidor novo' : 'seguidores novos'
    lines.push(`👥 ${gained > 0 ? '+' : ''}${int(gained)} ${label} no Instagram${compare(gained, profile!.newFollowers.prev)}`)
  }
  if (c.reach > 0) lines.push(`📣 ${int(c.reach)} ${c.reach === 1 ? 'pessoa alcançada' : 'pessoas alcançadas'}`)

  const score = (x: WeekCampaign) => resultOf(kind, { leads: x.leads, results: x.results } as WeekNumbers)
  const top = [...i.campaigns].filter(x => score(x) > 0 && x.spend > 0).sort((a, b) => score(b) - score(a) || a.spend - b.spend)[0]
  if (top) {
    const n = score(top)
    const [one, many] = RESULT[kind]
    lines.push('', `🏆 Destaque: a campanha "${top.name}" trouxe ${int(n)} ${n === 1 ? one : many} (${brl(top.spend / n)} cada).`)
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
