/** Criativos do cliente: campeões, os que precisam de troca e a tendência do CTR. Só transforma o que já está guardado (sem chamar a Meta). */
import { getResults } from './meta'
import { analyzeFatigue, type FatigueLevel } from './creativeFatigue'

type Row = Record<string, unknown>
type Action = { action_type: string; value: string }
const n = (v: unknown) => Number(v ?? 0) || 0
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** A Meta guarda anúncio de imagem única e carrossel no mesmo tipo ("SHARE"), então aparecem juntos. */
export type CreativeFormat = 'Vídeo' | 'Imagem ou carrossel' | 'Outros'

export interface Creative {
  id: string
  name: string
  campaign: string
  status: string
  thumb: string | null
  format: CreativeFormat
  spend: number
  impressions: number
  clicks: number
  ctr: number
  frequency: number
  results: number
  costPerResult: number | null
  fatigue: FatigueLevel
  /** CTR dos últimos 7 dias e dos 7 anteriores; null se ainda não há volume para comparar */
  ctr7: number | null
  ctrPrev: number | null
  /** variação % do CTR (últimos 7 dias contra os 7 anteriores) */
  ctrTrend: number | null
  /** motivos curtos para trocar/vigiar este criativo (vazio = saudável) */
  flags: string[]
}

interface StructAd { id: string; effective_status?: string; creative?: Record<string, unknown> }

/** Volume mínimo de impressões para o CTR de uma janela valer para comparar (evita variações absurdas com poucos dados). */
export const MIN_IMPRESSIONS = 300

export const formatOf = (creative: Record<string, unknown> | undefined): CreativeFormat => {
  const t = str(creative?.object_type).toUpperCase()
  if (t === 'VIDEO') return 'Vídeo'
  if (t === 'PHOTO' || t === 'IMAGE' || t === 'SHARE' || t === 'LINK' || t === 'CAROUSEL') return 'Imagem ou carrossel'
  return 'Outros'
}

const byAd = (rows: Row[] | undefined) => new Map((rows ?? []).map(r => [str(r.ad_id), r]))

/** CTR dos 7 dias mais recentes e dos 7 anteriores, por anúncio, a partir dos períodos de 7 e 14 dias guardados. */
export function ctrWindows(r7: Row | undefined, r14: Row | undefined): { ctr7: number | null; ctrPrev: number | null; trend: number | null } {
  if (!r7 || !r14) return { ctr7: null, ctrPrev: null, trend: null }
  const i7 = n(r7.impressions), c7 = n(r7.clicks)
  const iPrev = n(r14.impressions) - i7, cPrev = n(r14.clicks) - c7
  const ctr7 = i7 >= MIN_IMPRESSIONS ? (c7 / i7) * 100 : null
  const ctrPrev = iPrev >= MIN_IMPRESSIONS && cPrev >= 0 ? (cPrev / iPrev) * 100 : null
  const trend = ctr7 != null && ctrPrev != null && ctrPrev > 0 ? Math.round(((ctr7 - ctrPrev) / ctrPrev) * 1000) / 10 : null
  return { ctr7, ctrPrev, trend }
}

export function buildCreatives(rows: Row[], rows7: Row[] | undefined, rows14: Row[] | undefined, structure: StructAd[]): Creative[] {
  const st = new Map(structure.map(a => [a.id, a]))
  const m7 = byAd(rows7), m14 = byAd(rows14)
  return rows.filter(r => n(r.spend) > 0).map(r => {
    const id = str(r.ad_id)
    const s = st.get(id)
    const spend = n(r.spend), impressions = n(r.impressions), clicks = n(r.clicks)
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : n(r.ctr)
    const frequency = n(r.frequency) || 1
    const results = getResults(r.actions as Action[] | undefined)
    const w = ctrWindows(m7.get(id), m14.get(id))
    const level = analyzeFatigue({ frequency, ctr }).level
    const flags: string[] = []
    if (level === 'critical') flags.push('Fadiga alta')
    else if (level === 'warning') flags.push('Início de fadiga')
    if (w.trend != null && w.trend <= -20) flags.push('CTR caindo')
    const creative = s?.creative
    const thumb = typeof creative?.image_url === 'string' ? creative.image_url : typeof creative?.thumbnail_url === 'string' ? creative.thumbnail_url : null
    return {
      id, name: str(r.ad_name) || id, campaign: str(r.campaign_name), status: s?.effective_status ?? '', thumb, format: formatOf(creative),
      spend, impressions, clicks, ctr, frequency, results, costPerResult: results > 0 ? spend / results : null,
      fatigue: level, ctr7: w.ctr7, ctrPrev: w.ctrPrev, ctrTrend: w.trend, flags,
    }
  })
}

/** Os melhores: mais resultados, e a igualdade quebra pelo menor custo. Só quem trouxe resultado. */
export function champions(list: Creative[], limit = 5): Creative[] {
  return list.filter(c => c.results > 0).sort((a, b) => b.results - a.results || (a.costPerResult ?? Infinity) - (b.costPerResult ?? Infinity)).slice(0, limit)
}

/** Criativos em atenção: fadiga, CTR caindo, ou muito investimento sem nenhum resultado (a partir de 2x o custo médio da conta ou R$ 60). */
export function toRenew(list: Creative[], limit = 5): Creative[] {
  const withRes = list.filter(c => c.results > 0)
  const avgCost = withRes.length ? withRes.reduce((s, c) => s + c.spend, 0) / withRes.reduce((s, c) => s + c.results, 0) : null
  const noResultLimit = avgCost != null ? Math.max(30, avgCost * 2) : 60
  const flagged = list.map(c => {
    const flags = [...c.flags]
    if (c.results === 0 && c.spend >= noResultLimit && c.status !== 'PAUSED' && !flags.includes('Sem resultado')) flags.push('Sem resultado')
    return { ...c, flags }
  }).filter(c => c.flags.length > 0 && c.status !== 'PAUSED' && c.status !== 'CAMPAIGN_PAUSED' && c.status !== 'ADSET_PAUSED')
  return flagged.sort((a, b) => b.flags.length - a.flags.length || b.spend - a.spend).slice(0, limit)
}
