/** Público e posicionamento: transforma os recortes (breakdowns) da Meta nos dados dos gráficos. Sem chamar a Meta. */
import { getResults } from './meta'

type Row = Record<string, unknown>
type Action = { action_type: string; value: string }

export interface Slice { key: string; label: string; impressions: number; reach: number; spend: number; clicks: number; results: number }
export interface AudienceRaw { platform: Row[]; device: Row[]; hour: Row[]; agegender: Row[]; region: Row[] }

export interface Audience {
  platform: Slice[]
  device: Slice[]
  /** 24 posições (0h a 23h) */
  hours: Slice[]
  age: Slice[]
  gender: Slice[]
  /** top regiões por alcance */
  regions: Slice[]
}

const n = (v: unknown) => Number(v ?? 0) || 0
const PLATFORM: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', whatsapp: 'WhatsApp', unknown: 'Outros' }
const DEVICE: Record<string, string> = { mobile_app: 'App mobile', mobile_web: 'Web mobile', desktop: 'Desktop', unknown: 'Outros' }
const GENDER: Record<string, string> = { female: 'Feminino', male: 'Masculino', unknown: 'Desconhecido' }
const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']

const slice = (key: string, label: string, r?: Row): Slice => ({
  key, label, impressions: r ? n(r.impressions) : 0, reach: r ? n(r.reach) : 0, spend: r ? n(r.spend) : 0, clicks: r ? n(r.clicks) : 0,
  results: r ? getResults(r.actions as Action[] | undefined) : 0,
})
const add = (a: Slice, b: Slice): Slice => ({ ...a, impressions: a.impressions + b.impressions, reach: a.reach + b.reach, spend: a.spend + b.spend, clicks: a.clicks + b.clicks, results: a.results + b.results })

/** Junta linhas com a mesma chave. */
function group(rows: Row[], field: string, label: (k: string) => string): Slice[] {
  const m = new Map<string, Slice>()
  for (const r of rows) {
    const k = String(r[field] ?? 'unknown') || 'unknown'
    const s = slice(k, label(k), r)
    m.set(k, m.has(k) ? add(m.get(k)!, s) : s)
  }
  return [...m.values()]
}

export function buildAudience(raw: AudienceRaw): Audience {
  const platform = group(raw.platform, 'publisher_platform', k => PLATFORM[k] ?? k).sort((a, b) => b.reach - a.reach || b.impressions - a.impressions)
  const device = group(raw.device, 'device_platform', k => DEVICE[k] ?? k).sort((a, b) => b.reach - a.reach || b.impressions - a.impressions)

  const hours: Slice[] = Array.from({ length: 24 }, (_, h) => slice(String(h), `${String(h).padStart(2, '0')}h`))
  for (const r of raw.hour) {
    const h = parseInt(String(r.hourly_stats_aggregated_by_advertiser_time_zone ?? ''), 10) // "13:00:00 - 13:59:59"
    if (Number.isInteger(h) && h >= 0 && h < 24) hours[h] = add(hours[h], slice(String(h), hours[h].label, r))
  }

  const age = AGES.map(a => group(raw.agegender.filter(r => r.age === a), 'age', () => a)[0] ?? slice(a, a))
  const gender = ['female', 'male', 'unknown'].map(g => group(raw.agegender.filter(r => String(r.gender ?? 'unknown') === g), 'gender', k => GENDER[k] ?? k)[0] ?? slice(g, GENDER[g]))

  const regions = group(raw.region, 'region', k => k).sort((a, b) => b.reach - a.reach || b.impressions - a.impressions).slice(0, 10)
  return { platform, device, hours, age, gender, regions }
}

export const hasAudienceData = (a: Audience) => a.platform.length > 0 || a.hours.some(h => h.impressions > 0) || a.regions.length > 0
