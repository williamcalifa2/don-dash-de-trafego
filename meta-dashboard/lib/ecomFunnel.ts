/** Funil real da loja: visitas, carrinho e checkout vêm do pixel; pedidos e pagos, da Shopify. Sem pixel, só mostra o que a loja informa. */
export interface FunnelInput { sessions: number; carts: number; checkouts: number; orders: number; paid: number }

export interface FunnelStep { key: 'sessions' | 'carts' | 'checkouts' | 'orders' | 'paid'; label: string; note: string; value: number | null; /** % que avançou da etapa anterior; null quando não dá para calcular */ rate: number | null; /** largura da barra, 0–100, em relação à maior etapa */ bar: number }

export function buildFunnel(f: FunnelInput, pixel: boolean): FunnelStep[] {
  const raw: Array<[FunnelStep['key'], string, string, number | null]> = [
    ['sessions', 'Visitas', 'Sessões na loja', pixel ? f.sessions : null],
    ['carts', 'Carrinho', 'Colocaram produto na sacola', pixel ? f.carts : null],
    ['checkouts', 'Checkout', 'Iniciaram o pagamento', pixel ? f.checkouts : null],
    ['orders', 'Pedidos', 'Criados na loja', f.orders],
    ['paid', 'Pagos', 'Pagamento aprovado', f.paid],
  ]
  const max = Math.max(1, ...raw.map(r => r[3] ?? 0))
  return raw.map(([key, label, note, value], i) => {
    const prev = i > 0 ? raw[i - 1][3] : null
    const rate = value != null && prev != null && prev > 0 ? Math.round((value / prev) * 1000) / 10 : null
    return { key, label, note, value, rate: rate != null ? Math.min(rate, 100) : null, bar: value != null ? Math.round((value / max) * 100) : 0 }
  })
}

/** Quantos visitantes distintos fizeram algo (dado um evento por linha com o id da sessão). */
export const distinct = (sids: Array<string | null | undefined>): number => new Set(sids.filter(Boolean)).size

export function conversionRate(paid: number, sessions: number): number | null {
  return sessions > 0 ? Math.round((paid / sessions) * 10000) / 100 : null
}

const BR_MS = 3 * 3_600_000
const DAY_MS = 86_400_000

/** Janela do período escolhido no painel, no horário do Brasil: `until` é nulo quando vai até agora. Período desconhecido vale 30 dias. */
export function presetRangeBr(preset: string | null | undefined, now = Date.now()): { since: string; until: string | null } {
  const local = now - BR_MS
  const dayStart = local - (((local % DAY_MS) + DAY_MS) % DAY_MS) // 00:00 de hoje (Brasil), em ms "locais"
  const back = (n: number) => new Date(dayStart - n * DAY_MS + BR_MS).toISOString()
  const d = new Date(dayStart)
  const monthStart = (offset: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1) + BR_MS).toISOString()
  switch (preset) {
    case 'today': return { since: back(0), until: null }
    case 'last_7d': return { since: back(6), until: null }
    case 'last_14d': return { since: back(13), until: null }
    case 'this_month': return { since: monthStart(0), until: null }
    case 'last_month': return { since: monthStart(1), until: monthStart(0) }
    case 'month_2': return { since: monthStart(2), until: monthStart(1) }
    case 'month_3': return { since: monthStart(3), until: monthStart(2) }
    default: return { since: back(29), until: null }
  }
}
