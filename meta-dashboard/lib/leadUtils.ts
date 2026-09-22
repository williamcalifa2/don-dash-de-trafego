import type { Lead } from './leadTypes'

export const STALE_HOURS = Number(process.env.NEXT_PUBLIC_STALE_HOURS ?? 2)

/** Lead novo que ninguém contatou há mais de STALE_HOURS. Leads com mais de 3 dias são "antigos", não urgência (evita alarme em leads importados). */
export const STALE_MAX_HOURS = 72

export function isStale(lead: Lead, now = Date.now()): boolean {
  if (lead.status !== 'Novo' || lead.ultimo_contato) return false
  const ageH = (now - new Date(lead.created_at).getTime()) / 3_600_000
  return ageH > STALE_HOURS && ageH <= STALE_MAX_HOURS
}

const digitsOf = (p: string) => p.replace(/\D/g, '')

/** Link do WhatsApp: números do Brasil sem o 55 ganham o 55; os que já vêm com país ficam como estão. */
export function waLink(phone: string): string {
  const d = digitsOf(phone)
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`
}

/** +5527992949880 -> +55 (27) 99294-9880; 27992949880 -> (27) 99294-9880. Outros formatos ficam como vieram. */
export function fmtPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const d = digitsOf(phone)
  const m = d.match(/^55(\d{2})(9?\d{4})(\d{4})$/)
  if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`
  const l = d.match(/^(\d{2})(9?\d{4})(\d{4})$/)
  return l ? `(${l[1]}) ${l[2]}-${l[3]}` : phone
}

/** Telefone digitado à mão -> mesmo formato que vem do Meta (+55DDDNÚMERO). Número de fora sem "+" fica só com dígitos. */
export function normalizePhone(raw: string): string {
  const plus = raw.trim().startsWith('+')
  const d = digitsOf(raw)
  if (!d) return ''
  if (plus) return `+${d}`
  if (d.length === 10 || d.length === 11) return `+55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return `+${d}`
  return d
}

/** Dois telefones do Brasil são o mesmo número, com ou sem +55 e com qualquer máscara. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const tail = (p: string) => { const d = digitsOf(p); return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d }
  const x = tail(a), y = tail(b)
  return x.length >= 8 && x === y
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d < 7) return `há ${d} d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export const PRESET_DAYS: Record<string, number> = { today: 1, last_7d: 7, last_14d: 14, last_30d: 30 }

export function leadsInPeriod(leads: Lead[], preset: string, offsetPeriods = 0): Lead[] {
  if (preset === 'this_month') {
    // Do dia 1 até agora; o período anterior é o mesmo trecho do mês passado.
    const n = new Date()
    const start = new Date(n.getFullYear(), n.getMonth() - offsetPeriods, 1).getTime()
    const lastDay = new Date(n.getFullYear(), n.getMonth() - offsetPeriods + 1, 0).getDate()
    const end = offsetPeriods === 0 ? n.getTime() : new Date(n.getFullYear(), n.getMonth() - offsetPeriods, Math.min(n.getDate(), lastDay), 23, 59, 59, 999).getTime()
    return leads.filter(l => { const t = new Date(l.created_at).getTime(); return t >= start && t <= end })
  }
  const days = PRESET_DAYS[preset] ?? 7
  const dayMs = 86_400_000
  const now = Date.now()
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const end = preset === 'today' ? now - offsetPeriods * dayMs : now - offsetPeriods * days * dayMs
  const start = preset === 'today' ? startOfToday.getTime() - offsetPeriods * dayMs : end - days * dayMs
  return leads.filter(l => {
    const t = new Date(l.created_at).getTime()
    return t >= start && t <= end
  })
}

export interface Perf {
  spend: number
  leads: number
  andamento: number
  vendas: number
  perdidos: number
  receita: number
  cplReal: number | null
  custoVenda: number | null
  roas: number | null
  taxa: number | null
}

export function buildPerf(spend: number, leads: Lead[]): Perf {
  const vendas = leads.filter(l => l.status === 'Convertido')
  const receita = vendas.reduce((s, l) => s + (l.valor_pedido ?? 0), 0)
  return {
    spend,
    leads: leads.length,
    andamento: leads.filter(l => l.status === 'Em andamento' || l.status === 'Novo').length,
    vendas: vendas.length,
    perdidos: leads.filter(l => l.status === 'Perdido').length,
    receita,
    cplReal: leads.length > 0 && spend > 0 ? spend / leads.length : null,
    custoVenda: vendas.length > 0 && spend > 0 ? spend / vendas.length : null,
    roas: spend > 0 && receita > 0 ? receita / spend : null,
    taxa: leads.length > 0 ? (vendas.length / leads.length) * 100 : null,
  }
}

export const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
