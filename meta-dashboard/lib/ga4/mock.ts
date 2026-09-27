import { derive, type GaDay, type GaRange, type GaReport, type GaRow } from './report'

/** Dados de exemplo estáveis (mesma propriedade e período = mesmos números). Só com GA4_MOCK=1. */
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000 }
}
const days = (r: GaRange) => { const out: string[] = []; for (let d = new Date(`${r.since}T00:00:00Z`); d <= new Date(`${r.until}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10)); return out }

export function mockGa4(property: string, range: GaRange): GaReport {
  const r = rng(`${property}:${range.since}:${range.until}`)
  const daily: GaDay[] = days(range).map(date => { const sessions = Math.round(60 + r() * 140); return { date, sessions, keyEvents: Math.round(sessions * (0.04 + r() * 0.06)) } })
  const sessions = daily.reduce((n, d) => n + d.sessions, 0)
  const keyEvents = daily.reduce((n, d) => n + d.keyEvents, 0)
  const mk = (scale: number) => derive({ sessions: Math.round(sessions * scale), users: Math.round(sessions * 0.82 * scale), newUsers: Math.round(sessions * 0.6 * scale), engagementRate: 52 + r() * 12, avgSessionSec: 48 + r() * 60, keyEvents: Math.round(keyEvents * scale) })
  const split = (labels: string[], w: number[]): GaRow[] => {
    const sum = w.reduce((a, b) => a + b, 0)
    return labels.map((label, i) => { const s = Math.round((sessions * w[i]) / sum); return { label, sessions: s, keyEvents: Math.round(s * (0.02 + r() * 0.08)), users: Math.round(s * 0.85), engagementRate: 40 + r() * 30 } })
  }
  return {
    range, summary: mk(1), previous: mk(0.75 + r() * 0.5), daily,
    sources: split(['facebook / cpc', 'google / organic', 'Direto', 'instagram / social', 'google / cpc'], [40, 25, 15, 12, 8]),
    campaigns: split(['lead_lp_principal', 'remarketing_site', 'whatsapp_oferta'], [50, 30, 20]),
    pages: split(['/', '/promocao', '/contato', '/agendar'], [45, 25, 18, 12]),
    devices: split(['Celular', 'Computador', 'Tablet'], [72, 24, 4]),
    cities: split(['São Paulo', 'Guarulhos', 'Campinas', 'Osasco', 'Santo André'], [35, 20, 15, 12, 8]),
    live: Math.round(r() * 12), source: 'demo',
  }
}
