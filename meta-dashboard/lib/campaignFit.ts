/**
 * Custo por lead, por conversa ou por compra só pode considerar as campanhas daquele objetivo.
 * Campanha de tráfego, alcance, engajamento ou vídeo gasta verba mas não gera lead: se entrasse na conta, o custo por lead ficaria inflado.
 */
import type { ResultKind } from './resultKind'

const LEADS = new Set(['OUTCOME_LEADS', 'LEAD_GENERATION'])
const MESSAGES = new Set(['MESSAGES', 'OUTCOME_LEADS'])
const SALES = new Set(['OUTCOME_SALES', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES'])

export interface FitCampaign { objective?: string | null; spend: number; results: number; leads: number }

/**
 * A campanha é do tipo de resultado do cliente?
 * Objetivo conhecido decide (campanha de lead sem nenhum lead ainda conta: gastou e não converteu). Sem objetivo, vale quem gerou o resultado.
 * Tipos "misto" e "conversão personalizada" não filtram: não há um objetivo único.
 */
export function fitsKind(kind: ResultKind, c: FitCampaign): boolean {
  const o = (c.objective ?? '').toUpperCase()
  switch (kind) {
    case 'form': case 'site': return LEADS.has(o) || (!o && c.leads > 0) || (o !== '' && !LEADS.has(o) && c.leads > 0 && !isNoResultObjective(o))
    case 'conversa': return MESSAGES.has(o) || (!o && c.results > 0) || (o !== '' && !MESSAGES.has(o) && c.results > 0 && !isNoResultObjective(o))
    case 'sales': return SALES.has(o) || (!o && c.results > 0) || (o !== '' && !SALES.has(o) && c.results > 0 && !isNoResultObjective(o))
    default: return true
  }
}

/** Tráfego, alcance, reconhecimento, vídeo e interação nunca contam, mesmo que apareça algum resultado perdido. */
function isNoResultObjective(o: string): boolean {
  return /TRAFFIC|LINK_CLICKS|AWARENESS|REACH|VIDEO|POST_ENGAGEMENT|PAGE_LIKES|ENGAGEMENT|APP_/.test(o) && o !== 'MESSAGES'
}

export interface CostBase { spend: number; results: number; leads: number; campaigns: number; total: number }

/** Verba e resultados só das campanhas do tipo. `campaigns === total` = nada foi excluído. */
export function costBase(kind: ResultKind, camps: FitCampaign[]): CostBase {
  const fit = camps.filter(c => fitsKind(kind, c))
  return { spend: fit.reduce((n, c) => n + c.spend, 0), results: fit.reduce((n, c) => n + c.results, 0), leads: fit.reduce((n, c) => n + c.leads, 0), campaigns: fit.length, total: camps.length }
}
