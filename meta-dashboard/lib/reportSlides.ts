/**
 * Slides do relatório mensal como dados (posição, texto, cor), num palco de 1280 x 720.
 * A mesma descrição desenha a tela do editor e gera o PowerPoint, então o que se vê é o que se baixa.
 */
import { compact, deltaLabel, pct, type ReportData, type ReportMode, type ReportNotes, type ReportPost, type ReportAd, type ReportStat } from './report'
export { compact }


export const STAGE = { w: 1280, h: 720 }

export const PALETTE = {
  dark: '#080B11',
  light: '#FFFFFF',
  card: '#0F172A',
  cardBorder: '#1E293B',
  cardSoft: '#131927',
  violet: '#6366F1',
  violetLight: '#818CF8',
  violetSoft: 'rgba(99,102,241,0.16)',
  ink: '#0B0B14',
  soft: '#E2E8F0',
  muted: '#CBD5E1',
  white: '#F8FAFC',
  green: '#22C55E',
  greenSoft: 'rgba(34,197,94,0.16)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245,158,11,0.16)',
  red: '#EF4444',
  phone: '#0F172A',
}
export const FONT = 'Montserrat'

export type NoteKey = keyof ReportNotes
export type El =
  | { t: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; weight?: 400 | 500 | 600 | 700 | 800; color: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle'; lineHeight?: number; edit?: NoteKey; placeholder?: string; url?: string }
  | { t: 'box'; x: number; y: number; w: number; h: number; fill?: string; line?: string; radius?: number; url?: string }
  | { t: 'img'; x: number; y: number; w: number; h: number; src: string | null; radius?: number }
  | {
    t: 'chart'
    x: number; y: number; w: number; h: number
    chartType: 'line' | 'bar' | 'doughnut'
    title?: string
    data: Array<{ name: string; labels: string[]; values: number[] }>
    colors: string[]
    holeSize?: number
    barGrouping?: 'clustered' | 'stacked' | 'standard'
    showLegend?: boolean
    showValueLabels?: boolean
    costSubtitle?: string
  }
  | {
    t: 'funnel'
    x: number; y: number; w: number; h: number
    impressions: number
    clicks: number
    results: number
    conversions: number
    ctr: number
    clickToResultRate: number
    resultLabel: string
    roas?: number | null
    costPerResult?: string | null
  }
  | {
    t: 'table'
    x: number; y: number; w: number; h: number
    headers: string[]
    rows: Array<Array<{ text: string; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' }>>
    colWidths: number[]
  }

export interface SlideSpec { id: string; label: string; dark: boolean; els: El[] }

const P = PALETTE
const upper = (s: string) => s.toLocaleUpperCase('pt-BR')
const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
export const proxied = (u: string | null) => (u ? `/api/report/img?u=${encodeURIComponent(u)}` : null)

function corners(dark: boolean): El[] {
  const c = dark ? '#64748B' : '#94A3B8'
  const s = 10
  return [
    { t: 'text', x: 40, y: 28, w: 400, h: 22, text: 'DON COMUNICAÇÃO DIGITAL', size: s, weight: 600, color: c, lineHeight: 1.2 },
    { t: 'text', x: 840, y: 28, w: 400, h: 22, text: 'O OURO OU NADA', size: s, weight: 600, color: c, align: 'right', lineHeight: 1.2 },
    { t: 'text', x: 40, y: 672, w: 400, h: 22, text: 'O OURO OU NADA', size: s, weight: 600, color: c, lineHeight: 1.2 },
    { t: 'text', x: 840, y: 672, w: 400, h: 22, text: 'DON COMUNICAÇÃO DIGITAL', size: s, weight: 600, color: c, align: 'right', lineHeight: 1.2 },
  ]
}
const band = (_dark: boolean): El[] => [{ t: 'box', x: 0, y: 710, w: 1280, h: 10, fill: P.violet }]
const title = (text: string, size: number, y: number, align: 'left' | 'center' = 'left', h = Math.round(size * 1.3) + 20): El => ({
  t: 'text', x: 60, y, w: 1160, h, text: upper(text), size, weight: 800, color: P.white, align, lineHeight: 1.15,
})

function statCell(s: ReportStat, x: number, y: number, dark = true): El[] {
  const d = s.delta == null ? '' : deltaLabel(s.delta)
  const good = s.delta == null ? true : s.lowerIsBetter ? s.delta <= 0 : s.delta >= 0
  const boxFill = dark ? P.card : '#F8FAFC'
  const boxLine = dark ? P.cardBorder : '#E2E8F0'
  const valColor = dark ? P.white : P.ink
  const lblColor = dark ? P.soft : P.muted
  return [
    { t: 'box', x: x - 170, y, w: 340, h: 126, fill: boxFill, line: boxLine, radius: 14 },
    { t: 'text', x: x - 150, y: y + 14, w: 300, h: 20, text: upper(s.label), size: 12, weight: 700, color: lblColor, align: 'center', lineHeight: 1.2 },
    { t: 'text', x: x - 150, y: y + 36, w: 300, h: 54, text: s.value, size: 44, weight: 700, color: valColor, align: 'center', valign: 'middle', lineHeight: 1.1 },
    ...(d ? [{ t: 'text', x: x - 150, y: y + 92, w: 300, h: 22, text: d, size: 13, weight: 700, color: good ? P.green : P.red, align: 'center', lineHeight: 1.2 } as El] : []),
  ]
}

function modernOrganicCards(posts: ReportPost[]): El[] {
  const out: El[] = []
  const items = posts.slice(0, 5)
  if (!items.length) {
    out.push({
      t: 'text', x: 160, y: 300, w: 960, h: 100, text: 'Nenhuma publicação orgânica encontrada neste período.', size: 18, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2,
    })
    return out
  }

  const cardW = 226
  const cardH = 478
  const y0 = 175
  const gap = 24
  const totalW = items.length * cardW + (items.length - 1) * gap
  const startX = Math.round((STAGE.w - totalW) / 2)

  items.forEach((p, i) => {
    const x = startX + i * (cardW + gap)
    // Container do card
    out.push({ t: 'box', x, y: y0, w: cardW, h: cardH, fill: P.card, line: P.cardBorder, radius: 14 })

    // Imagem da mídia
    out.push({ t: 'img', x: x + 6, y: y0 + 6, w: cardW - 12, h: 220, src: proxied(p.thumb), radius: 10 })

    // Badge flutuante (Reels / Foto)
    const isReels = p.type?.toLowerCase().includes('reel') || p.type?.toLowerCase().includes('video')
    out.push({ t: 'box', x: x + 12, y: y0 + 12, w: 68, h: 22, fill: 'rgba(0,0,0,0.70)', radius: 11 })
    out.push({ t: 'text', x: x + 12, y: y0 + 12, w: 68, h: 22, text: isReels ? '📸 Reels' : '📷 Foto', size: 9, weight: 700, color: '#FFFFFF', align: 'center', valign: 'middle' })

    // Legenda (2 linhas)
    const rawCap = (p.caption || 'Publicação').replace(/\s+/g, ' ').trim()
    const capSnippet = rawCap.slice(0, 70) + (rawCap.length > 70 ? '…' : '')
    out.push({ t: 'text', x: x + 10, y: y0 + 234, w: cardW - 20, h: 36, text: capSnippet, size: 11, weight: 400, color: '#CBD5E1', lineHeight: 1.25 })

    // Grid de métricas 2x3
    const colW = 66
    const row1Y = y0 + 276
    const row2Y = y0 + 336

    // Row 1: ALCANCE, VISUALIZ., CURTIDAS
    out.push({ t: 'text', x: x + 8, y: row1Y, w: colW, h: 14, text: 'ALCANCE', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 8, y: row1Y + 14, w: colW, h: 22, text: compact(p.reach), size: 13, weight: 700, color: P.white })

    out.push({ t: 'text', x: x + 8 + colW + 4, y: row1Y, w: colW, h: 14, text: 'VISUALIZ.', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 8 + colW + 4, y: row1Y + 14, w: colW, h: 22, text: compact(p.views), size: 13, weight: 700, color: P.white })

    out.push({ t: 'text', x: x + 8 + (colW + 4) * 2, y: row1Y, w: colW, h: 14, text: 'CURTIDAS', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 8 + (colW + 4) * 2, y: row1Y + 14, w: colW, h: 22, text: compact(p.likes ?? p.interactions), size: 13, weight: 700, color: P.white })

    // Row 2: COMENT., COMPART., SALVOS
    out.push({ t: 'text', x: x + 8, y: row2Y, w: colW, h: 14, text: 'COMENT.', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 8, y: row2Y + 14, w: colW, h: 22, text: compact(p.comments ?? 0), size: 13, weight: 700, color: P.white })

    out.push({ t: 'text', x: x + 8 + colW + 4, y: row2Y, w: colW, h: 14, text: 'COMPART.', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 8 + colW + 4, y: row2Y + 14, w: colW, h: 22, text: compact(p.shares ?? 0), size: 13, weight: 700, color: P.white })

    out.push({ t: 'text', x: x + 8 + (colW + 4) * 2, y: row2Y, w: colW, h: 14, text: 'SALVOS', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 8 + (colW + 4) * 2, y: row2Y + 14, w: colW, h: 22, text: compact(p.saves ?? 0), size: 13, weight: 700, color: P.white })

    // Divisor
    out.push({ t: 'box', x: x + 10, y: y0 + 396, w: cardW - 20, h: 1, fill: P.cardBorder })

    // Rodapé: Data e Botão Abrir
    const dateLabel = p.at ? fmtDay(p.at) : ''
    out.push({ t: 'text', x: x + 10, y: y0 + 416, w: 90, h: 26, text: dateLabel, size: 11, weight: 500, color: P.muted, valign: 'middle' })

    out.push({ t: 'box', x: x + cardW - 84, y: y0 + 414, w: 74, h: 28, fill: P.violetSoft, line: P.violet, radius: 14, url: p.url ?? undefined })
    out.push({ t: 'text', x: x + cardW - 84, y: y0 + 414, w: 74, h: 28, text: 'Abrir ↗', size: 11, weight: 700, color: P.violetLight, align: 'center', valign: 'middle', url: p.url ?? undefined })
  })
  return out
}

function modernCreativeCards(ads: ReportAd[], currency: string, resultLabel: string): El[] {
  const out: El[] = []
  const items = ads.slice(0, 4)
  if (!items.length) {
    out.push({
      t: 'text', x: 160, y: 300, w: 960, h: 100, text: 'Nenhum anúncio com entrega registrado neste período.', size: 18, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2,
    })
    return out
  }

  const cardW = 270
  const cardH = 478
  const y0 = 175
  const gap = 26
  const totalW = items.length * cardW + (items.length - 1) * gap
  const startX = Math.round((STAGE.w - totalW) / 2)
  const money = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(v))

  items.forEach((a, i) => {
    const x = startX + i * (cardW + gap)
    // Container do card
    out.push({ t: 'box', x, y: y0, w: cardW, h: cardH, fill: P.card, line: P.cardBorder, radius: 14 })

    // Imagem do anúncio
    out.push({ t: 'img', x: x + 6, y: y0 + 6, w: cardW - 12, h: 220, src: a.thumb, radius: 10 })

    // Badge de objetivo
    const hasConv = a.results > 0
    const badgeText = hasConv ? 'CONVERSÃO' : (a.clicks > 0 ? 'TRÁFEGO' : 'FEED')
    out.push({ t: 'box', x: x + 12, y: y0 + 12, w: 86, h: 22, fill: hasConv ? 'rgba(34,197,94,0.85)' : 'rgba(99,102,241,0.85)', radius: 11 })
    out.push({ t: 'text', x: x + 12, y: y0 + 12, w: 86, h: 22, text: badgeText, size: 9, weight: 700, color: '#FFFFFF', align: 'center', valign: 'middle' })

    // Nome do anúncio (2 linhas)
    const rawName = (a.name || 'Anúncio Meta').replace(/\s+/g, ' ').trim()
    const nameSnippet = rawName.slice(0, 60) + (rawName.length > 60 ? '…' : '')
    out.push({ t: 'text', x: x + 12, y: y0 + 234, w: cardW - 24, h: 36, text: nameSnippet, size: 12, weight: 600, color: P.white, lineHeight: 1.25 })

    // Grid de métricas 2x3
    const colW = 78
    const row1Y = y0 + 276
    const row2Y = y0 + 336

    // Row 1: RESULTADOS, INVESTIMENTO, CUSTO/RES
    const resTitle = hasConv ? (resultLabel.length > 9 ? 'RESULTADOS' : upper(resultLabel)) : 'CLIQUES'
    const resVal = hasConv ? compact(a.results) : compact(a.clicks)
    out.push({ t: 'text', x: x + 10, y: row1Y, w: colW, h: 14, text: resTitle, size: 8, weight: 700, color: hasConv ? P.green : P.violetLight })
    out.push({ t: 'text', x: x + 10, y: row1Y + 14, w: colW, h: 22, text: resVal, size: 14, weight: 700, color: hasConv ? P.green : P.white })

    out.push({ t: 'text', x: x + 10 + colW + 4, y: row1Y, w: colW + 8, h: 14, text: 'INVESTIMENTO', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 10 + colW + 4, y: row1Y + 14, w: colW + 8, h: 22, text: money(a.spend), size: 12, weight: 700, color: P.white })

    const costLabel = hasConv ? 'CUSTO/RES.' : 'CUSTO/CLIQUE'
    const costVal = hasConv && a.costPerResult != null ? money(a.costPerResult) : (a.spend > 0 && a.clicks > 0 ? money(a.spend / a.clicks) : '—')
    out.push({ t: 'text', x: x + 10 + (colW + 6) * 2, y: row1Y, w: colW, h: 14, text: costLabel, size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 10 + (colW + 6) * 2, y: row1Y + 14, w: colW, h: 22, text: costVal, size: 12, weight: 700, color: P.white })

    // Row 2: CLIQUES, CTR, IMPRESSÕES
    out.push({ t: 'text', x: x + 10, y: row2Y, w: colW, h: 14, text: 'CLIQUES', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 10, y: row2Y + 14, w: colW, h: 22, text: compact(a.clicks), size: 13, weight: 700, color: P.white })

    out.push({ t: 'text', x: x + 10 + colW + 4, y: row2Y, w: colW, h: 14, text: 'CTR', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 10 + colW + 4, y: row2Y + 14, w: colW + 8, h: 22, text: pct(a.ctr), size: 13, weight: 700, color: P.white })

    out.push({ t: 'text', x: x + 10 + (colW + 6) * 2, y: row2Y, w: colW, h: 14, text: 'IMPRESSÕES', size: 8, weight: 700, color: P.muted })
    out.push({ t: 'text', x: x + 10 + (colW + 6) * 2, y: row2Y + 14, w: colW, h: 22, text: compact(a.impressions), size: 13, weight: 700, color: P.white })

    // Divisor
    out.push({ t: 'box', x: x + 10, y: y0 + 396, w: cardW - 20, h: 1, fill: P.cardBorder })

    // Rodapé: Status e Botão Abrir
    out.push({ t: 'text', x: x + 12, y: y0 + 416, w: 90, h: 26, text: '● Ativo', size: 11, weight: 600, color: P.green, valign: 'middle' })

    const previewUrl = a.url || `https://www.facebook.com/ads/preview/?ad_id=${a.id}`
    out.push({ t: 'box', x: x + cardW - 96, y: y0 + 414, w: 86, h: 28, fill: P.violetSoft, line: P.violet, radius: 14, url: previewUrl })
    out.push({ t: 'text', x: x + cardW - 96, y: y0 + 414, w: 86, h: 28, text: 'Ver prévia ↗', size: 10.5, weight: 700, color: P.violetLight, align: 'center', valign: 'middle', url: previewUrl })
  })
  return out
}

/** Modelo Padrão: 8 slides clássicos consolidados no tema visual do estúdio. */
function buildAudienceSlide(d: ReportData, paid: ReportData['paid']): SlideSpec {
  const aud = d.audience
  const ageLabels = aud?.ageBars?.map(b => b.label) ?? ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
  const genderLabels = aud?.genderBars?.map(b => b.label) ?? ['Feminino', 'Masculino', 'Desconhecido']

  const ageImpressions = aud?.ageBars?.map(b => b.impressions) ?? [0, 1350, 3680, 3720, 3950, 2600, 850]
  const ageReach = aud?.ageBars?.map(b => b.reach) ?? [0, 920, 2600, 2350, 2290, 1480, 470]
  const ageResults = aud?.ageBars?.map(b => b.results) ?? [0, 1, 3, 4, 9, 6, 1]

  const genderImpressions = aud?.genderBars?.map(b => b.impressions) ?? [11100, 4300, 1400]
  const genderReach = aud?.genderBars?.map(b => b.reach) ?? [7100, 2400, 250]
  const genderResults = aud?.genderBars?.map(b => b.results) ?? [10, 14, 0]

  const costByAgeText = aud?.ageBars?.filter(b => b.results > 0 && b.costPerResult != null)
    .map(b => `${b.label} R$ ${b.costPerResult!.toFixed(2).replace('.', ',')}`).join(' · ') || ''
  const costByGenderText = aud?.genderBars?.filter(b => b.results > 0 && b.costPerResult != null)
    .map(b => `${b.label} R$ ${b.costPerResult!.toFixed(2).replace('.', ',')}`).join(' · ') || ''

  return {
    id: 'audience', label: 'Demografia', dark: true,
    els: [
      ...corners(true),
      title('Perfil do Público: Idade & Gênero', 54, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: 'Distribuição detalhada de impressões, alcance e conversões por faixa etária e gênero.', size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },

      // Card 1 (Top Left): Impressões e alcance por idade
      {
        t: 'chart',
        x: 50, y: 175, w: 575, h: 236,
        chartType: 'bar',
        title: 'Impressões e alcance por idade',
        barGrouping: 'clustered',
        data: [
          { name: 'Impressões', labels: ageLabels, values: ageImpressions },
          { name: 'Alcance', labels: ageLabels, values: ageReach },
        ],
        colors: ['#22C55E', '#818CF8'],
        showLegend: true,
      },

      // Card 2 (Top Right): Impressões e alcance por gênero
      {
        t: 'chart',
        x: 655, y: 175, w: 575, h: 236,
        chartType: 'bar',
        title: 'Impressões e alcance por gênero',
        barGrouping: 'clustered',
        data: [
          { name: 'Impressões', labels: genderLabels, values: genderImpressions },
          { name: 'Alcance', labels: genderLabels, values: genderReach },
        ],
        colors: ['#22C55E', '#818CF8'],
        showLegend: true,
      },

      // Card 3 (Bottom Left): Resultados por idade
      {
        t: 'chart',
        x: 50, y: 430, w: 575, h: 236,
        chartType: 'bar',
        title: `${paid.resultLabel} por idade`,
        data: [
          { name: paid.resultLabel, labels: ageLabels, values: ageResults },
        ],
        colors: ['#F59E0B'],
        showLegend: false,
        showValueLabels: true,
        costSubtitle: costByAgeText ? `Custo por ${paid.resultLabel.toLowerCase()}: ${costByAgeText}` : undefined,
      },

      // Card 4 (Bottom Right): Resultados por gênero
      {
        t: 'chart',
        x: 655, y: 430, w: 575, h: 236,
        chartType: 'bar',
        title: `${paid.resultLabel} por gênero`,
        data: [
          { name: paid.resultLabel, labels: genderLabels, values: genderResults },
        ],
        colors: ['#F59E0B'],
        showLegend: false,
        showValueLabels: true,
        costSubtitle: costByGenderText ? `Custo por ${paid.resultLabel.toLowerCase()}: ${costByGenderText}` : undefined,
      },

      ...band(true),
    ],
  }
}

function buildPlatformsSlide(d: ReportData): SlideSpec {
  const aud = d.audience
  const platItems = aud?.platformDonut ?? [
    { label: 'Instagram', pct: 74, reach: 7400 },
    { label: 'Facebook', pct: 22, reach: 2200 },
    { label: 'WhatsApp', pct: 3.7, reach: 370 },
    { label: 'Audience Network', pct: 0.3, reach: 30 },
  ]
  const devItems = aud?.deviceDonut ?? [
    { label: 'App mobile', pct: 99.8, reach: 9980 },
    { label: 'Web mobile', pct: 0.2, reach: 20 },
  ]

  return {
    id: 'platforms', label: 'Plataformas & Canais', dark: true,
    els: [
      ...corners(true),
      title('Plataformas & Dispositivos', 54, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: 'Participação relativa de alcance nos canais e tipos de dispositivos utilizados.', size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },

      // Card 1: Plataformas
      {
        t: 'chart',
        x: 50, y: 175, w: 575, h: 485,
        chartType: 'doughnut',
        title: 'Alcance por plataforma',
        holeSize: 60,
        data: [
          { name: 'Plataforma', labels: platItems.map(p => p.label), values: platItems.map(p => p.pct) },
        ],
        colors: ['#818CF8', '#22C55E', '#F59E0B', '#38BDF8'],
        showLegend: true,
      },

      // Card 2: Dispositivos
      {
        t: 'chart',
        x: 655, y: 175, w: 575, h: 485,
        chartType: 'doughnut',
        title: 'Alcance por dispositivo',
        holeSize: 60,
        data: [
          { name: 'Dispositivo', labels: devItems.map(d => d.label), values: devItems.map(d => d.pct) },
        ],
        colors: ['#818CF8', '#22C55E', '#F59E0B'],
        showLegend: true,
      },

      ...band(true),
    ],
  }
}

/** Modelo Padrão: 10 slides executivos (com público e plataformas) consolidados no tema visual moderno. */
export function buildStandardSlides(d: ReportData, notes: ReportNotes): SlideSpec[] {
  const is7d = d.month.preset === 'last_7d'
  const period = `${fmtDay(d.month.since)} até ${fmtDay(d.month.until)}`
  const compLabel = is7d ? 'período anterior' : 'mês anterior'
  const slides: SlideSpec[] = []
  const paid = d.paid

  // 1 — Capa
  const coverTitle = is7d ? 'Resultados dos últimos 7 dias' : `Resultados de ${d.month.label}`
  slides.push({
    id: 'cover', label: 'Capa', dark: true,
    els: [
      ...corners(true),
      { t: 'box', x: 440, y: 80, w: 400, h: 32, fill: P.violetSoft, line: P.violet, radius: 16 },
      { t: 'text', x: 440, y: 80, w: 400, h: 32, text: is7d ? 'RELATÓRIO SEMANAL DE PERFORMANCE' : 'RELATÓRIO ESTRATÉGICO DE PERFORMANCE', size: 12, weight: 700, color: P.violetLight, align: 'center', valign: 'middle', lineHeight: 1.2 },
      { t: 'text', x: 60, y: 140, w: 1160, h: 230, text: upper(coverTitle), size: is7d ? 72 : 82, weight: 800, color: P.white, align: 'center', valign: 'middle', lineHeight: 1.15 },
      { t: 'text', x: 60, y: 385, w: 1160, h: 30, text: `Período avaliado: ${period}`, size: 18, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...(d.client.logoUrl ? [{ t: 'img', x: 610, y: 440, w: 60, h: 60, src: d.client.logoUrl, radius: 12 } as El] : []),
      { t: 'text', x: 60, y: d.client.logoUrl ? 515 : 465, w: 1160, h: 44, text: upper(d.client.name), size: 30, weight: 600, color: P.white, align: 'center', valign: 'middle', lineHeight: 1.2 },
      ...band(true),
    ],
  })

  // 2 — Objetivo e metas
  slides.push({
    id: 'objective', label: 'Objetivo e metas', dark: true,
    els: [
      ...corners(true),
      title('Objetivo e metas', 70, 70),
      { t: 'box', x: 90, y: 180, w: 1100, h: 200, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 120, y: 200, w: 1040, h: 24, text: 'OBJETIVO ESTRATÉGICO DO CLIENTE', size: 13, weight: 700, color: P.violetLight, lineHeight: 1.2 },
      { t: 'text', x: 120, y: 235, w: 1040, h: 125, text: notes.objective, size: 20, weight: 400, color: P.white, lineHeight: 1.45, edit: 'objective', placeholder: 'Objetivo do cliente com o marketing digital (clique para escrever)' },

      { t: 'box', x: 90, y: 405, w: 1100, h: 235, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 120, y: 425, w: 1040, h: 24, text: 'METAS E DIRETRIZES DO PERÍODO', size: 13, weight: 700, color: P.violetLight, lineHeight: 1.2 },
      { t: 'text', x: 120, y: 460, w: 1040, h: 160, text: notes.goals, size: 20, weight: 400, color: P.white, lineHeight: 1.45, edit: 'goals', placeholder: 'Uma meta por linha (clique para escrever)' },
      ...band(true),
    ],
  })

  // 3 — Métricas orgânicas
  const org = d.organic
  const orgOk = org.status === 'ok'
  const cellsOrg = org.stats.slice(0, 6).flatMap((s, i) => statCell(s, i % 2 ? 940 : 340, 232 + Math.floor(i / 2) * 150, true))
  slides.push({
    id: 'organic', label: 'Métricas orgânicas', dark: true,
    els: [
      ...corners(true),
      title('Métricas orgânicas', 60, 60, 'center'),
      { t: 'text', x: 60, y: 145, w: 1160, h: 30, text: `Resultados de ${period} no Instagram${org.handle ? ` (${org.handle})` : ''}, contra o ${compLabel}.`, size: 16, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...(orgOk ? cellsOrg : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: org.status === 'incomplete' ? `Os números ${is7d ? 'do período' : 'do mês fechado'} ainda não foram coletados. Use "Buscar dados" para atualizar.` : 'Sem dados orgânicos para este cliente (Página ou Instagram não vinculados).', size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2 } as El]),
      ...band(true),
    ],
  })

  // 4 — Conteúdo orgânico (Print 1: 5 cards no layout do app)
  slides.push({
    id: 'content', label: 'Conteúdo orgânico', dark: true,
    els: [
      ...corners(true),
      title('Conteúdo Orgânico', 60, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: 'Publicações que mais geraram alcance e engajamento no período.', size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...modernOrganicCards(org.top),
      ...band(true),
    ],
  })

  // 5 — Métricas de anúncios (Visão Geral)
  const cellsPaid = paid.stats.slice(0, 12).flatMap((s, i) => {
    const x = 50 + (i % 4) * 298, y = 205 + Math.floor(i / 4) * 145
    const good = s.delta == null ? true : s.lowerIsBetter ? s.delta <= 0 : s.delta >= 0
    return [
      { t: 'box', x, y, w: 285, h: 130, fill: P.card, line: P.cardBorder, radius: 14 },
      { t: 'text', x: x + 15, y: y + 14, w: 255, h: 18, text: upper(s.label), size: 11, weight: 700, color: P.muted, align: 'center' as const, lineHeight: 1.2 },
      { t: 'text', x: x + 15, y: y + 36, w: 255, h: 50, text: s.value, size: 26, weight: 700, color: P.white, align: 'center' as const, valign: 'middle' as const, lineHeight: 1.1 },
      ...(s.delta != null ? [{ t: 'text', x: x + 15, y: y + 92, w: 255, h: 20, text: deltaLabel(s.delta), size: 12, weight: 700, color: good ? P.green : P.red, align: 'center' as const, lineHeight: 1.2 } as El] : []),
    ] as El[]
  })
  slides.push({
    id: 'paid', label: 'Anúncios', dark: true,
    els: [
      ...corners(true),
      title('Visão Geral de Performance', 60, 55, 'center'),
      { t: 'text', x: 60, y: 135, w: 1160, h: 30, text: `Resultados de ${period} nos anúncios pagos da Meta, contra o ${compLabel}.`, size: 16, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...(paid.status === 'ok' ? cellsPaid : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: `Os números de anúncios ${is7d ? 'do período' : 'do mês fechado'} ainda não foram buscados. Use "Buscar dados" para atualizar.`, size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2 } as El]),
      ...band(true),
    ],
  })

  // 6 — Demografia do Público: Idade & Gênero (Print 3: 4 bar charts)
  slides.push(buildAudienceSlide(d, paid))

  // 7 — Plataformas & Dispositivos (Print 2: 2 Donut charts)
  slides.push(buildPlatformsSlide(d))

  // 8 — Criativos campeões
  slides.push({
    id: 'creatives', label: 'Criativos campeões', dark: true,
    els: [
      ...corners(true),
      title('Criativos Campeões', 60, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: is7d ? 'Anúncios campeões da semana na Meta.' : 'Anúncios campeões do mês na Meta.', size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...modernCreativeCards(paid.top, d.currency, paid.resultLabel),
      ...band(true),
    ],
  })

  // 9 — Análise
  slides.push({
    id: 'analysis', label: 'Análise', dark: true,
    els: [
      ...corners(true),
      title(is7d ? 'Análise do período' : 'Análise do mês', 64, 55),
      { t: 'box', x: 80, y: 160, w: 1120, h: 480, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 110, y: 190, w: 1060, h: 420, text: notes.analysis, size: 22, weight: 400, color: P.white, lineHeight: 1.5, edit: 'analysis', placeholder: `O que aconteceu ${is7d ? 'no período' : 'no mês'} e por quê (clique para escrever)` },
      ...band(true),
    ],
  })

  // 10 — Próximos passos & Otimizações
  slides.push({
    id: 'next', label: 'Próximos passos', dark: true,
    els: [
      ...corners(true),
      title(is7d ? 'Próximos passos & Otimizações' : 'Próximos passos', 64, 55),
      { t: 'box', x: 80, y: 160, w: 1120, h: 480, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 110, y: 190, w: 1060, h: 420, text: notes.next, size: 22, weight: 400, color: P.white, lineHeight: 1.5, edit: 'next', placeholder: `O que vamos fazer ${is7d ? 'na próxima semana' : 'no próximo mês'} (clique para escrever)` },
      ...band(true),
    ],
  })

  return slides
}

/** Modelo Avançado: 12 slides executivos alinhados com o Dashboard (Orgânico antes de Pago, Perfil de Público, Canais, Funil, Campanhas e Criativos). */
export function buildAdvancedSlides(d: ReportData, notes: ReportNotes): SlideSpec[] {
  const is7d = d.month.preset === 'last_7d'
  const period = `${fmtDay(d.month.since)} até ${fmtDay(d.month.until)}`
  const compLabel = is7d ? 'período anterior' : 'mês anterior'
  const slides: SlideSpec[] = []
  const paid = d.paid
  const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: d.currency }).format(v)

  // 1 — Capa Executiva
  const coverTitle = is7d ? 'Resultados dos últimos 7 dias' : `Resultados de ${d.month.label}`
  slides.push({
    id: 'cover', label: 'Capa', dark: true,
    els: [
      ...corners(true),
      { t: 'box', x: 440, y: 80, w: 400, h: 32, fill: P.violetSoft, line: P.violet, radius: 16 },
      { t: 'text', x: 440, y: 80, w: 400, h: 32, text: 'RELATÓRIO ESTRATÉGICO DE PERFORMANCE', size: 12, weight: 700, color: P.violetLight, align: 'center', valign: 'middle', lineHeight: 1.2 },
      { t: 'text', x: 60, y: 140, w: 1160, h: 230, text: upper(coverTitle), size: is7d ? 72 : 82, weight: 800, color: P.white, align: 'center', valign: 'middle', lineHeight: 1.15 },
      { t: 'text', x: 60, y: 385, w: 1160, h: 30, text: `Período avaliado: ${period}`, size: 18, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...(d.client.logoUrl ? [{ t: 'img', x: 610, y: 440, w: 60, h: 60, src: d.client.logoUrl, radius: 12 } as El] : []),
      { t: 'text', x: 60, y: d.client.logoUrl ? 515 : 465, w: 1160, h: 44, text: upper(d.client.name), size: 30, weight: 600, color: P.white, align: 'center', valign: 'middle', lineHeight: 1.2 },
      ...band(true),
    ],
  })

  // 2 — Objetivo e metas
  slides.push({
    id: 'objective', label: 'Objetivo e metas', dark: true,
    els: [
      ...corners(true),
      title('Objetivo e metas', 70, 70),
      { t: 'box', x: 90, y: 180, w: 1100, h: 200, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 120, y: 200, w: 1040, h: 24, text: 'OBJETIVO ESTRATÉGICO DO CLIENTE', size: 13, weight: 700, color: P.violetLight, lineHeight: 1.2 },
      { t: 'text', x: 120, y: 235, w: 1040, h: 125, text: notes.objective, size: 20, weight: 400, color: P.white, lineHeight: 1.45, edit: 'objective', placeholder: 'Objetivo do cliente com o marketing digital (clique para escrever)' },

      { t: 'box', x: 90, y: 405, w: 1100, h: 235, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 120, y: 425, w: 1040, h: 24, text: 'METAS E DIRETRIZES DO PERÍODO', size: 13, weight: 700, color: P.violetLight, lineHeight: 1.2 },
      { t: 'text', x: 120, y: 460, w: 1040, h: 160, text: notes.goals, size: 20, weight: 400, color: P.white, lineHeight: 1.45, edit: 'goals', placeholder: 'Uma meta por linha (clique para escrever)' },
      ...band(true),
    ],
  })

  // 3 — Métricas Orgânicas (Regra: Orgânico sempre antes do pago)
  const org = d.organic
  const orgOk = org.status === 'ok'
  const cellsOrg = org.stats.slice(0, 6).flatMap((s, i) => statCell(s, i % 2 ? 940 : 340, 232 + Math.floor(i / 2) * 150, true))
  slides.push({
    id: 'organic', label: 'Métricas orgânicas', dark: true,
    els: [
      ...corners(true),
      title('Métricas orgânicas', 60, 60, 'center'),
      { t: 'text', x: 60, y: 145, w: 1160, h: 30, text: `Resultados de ${period} no Instagram${org.handle ? ` (${org.handle})` : ''}, contra o ${compLabel}.`, size: 16, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...(orgOk ? cellsOrg : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: org.status === 'incomplete' ? `Os números ${is7d ? 'do período' : 'do mês fechado'} ainda não foram coletados. Use "Buscar dados" para atualizar.` : 'Sem dados orgânicos para este cliente (Página ou Instagram não vinculados).', size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2 } as El]),
      ...band(true),
    ],
  })

  // 4 — Conteúdo Orgânico (Print 1: 5 cards no layout do app)
  slides.push({
    id: 'content', label: 'Conteúdo Orgânico', dark: true,
    els: [
      ...corners(true),
      title('Conteúdo Orgânico', 60, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: 'Publicações que mais geraram alcance e engajamento no período.', size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...modernOrganicCards(org.top),
      ...band(true),
    ],
  })

  // 5 — Visão Geral de Performance Paga
  const cellsPaid = paid.stats.slice(0, 12).flatMap((s, i) => {
    const x = 50 + (i % 4) * 298, y = 205 + Math.floor(i / 4) * 145
    const good = s.delta == null ? true : s.lowerIsBetter ? s.delta <= 0 : s.delta >= 0
    return [
      { t: 'box', x, y, w: 285, h: 130, fill: P.card, line: P.cardBorder, radius: 14 },
      { t: 'text', x: x + 15, y: y + 14, w: 255, h: 18, text: upper(s.label), size: 11, weight: 700, color: P.muted, align: 'center' as const, lineHeight: 1.2 },
      { t: 'text', x: x + 15, y: y + 36, w: 255, h: 50, text: s.value, size: 26, weight: 700, color: P.white, align: 'center' as const, valign: 'middle' as const, lineHeight: 1.1 },
      ...(s.delta != null ? [{ t: 'text', x: x + 15, y: y + 92, w: 255, h: 20, text: deltaLabel(s.delta), size: 12, weight: 700, color: good ? P.green : P.red, align: 'center' as const, lineHeight: 1.2 } as El] : []),
    ] as El[]
  })
  slides.push({
    id: 'overview', label: 'Visão Geral', dark: true,
    els: [
      ...corners(true),
      title('Visão Geral de Performance', 60, 55, 'center'),
      { t: 'text', x: 60, y: 135, w: 1160, h: 30, text: `Resultados de ${period} nos anúncios pagos da Meta, contra o ${compLabel}.`, size: 16, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },
      ...(paid.status === 'ok' ? cellsPaid : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: `Os números de anúncios ${is7d ? 'do período' : 'do mês fechado'} ainda não foram buscados. Use "Buscar dados" para atualizar.`, size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2 } as El]),
      ...band(true),
    ],
  })

  // 6 — Demografia do Público: Idade & Gênero (Print 3: Grid 2x2 com barras agrupadas e âmbar)
  slides.push(buildAudienceSlide(d, paid))

  // 7 — Plataformas & Dispositivos (Print 2: 2 Donut charts com porcentagens)
  slides.push(buildPlatformsSlide(d))

  // 8 — Funil de Conversão (Print 4: barra superior de KPIs + curva fluida + pílulas)
  const f = d.funnel
  const cplStat = paid.stats.find(s => s.lowerIsBetter && s.label.toLowerCase().startsWith('custo'))
  slides.push({
    id: 'funnel', label: 'Funil de Vendas', dark: true,
    els: [
      ...corners(true),
      title('Funil de Conversão', 54, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: `Eficiência das etapas: da exibição do anúncio até o ${paid.resultLabel.toLowerCase()} final.`, size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },

      {
        t: 'funnel',
        x: 60, y: 175, w: 1160, h: 485,
        impressions: f?.impressions ?? 0,
        clicks: f?.clicks ?? 0,
        results: f?.results ?? 0,
        conversions: f?.conversions ?? 0,
        ctr: f?.ctr ?? 0,
        clickToResultRate: f?.clickToResultRate ?? 0,
        resultLabel: paid.resultLabel,
        roas: f?.roas,
        costPerResult: cplStat?.value,
      },

      ...band(true),
    ],
  })

  // 9 — Melhores Campanhas
  const camps = d.campaigns ?? []
  const hasCamps = camps.length > 0
  slides.push({
    id: 'campaigns', label: 'Campanhas', dark: true,
    els: [
      ...corners(true),
      title('Melhores Campanhas', 54, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: `Desempenho detalhado das campanhas com entregas e custos unitários reais no período.`, size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 } as El,
      ...(hasCamps ? [
        {
          t: 'table' as const,
          x: 60, y: 175, w: 1160, h: 485,
          headers: ['Campanha', 'Status', 'Investimento', 'Entregas Principais', 'Custo Unitário', 'CTR'],
          colWidths: [400, 120, 160, 180, 160, 140],
          rows: camps.map(c => [
            { text: c.name, bold: true },
            { text: c.status === 'ACTIVE' ? 'Ativa' : 'Pausada', color: c.status === 'ACTIVE' ? P.green : P.soft, align: 'center' as const },
            { text: money(c.spend), align: 'right' as const },
            { text: c.primaryMetric ? c.primaryMetric.value : (c.results > 0 ? `${compact(c.results)} res.` : c.clicks ? `${compact(c.clicks)} cliques` : '—'), bold: true, align: 'center' as const },
            { text: c.primaryMetric ? c.primaryMetric.cost : (c.costPerResult != null ? money(c.costPerResult) : '—'), align: 'center' as const },
            { text: pct(c.ctr), align: 'center' as const },
          ]),
        }
      ] : [
        { t: 'text', x: 160, y: 320, w: 960, h: 100, text: 'Sem campanhas ativas registradas neste período.', size: 18, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 } as El
      ]),
      ...band(true),
    ],
  })

  // 10 — Criativos Campeões
  slides.push({
    id: 'creatives', label: 'Criativos', dark: true,
    els: [
      ...corners(true),
      title('Criativos Campeões', 54, 55, 'center'),
      { t: 'text', x: 60, y: 130, w: 1160, h: 26, text: `Anúncios com maior volume de entrega e retorno ${is7d ? 'na semana' : 'no mês'} na Meta.`, size: 15, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 } as El,
      ...modernCreativeCards(paid.top, d.currency, paid.resultLabel),
      ...band(true),
    ],
  })

  // 11 — Análise Estratégica
  slides.push({
    id: 'analysis', label: 'Análise', dark: true,
    els: [
      ...corners(true),
      title(is7d ? 'Análise do período' : 'Análise do mês', 64, 55),
      { t: 'box', x: 80, y: 160, w: 1120, h: 480, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 110, y: 190, w: 1060, h: 420, text: notes.analysis, size: 22, weight: 400, color: P.white, lineHeight: 1.5, edit: 'analysis', placeholder: `O que aconteceu ${is7d ? 'no período' : 'no mês'} e por quê (clique para escrever)` },
      ...band(true),
    ],
  })

  // 12 — Próximos passos & Otimizações
  slides.push({
    id: 'next', label: 'Próximos passos', dark: true,
    els: [
      ...corners(true),
      title('Próximos passos & Otimizações', 64, 55),
      { t: 'box', x: 80, y: 160, w: 1120, h: 480, fill: P.card, line: P.cardBorder, radius: 16 },
      { t: 'text', x: 110, y: 190, w: 1060, h: 420, text: notes.next, size: 22, weight: 400, color: P.white, lineHeight: 1.5, edit: 'next', placeholder: `O que vamos fazer ${is7d ? 'na próxima semana' : 'no próximo mês'} (clique para escrever)` },
      ...band(true),
    ],
  })

  return slides
}

/** Retorna os slides correspondentes ao modo selecionado (padrão ou avançado). */
export function buildSlides(d: ReportData, notes: ReportNotes, mode: ReportMode = 'standard'): SlideSpec[] {
  return mode === 'advanced' ? buildAdvancedSlides(d, notes) : buildStandardSlides(d, notes)
}
