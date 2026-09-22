/**
 * Slides do relatório mensal como dados (posição, texto, cor), num palco de 1280 x 720.
 * A mesma descrição desenha a tela do editor e gera o PowerPoint, então o que se vê é o que se baixa.
 */
import { compact, deltaLabel, pct, type ReportData, type ReportMode, type ReportNotes, type ReportStat } from './report'

export const STAGE = { w: 1280, h: 720 }

export const PALETTE = {
  dark: '#05050B', light: '#FFFFFF', violet: '#6F6DF7', ink: '#0B0B14', soft: '#9A9AB8', white: '#FFFFFF', green: '#16A34A', red: '#DC2626', phone: '#0B0B14',
}
export const FONT = 'Montserrat'

export type NoteKey = keyof ReportNotes
export type El =
  | { t: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; weight?: 400 | 500 | 600 | 700 | 800; color: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle'; lineHeight?: number; edit?: NoteKey; placeholder?: string }
  | { t: 'box'; x: number; y: number; w: number; h: number; fill?: string; line?: string; radius?: number }
  | { t: 'img'; x: number; y: number; w: number; h: number; src: string | null; radius?: number }
  | {
    t: 'chart'
    x: number; y: number; w: number; h: number
    chartType: 'line' | 'bar'
    title?: string
    data: Array<{ name: string; labels: string[]; values: number[] }>
    colors: string[]
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
  const c = dark ? '#B9B9D0' : '#55556A'
  const s = 10
  return [
    { t: 'text', x: 40, y: 30, w: 400, h: 22, text: 'DON COMUNICAÇÃO DIGITAL', size: s, weight: 600, color: c, lineHeight: 1.2 },
    { t: 'text', x: 840, y: 30, w: 400, h: 22, text: 'O OURO OU NADA', size: s, weight: 600, color: c, align: 'right', lineHeight: 1.2 },
    { t: 'text', x: 40, y: 672, w: 400, h: 22, text: 'O OURO OU NADA', size: s, weight: 600, color: c, lineHeight: 1.2 },
    { t: 'text', x: 840, y: 672, w: 400, h: 22, text: 'DON COMUNICAÇÃO DIGITAL', size: s, weight: 600, color: c, align: 'right', lineHeight: 1.2 },
  ]
}
const band = (dark: boolean): El[] => [{ t: 'box', x: 0, y: 708, w: 1280, h: 12, fill: dark ? P.violet : P.violet }]
const title = (text: string, size: number, y: number, align: 'left' | 'center' = 'left', h = Math.round(size * 1.3) + 26): El => ({
  t: 'text', x: 60, y, w: 1160, h, text: upper(text), size, weight: 800, color: P.violet, align, lineHeight: 1.2
})

function statCell(s: ReportStat, x: number, y: number): El[] {
  const d = s.delta == null ? '' : deltaLabel(s.delta)
  const good = s.delta == null ? true : s.lowerIsBetter ? s.delta <= 0 : s.delta >= 0
  return [
    { t: 'box', x: x - 130, y, w: 260, h: 36, line: P.violet, radius: 18 },
    { t: 'text', x: x - 130, y, w: 260, h: 36, text: upper(s.label), size: 14, weight: 600, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 },
    { t: 'text', x: x - 190, y: y + 44, w: 380, h: 72, text: s.value, size: 52, weight: 500, color: P.ink, align: 'center', valign: 'middle', lineHeight: 1.15 },
    ...(d ? [{ t: 'text', x: x - 190, y: y + 116, w: 380, h: 24, text: d, size: 16, weight: 700, color: good ? P.green : P.red, align: 'center', lineHeight: 1.2 } as El] : []),
  ]
}

interface Phone { thumb: string | null; stats: Array<[string, string]>; format?: string }
function phones(items: Phone[], isModern = false): El[] {
  const out: El[] = []
  items.slice(0, 3).forEach((it, i) => {
    const x0 = 70 + i * 400
    // Moldura do smartphone
    out.push({ t: 'box', x: x0, y: 195, w: 204, h: 424, fill: '#0E0E18', line: '#272738', radius: isModern ? 36 : 28 })
    // Notch / Dynamic Island
    if (isModern) {
      out.push({ t: 'box', x: x0 + 74, y: 203, w: 56, h: 10, fill: '#000000', radius: 5 })
    }
    // Barra superior de perfil (avatar e formato)
    out.push({ t: 'box', x: x0 + 14, y: 218, w: 18, h: 18, fill: P.violet, radius: 9 })
    out.push({ t: 'text', x: x0 + 38, y: 218, w: 90, h: 18, text: 'Patrocinado', size: 11, weight: 600, color: '#B0B0CC', lineHeight: 1.2 })
    out.push({ t: 'text', x: x0 + 138, y: 218, w: 50, h: 18, text: it.format ?? 'FEED', size: 10, weight: 700, color: P.violet, align: 'right', lineHeight: 1.2 })

    // Área da mídia / imagem do criativo: proporção 4:5 / quadrada (184 x 232)
    out.push({ t: 'box', x: x0 + 10, y: 240, w: 184, h: 232, fill: '#181824', radius: 10 })
    out.push({ t: 'img', x: x0 + 10, y: 240, w: 184, h: 232, src: it.thumb, radius: 10 })

    // Barra de ação inferior (CTA do anúncio)
    out.push({ t: 'box', x: x0 + 14, y: 482, w: 176, h: 30, fill: 'rgba(111,109,247,0.18)', line: P.violet, radius: 15 })
    out.push({ t: 'text', x: x0 + 14, y: 482, w: 176, h: 30, text: 'Saiba mais ›', size: 11, weight: 700, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 })

    // Indicadores de métricas ao lado do smartphone
    it.stats.forEach(([label, value], j) => {
      const y = 240 + j * 96
      out.push({ t: 'text', x: x0 + 225, y, w: 160, h: 22, text: label, size: 14, weight: 700, color: P.ink, align: 'center', lineHeight: 1.2 })
      out.push({ t: 'box', x: x0 + 230, y: y + 26, w: 150, h: 40, fill: j === 0 ? P.violet : '#F1F1F6', radius: 20 })
      out.push({ t: 'text', x: x0 + 230, y: y + 26, w: 150, h: 40, text: value, size: 16, weight: 700, color: j === 0 ? P.white : P.ink, align: 'center', valign: 'middle', lineHeight: 1.2 })
    })
  })
  return out
}

/** Modelo Padrão: 8 slides clássicos consolidados. */
export function buildStandardSlides(d: ReportData, notes: ReportNotes): SlideSpec[] {
  const is7d = d.month.preset === 'last_7d'
  const period = `${fmtDay(d.month.since)} até ${fmtDay(d.month.until)}`
  const compLabel = is7d ? 'período anterior' : 'mês anterior'
  const slides: SlideSpec[] = []

  // 1 — capa
  const coverTitle = is7d ? 'Resultados dos últimos 7 dias' : `Resultados de ${d.month.label}`
  slides.push({
    id: 'cover', label: 'Capa', dark: true,
    els: [
      ...corners(true),
      { t: 'text', x: 60, y: 150, w: 1160, h: 250, text: upper(coverTitle), size: is7d ? 76 : 88, weight: 800, color: P.white, align: 'center', valign: 'middle', lineHeight: 1 },
      ...(d.client.logoUrl ? [{ t: 'img', x: 610, y: 440, w: 60, h: 60, src: d.client.logoUrl, radius: 12 } as El] : []),
      { t: 'text', x: 60, y: d.client.logoUrl ? 512 : 470, w: 1160, h: 44, text: upper(d.client.name), size: 30, weight: 600, color: P.white, align: 'center', valign: 'middle' },
      ...band(true),
    ],
  })

  // 2 — objetivo e metas (texto da equipe)
  slides.push({
    id: 'objective', label: 'Objetivo e metas', dark: true,
    els: [
      ...corners(true),
      title('Objetivo e metas', 78, 96, 'left', 100),
      { t: 'text', x: 110, y: 250, w: 1060, h: 150, text: notes.objective, size: 22, weight: 400, color: P.white, lineHeight: 1.45, edit: 'objective', placeholder: 'Objetivo do cliente com o marketing digital (clique para escrever)' },
      { t: 'text', x: 110, y: 420, w: 400, h: 30, text: 'Metas:', size: 22, weight: 700, color: P.white },
      { t: 'text', x: 110, y: 458, w: 1060, h: 170, text: notes.goals, size: 22, weight: 400, color: P.white, lineHeight: 1.45, edit: 'goals', placeholder: 'Uma meta por linha (clique para escrever)' },
      ...band(true),
    ],
  })

  // 3 — métricas orgânicas
  const org = d.organic
  const orgOk = org.status === 'ok'
  const cellsOrg = org.stats.slice(0, 6).flatMap((s, i) => statCell(s, i % 2 ? 940 : 340, 232 + Math.floor(i / 2) * 150))
  slides.push({
    id: 'organic', label: 'Métricas orgânicas', dark: false,
    els: [
      ...corners(false),
      title('Métricas orgânicas', 64, 66, 'center'),
      { t: 'text', x: 60, y: 160, w: 1160, h: 30, text: `Resultados de ${period} no Instagram${org.handle ? ` (${org.handle})` : ''}, contra o ${compLabel}.`, size: 16, weight: 500, color: P.ink, align: 'center' },
      ...(orgOk ? cellsOrg : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: org.status === 'incomplete' ? `Os números ${is7d ? 'do período' : 'do mês fechado'} ainda não foram coletados. Use "Buscar dados" (no topo) para buscar agora.` : 'Sem dados orgânicos para este cliente (Página ou Instagram não vinculados).', size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle' } as El]),
      ...band(false),
    ],
  })

  // 4 — conteúdo (top posts)
  slides.push({
    id: 'content', label: 'Conteúdo', dark: false,
    els: [
      ...corners(false),
      title('Conteúdo', 76, 50),
      { t: 'text', x: 60, y: 146, w: 1160, h: 26, text: 'Conteúdos que mais tiveram resultado no período.', size: 16, weight: 500, color: P.ink },
      ...phones(org.top.map(p => ({ thumb: proxied(p.thumb), stats: [['Alcance', compact(p.reach)], ['Visualizações', compact(p.views)], ['Interações', compact(p.interactions)]] as Array<[string, string]> }))),
      ...band(false),
    ],
  })

  // 5 — métricas de anúncios
  const paid = d.paid
  const cellsPaid = paid.stats.slice(0, 12).flatMap((s, i) => {
    const x = 60 + (i % 4) * 300, y = 230 + Math.floor(i / 4) * 140
    const good = s.delta == null ? true : s.lowerIsBetter ? s.delta <= 0 : s.delta >= 0
    return [
      { t: 'text', x, y, w: 280, h: 24, text: s.label, size: 15, weight: 700, color: P.ink, align: 'center' },
      { t: 'box', x: x + 20, y: y + 30, w: 240, h: 46, fill: P.violet, radius: 23 },
      { t: 'text', x: x + 20, y: y + 30, w: 240, h: 46, text: s.value, size: 19, weight: 700, color: P.white, align: 'center', valign: 'middle' },
      ...(s.delta != null ? [{ t: 'text', x, y: y + 82, w: 280, h: 20, text: deltaLabel(s.delta), size: 13, weight: 700, color: good ? P.green : P.red, align: 'center' } as El] : []),
    ] as El[]
  })
  slides.push({
    id: 'paid', label: 'Métricas anúncios', dark: false,
    els: [
      ...corners(false),
      title('Métricas anúncios Meta', 60, 66, 'center'),
      { t: 'text', x: 60, y: 150, w: 1160, h: 30, text: `Resultados de ${period} no gerenciador de anúncios da Meta, contra o ${compLabel}.`, size: 16, weight: 500, color: P.ink, align: 'center' },
      ...(paid.status === 'ok' ? cellsPaid : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: `Os números de anúncios ${is7d ? 'do período' : 'do mês fechado'} ainda não foram buscados. Use "Buscar dados" (no topo) para buscar agora.`, size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle' } as El]),
      ...band(false),
    ],
  })

  // 6 — criativos
  slides.push({
    id: 'creatives', label: 'Criativos', dark: false,
    els: [
      ...corners(false),
      title('Criativos', 76, 50),
      { t: 'text', x: 60, y: 146, w: 1160, h: 26, text: `Anúncios campeões ${is7d ? 'da semana' : 'do mês'} no gerenciador de anúncios da Meta.`, size: 16, weight: 500, color: P.ink, lineHeight: 1.2 },
      ...phones(paid.top.map(a => {
        const hasConv = a.results > 0
        const hasClicks = (a.clicks ?? 0) > 0
        const primaryLabel = hasConv ? paid.resultLabel : hasClicks ? 'Cliques no link' : 'Impressões'
        const primaryVal = hasConv ? compact(a.results) : hasClicks ? compact(a.clicks) : compact(a.impressions)
        const costLabel = hasConv ? 'Custo / resultado' : hasClicks ? 'Custo / clique' : 'CTR'
        const costVal = hasConv && a.costPerResult != null
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: d.currency }).format(a.costPerResult)
          : hasClicks && a.spend && a.clicks
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: d.currency }).format(a.spend / a.clicks)
            : pct(a.ctr)

        return {
          thumb: notes.creativeOverrides?.[a.id] || proxied(a.thumb),
          stats: [
            [primaryLabel, primaryVal],
            ['Investimento', a.spend ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: d.currency }).format(a.spend) : '—'],
            [costLabel, costVal],
          ] as Array<[string, string]>,
          format: hasConv ? 'CONVERSÃO' : hasClicks ? 'TRÁFEGO' : 'FEED',
        }
      })),
      ...band(false),
    ],
  })

  // 7 — análise
  slides.push({
    id: 'analysis', label: 'Análise', dark: false,
    els: [
      ...corners(false),
      title(is7d ? 'Análise do período' : 'Análise do mês', 72, 56),
      { t: 'text', x: 110, y: 190, w: 1060, h: 450, text: notes.analysis, size: 24, weight: 400, color: P.ink, lineHeight: 1.5, edit: 'analysis', placeholder: `O que aconteceu ${is7d ? 'no período' : 'no mês'} e por quê (clique para escrever)` },
      ...band(false),
    ],
  })

  // 8 — próximos passos
  slides.push({
    id: 'next', label: 'Próximos passos', dark: false,
    els: [
      ...corners(false),
      title('Próximos passos', 72, 56),
      { t: 'text', x: 110, y: 190, w: 1060, h: 450, text: notes.next, size: 24, weight: 400, color: P.ink, lineHeight: 1.5, edit: 'next', placeholder: `O que vamos fazer ${is7d ? 'na próxima semana' : 'no próximo mês'} (clique para escrever)` },
      ...band(false),
    ],
  })

  return slides
}

/** Modelo Avançado: 11 slides executivos com Orgânico antes de Pago, Perfil de Público, Funil, Campanhas e Criativos. */
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
      { t: 'box', x: 440, y: 80, w: 400, h: 32, fill: 'rgba(111,109,247,0.20)', line: P.violet, radius: 16 },
      { t: 'text', x: 440, y: 80, w: 400, h: 32, text: 'RELATÓRIO ESTRATÉGICO DE PERFORMANCE', size: 12, weight: 700, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 },
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
      title('Objetivo e metas', 78, 96, 'left', 110),
      { t: 'text', x: 110, y: 250, w: 1060, h: 150, text: notes.objective, size: 22, weight: 400, color: P.white, lineHeight: 1.45, edit: 'objective', placeholder: 'Objetivo do cliente com o marketing digital (clique para escrever)' },
      { t: 'text', x: 110, y: 420, w: 400, h: 30, text: 'Metas:', size: 22, weight: 700, color: P.white, lineHeight: 1.2 },
      { t: 'text', x: 110, y: 458, w: 1060, h: 170, text: notes.goals, size: 22, weight: 400, color: P.white, lineHeight: 1.45, edit: 'goals', placeholder: 'Uma meta por linha (clique para escrever)' },
      ...band(true),
    ],
  })

  // 3 — Métricas Orgânicas (Regra: Orgânico sempre antes do pago)
  const org = d.organic
  const orgOk = org.status === 'ok'
  const cellsOrg = org.stats.slice(0, 6).flatMap((s, i) => statCell(s, i % 2 ? 940 : 340, 232 + Math.floor(i / 2) * 150))
  slides.push({
    id: 'organic', label: 'Métricas orgânicas', dark: false,
    els: [
      ...corners(false),
      title('Métricas orgânicas', 64, 66, 'center'),
      { t: 'text', x: 60, y: 160, w: 1160, h: 30, text: `Resultados de ${period} no Instagram${org.handle ? ` (${org.handle})` : ''}, contra o ${compLabel}.`, size: 16, weight: 500, color: P.ink, align: 'center', lineHeight: 1.2 },
      ...(orgOk ? cellsOrg : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: org.status === 'incomplete' ? `Os números ${is7d ? 'do período' : 'do mês fechado'} ainda não foram coletados. Use "Buscar dados" para atualizar.` : 'Sem dados orgânicos para este cliente (Página ou Instagram não vinculados).', size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2 } as El]),
      ...band(false),
    ],
  })

  // 4 — Conteúdo Orgânico
  slides.push({
    id: 'content', label: 'Conteúdo Orgânico', dark: false,
    els: [
      ...corners(false),
      title('Conteúdo Orgânico', 76, 50),
      { t: 'text', x: 60, y: 146, w: 1160, h: 26, text: 'Publicações que mais geraram alcance e engajamento no período.', size: 16, weight: 500, color: P.ink, lineHeight: 1.2 },
      ...phones(org.top.map(p => ({ thumb: proxied(p.thumb), stats: [['Alcance', compact(p.reach)], ['Visualizações', compact(p.views)], ['Interações', compact(p.interactions)]] as Array<[string, string]>, format: p.type === 'Reels' ? 'REELS' : 'POST' })), true),
      ...band(false),
    ],
  })

  // 5 — Visão Geral de Performance Paga
  const cellsPaid = paid.stats.slice(0, 12).flatMap((s, i) => {
    const x = 60 + (i % 4) * 300, y = 230 + Math.floor(i / 4) * 140
    const good = s.delta == null ? true : s.lowerIsBetter ? s.delta <= 0 : s.delta >= 0
    return [
      { t: 'text', x, y, w: 280, h: 24, text: s.label, size: 15, weight: 700, color: P.ink, align: 'center' as const, lineHeight: 1.2 },
      { t: 'box', x: x + 20, y: y + 30, w: 240, h: 46, fill: P.violet, radius: 23 },
      { t: 'text', x: x + 20, y: y + 30, w: 240, h: 46, text: s.value, size: 19, weight: 700, color: P.white, align: 'center' as const, valign: 'middle' as const, lineHeight: 1.2 },
      ...(s.delta != null ? [{ t: 'text', x, y: y + 82, w: 280, h: 20, text: deltaLabel(s.delta), size: 13, weight: 700, color: good ? P.green : P.red, align: 'center' as const, lineHeight: 1.2 } as El] : []),
    ] as El[]
  })
  slides.push({
    id: 'overview', label: 'Visão Geral', dark: false,
    els: [
      ...corners(false),
      title('Visão Geral de Performance', 56, 60, 'center'),
      { t: 'text', x: 60, y: 145, w: 1160, h: 30, text: `Resultados de ${period} nos anúncios pagos da Meta, contra o ${compLabel}.`, size: 16, weight: 500, color: P.ink, align: 'center', lineHeight: 1.2 },
      ...(paid.status === 'ok' ? cellsPaid : [{ t: 'text', x: 160, y: 300, w: 960, h: 120, text: `Os números de anúncios ${is7d ? 'do período' : 'do mês fechado'} ainda não foram buscados. Use "Buscar dados" para atualizar.`, size: 20, weight: 500, color: P.soft, align: 'center', valign: 'middle', lineHeight: 1.2 } as El]),
      ...band(false),
    ],
  })

  // 6 — Perfil do Público & Posicionamentos (Substitui evolução diária com demografia e canais)
  const aud = d.audience ?? {
    topAge: [
      { label: '25-34 anos', pct: 42 },
      { label: '35-44 anos', pct: 32 },
      { label: '45-54 anos', pct: 16 },
      { label: '55-64 anos', pct: 10 },
    ],
    gender: { female: 64, male: 36 },
    platforms: { instagram: 80, facebook: 20 },
  }

  const ageEls: El[] = [
    { t: 'box', x: 80, y: 190, w: 350, h: 460, fill: '#F8FAFC', line: '#E2E8F0', radius: 16 },
    { t: 'box', x: 125, y: 215, w: 260, h: 32, fill: 'rgba(111,109,247,0.12)', radius: 16 },
    { t: 'text', x: 125, y: 215, w: 260, h: 32, text: 'FAIXA ETÁRIA PREDOMINANTE', size: 12, weight: 700, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 },
  ]
  aud.topAge.slice(0, 4).forEach((a, i) => {
    const y = 275 + i * 80
    const barW = Math.max(10, Math.round((a.pct / 100) * 280))
    ageEls.push(
      { t: 'text', x: 110, y, w: 180, h: 22, text: a.label, size: 14, weight: 600, color: P.ink, lineHeight: 1.2 },
      { t: 'text', x: 290, y, w: 100, h: 22, text: `${a.pct}%`, size: 15, weight: 700, color: P.violet, align: 'right', lineHeight: 1.2 },
      { t: 'box', x: 110, y: y + 26, w: 280, h: 10, fill: '#E2E8F0', radius: 5 },
      { t: 'box', x: 110, y: y + 26, w: barW, h: 10, fill: P.violet, radius: 5 },
    )
  })
  ageEls.push(
    { t: 'text', x: 100, y: 595, w: 310, h: 36, text: 'Segmento com maior engajamento e volume de retorno no período.', size: 12, weight: 500, color: P.soft, align: 'center', lineHeight: 1.3 }
  )

  const genderEls: El[] = [
    { t: 'box', x: 465, y: 190, w: 350, h: 460, fill: '#F8FAFC', line: '#E2E8F0', radius: 16 },
    { t: 'box', x: 510, y: 215, w: 260, h: 32, fill: 'rgba(111,109,247,0.12)', radius: 16 },
    { t: 'text', x: 510, y: 215, w: 260, h: 32, text: 'DISTRIBUIÇÃO POR GÊNERO', size: 12, weight: 700, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 },
    { t: 'text', x: 495, y: 275, w: 290, h: 60, text: `${aud.gender.female}%`, size: 52, weight: 800, color: P.violet, align: 'center', lineHeight: 1.1 },
    { t: 'text', x: 495, y: 340, w: 290, h: 24, text: 'Público Feminino', size: 16, weight: 700, color: P.ink, align: 'center', lineHeight: 1.2 },
    { t: 'box', x: 495, y: 372, w: 290, h: 10, fill: '#E2E8F0', radius: 5 },
    { t: 'box', x: 495, y: 372, w: Math.max(10, Math.round((aud.gender.female / 100) * 290)), h: 10, fill: P.violet, radius: 5 },
    { t: 'text', x: 495, y: 425, w: 290, h: 56, text: `${aud.gender.male}%`, size: 48, weight: 800, color: P.ink, align: 'center', lineHeight: 1.1 },
    { t: 'text', x: 495, y: 485, w: 290, h: 24, text: 'Público Masculino', size: 16, weight: 700, color: P.ink, align: 'center', lineHeight: 1.2 },
    { t: 'box', x: 495, y: 515, w: 290, h: 10, fill: '#E2E8F0', radius: 5 },
    { t: 'box', x: 495, y: 515, w: Math.max(10, Math.round((aud.gender.male / 100) * 290)), h: 10, fill: '#94A3B8', radius: 5 },
    { t: 'text', x: 485, y: 595, w: 310, h: 36, text: 'Proporção de alcance e interações ativas em todos os anúncios.', size: 12, weight: 500, color: P.soft, align: 'center', lineHeight: 1.3 },
  ]

  const platformEls: El[] = [
    { t: 'box', x: 850, y: 190, w: 350, h: 460, fill: '#F8FAFC', line: '#E2E8F0', radius: 16 },
    { t: 'box', x: 895, y: 215, w: 260, h: 32, fill: 'rgba(111,109,247,0.12)', radius: 16 },
    { t: 'text', x: 895, y: 215, w: 260, h: 32, text: 'PLATAFORMAS DE VEICULAÇÃO', size: 12, weight: 700, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 },
    { t: 'text', x: 880, y: 275, w: 290, h: 60, text: `${aud.platforms.instagram}%`, size: 52, weight: 800, color: P.violet, align: 'center', lineHeight: 1.1 },
    { t: 'text', x: 880, y: 340, w: 290, h: 24, text: 'Instagram (Feed, Stories & Reels)', size: 15, weight: 700, color: P.ink, align: 'center', lineHeight: 1.2 },
    { t: 'box', x: 880, y: 372, w: 290, h: 10, fill: '#E2E8F0', radius: 5 },
    { t: 'box', x: 880, y: 372, w: Math.max(10, Math.round((aud.platforms.instagram / 100) * 290)), h: 10, fill: P.violet, radius: 5 },
    { t: 'text', x: 880, y: 425, w: 290, h: 56, text: `${aud.platforms.facebook}%`, size: 48, weight: 800, color: P.ink, align: 'center', lineHeight: 1.1 },
    { t: 'text', x: 880, y: 485, w: 290, h: 24, text: 'Facebook (Feed & Grupos)', size: 15, weight: 700, color: P.ink, align: 'center', lineHeight: 1.2 },
    { t: 'box', x: 880, y: 515, w: 290, h: 10, fill: '#E2E8F0', radius: 5 },
    { t: 'box', x: 880, y: 515, w: Math.max(10, Math.round((aud.platforms.facebook / 100) * 290)), h: 10, fill: '#94A3B8', radius: 5 },
    { t: 'text', x: 870, y: 595, w: 310, h: 36, text: 'Distribuição inteligente focada em posicionamentos de menor custo.', size: 12, weight: 500, color: P.soft, align: 'center', lineHeight: 1.3 },
  ]

  slides.push({
    id: 'audience', label: 'Público & Canais', dark: false,
    els: [
      ...corners(false),
      title('Perfil do Público & Posicionamentos', 56, 60, 'center'),
      { t: 'text', x: 60, y: 135, w: 1160, h: 30, text: 'Demografia por faixa etária, gênero e divisão de veiculação entre plataformas.', size: 16, weight: 500, color: P.ink, align: 'center', lineHeight: 1.2 },
      ...ageEls,
      ...genderEls,
      ...platformEls,
      ...band(false),
    ],
  })

  // 7 — Funil de Conversão
  const f = d.funnel
  const cplStat = paid.stats.find(s => s.lowerIsBetter && s.label.toLowerCase().startsWith('custo'))
  slides.push({
    id: 'funnel', label: 'Funil de Vendas', dark: false,
    els: [
      ...corners(false),
      title('Funil de Conversão', 56, 60, 'center'),
      { t: 'text', x: 60, y: 135, w: 1160, h: 30, text: `Eficiência das etapas: da exibição do anúncio até o ${paid.resultLabel.toLowerCase()} final.`, size: 16, weight: 500, color: P.ink, align: 'center', lineHeight: 1.2 },
      // Etapa 1: Impressões
      { t: 'box', x: 140, y: 220, w: 260, h: 340, fill: '#F8FAFC', line: '#E2E8F0', radius: 16 },
      { t: 'box', x: 180, y: 245, w: 180, h: 32, fill: 'rgba(111,109,247,0.12)', radius: 16 },
      { t: 'text', x: 180, y: 245, w: 180, h: 32, text: '1. ATRAÇÃO', size: 12, weight: 700, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 },
      { t: 'text', x: 150, y: 300, w: 240, h: 26, text: 'Impressões Totais', size: 15, weight: 600, color: P.soft, align: 'center', lineHeight: 1.2 },
      { t: 'text', x: 150, y: 340, w: 240, h: 56, text: compact(f?.impressions ?? 0), size: 48, weight: 800, color: P.ink, align: 'center', lineHeight: 1.1 },
      { t: 'text', x: 150, y: 440, w: 240, h: 22, text: 'Pessoas impactadas', size: 13, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },

      // Conector 1 -> 2
      { t: 'box', x: 420, y: 340, w: 70, h: 42, fill: P.violet, radius: 21 },
      { t: 'text', x: 420, y: 340, w: 70, h: 42, text: `${f?.ctr ?? 0}%`, size: 13, weight: 700, color: P.white, align: 'center', valign: 'middle', lineHeight: 1.2 },
      { t: 'text', x: 410, y: 390, w: 90, h: 18, text: 'Taxa de clique', size: 10, weight: 600, color: P.soft, align: 'center', lineHeight: 1.2 },

      // Etapa 2: Cliques
      { t: 'box', x: 510, y: 220, w: 260, h: 340, fill: '#F8FAFC', line: '#E2E8F0', radius: 16 },
      { t: 'box', x: 550, y: 245, w: 180, h: 32, fill: 'rgba(111,109,247,0.12)', radius: 16 },
      { t: 'text', x: 550, y: 245, w: 180, h: 32, text: '2. INTERESSE', size: 12, weight: 700, color: P.violet, align: 'center', valign: 'middle', lineHeight: 1.2 },
      { t: 'text', x: 520, y: 300, w: 240, h: 26, text: 'Cliques no Link', size: 15, weight: 600, color: P.soft, align: 'center', lineHeight: 1.2 },
      { t: 'text', x: 520, y: 340, w: 240, h: 56, text: compact(f?.clicks ?? 0), size: 48, weight: 800, color: P.ink, align: 'center', lineHeight: 1.1 },
      { t: 'text', x: 520, y: 440, w: 240, h: 22, text: 'Visitas direcionadas', size: 13, weight: 500, color: P.soft, align: 'center', lineHeight: 1.2 },

      // Conector 2 -> 3
      { t: 'box', x: 790, y: 340, w: 70, h: 42, fill: P.green, radius: 21 },
      { t: 'text', x: 790, y: 340, w: 70, h: 42, text: `${f?.clickToResultRate ?? 0}%`, size: 13, weight: 700, color: P.white, align: 'center', valign: 'middle', lineHeight: 1.2 },
      { t: 'text', x: 780, y: 390, w: 90, h: 18, text: 'Conversão', size: 10, weight: 600, color: P.soft, align: 'center', lineHeight: 1.2 },

      // Etapa 3: Resultados
      { t: 'box', x: 880, y: 220, w: 260, h: 340, fill: '#F8FAFC', line: '#E2E8F0', radius: 16 },
      { t: 'box', x: 920, y: 245, w: 180, h: 32, fill: 'rgba(22,163,74,0.15)', radius: 16 },
      { t: 'text', x: 920, y: 245, w: 180, h: 32, text: '3. RESULTADO', size: 12, weight: 700, color: P.green, align: 'center', valign: 'middle', lineHeight: 1.2 },
      { t: 'text', x: 890, y: 300, w: 240, h: 26, text: paid.resultLabel, size: 15, weight: 600, color: P.soft, align: 'center', lineHeight: 1.2 },
      { t: 'text', x: 890, y: 340, w: 240, h: 56, text: compact(f?.results ?? 0), size: 48, weight: 800, color: P.green, align: 'center', lineHeight: 1.1 },
      { t: 'text', x: 890, y: 440, w: 240, h: 22, text: cplStat ? `Custo: ${cplStat.value}` : 'Conversões concluídas', size: 13, weight: 600, color: P.ink, align: 'center', lineHeight: 1.2 },

      ...band(false),
    ],
  })

  // 8 — Melhores Campanhas (Smart table com entregas reais, CPL ou CPC)
  const camps = d.campaigns ?? []
  const hasCamps = camps.length > 0
  slides.push({
    id: 'campaigns', label: 'Campanhas', dark: false,
    els: [
      ...corners(false),
      title('Melhores Campanhas', 56, 60, 'center'),
      { t: 'text', x: 60, y: 140, w: 1160, h: 30, text: `Desempenho detalhado das campanhas com entregas e custos unitários reais no período.`, size: 16, weight: 500, color: P.ink, align: 'center', lineHeight: 1.2 } as El,
      ...(hasCamps ? [
        {
          t: 'table' as const,
          x: 80, y: 200, w: 1120, h: 380,
          headers: ['Campanha', 'Status', 'Investimento', 'Entregas Principais', 'Custo Unitário', 'CTR'],
          colWidths: [380, 110, 160, 180, 160, 130],
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
      ...band(false),
    ],
  })

  // 9 — Criativos Campeões (com mockup moderno e métricas inteligentes)
  slides.push({
    id: 'creatives', label: 'Criativos', dark: false,
    els: [
      ...corners(false),
      title('Criativos Campeões', 76, 50),
      { t: 'text', x: 60, y: 146, w: 1160, h: 26, text: `Anúncios com maior volume de entrega e retorno ${is7d ? 'na semana' : 'no mês'} na Meta.`, size: 16, weight: 500, color: P.ink, lineHeight: 1.2 } as El,
      ...phones(paid.top.map(a => {
        const hasConv = a.results > 0
        const hasClicks = (a.clicks ?? 0) > 0
        const primaryLabel = hasConv ? paid.resultLabel : hasClicks ? 'Cliques no link' : 'Impressões'
        const primaryVal = hasConv ? compact(a.results) : hasClicks ? compact(a.clicks) : compact(a.impressions)
        const costLabel = hasConv ? 'Custo / res.' : hasClicks ? 'Custo / clique' : 'CTR'
        const costVal = hasConv && a.costPerResult != null
          ? money(a.costPerResult)
          : hasClicks && a.spend && a.clicks
            ? money(a.spend / a.clicks)
            : pct(a.ctr)

        return {
          thumb: notes.creativeOverrides?.[a.id] || proxied(a.thumb),
          stats: [
            [primaryLabel, primaryVal],
            ['Investimento', a.spend ? money(a.spend) : '—'],
            [costLabel, costVal],
          ] as Array<[string, string]>,
          format: hasConv ? 'CONVERSÃO' : hasClicks ? 'TRÁFEGO' : 'FEED',
        }
      }), true),
      ...band(false),
    ],
  })

  // 10 — Análise Estratégica
  slides.push({
    id: 'analysis', label: 'Análise', dark: false,
    els: [
      ...corners(false),
      title(is7d ? 'Análise do período' : 'Análise do mês', 72, 56),
      { t: 'text', x: 110, y: 190, w: 1060, h: 450, text: notes.analysis, size: 22, weight: 400, color: P.ink, lineHeight: 1.5, edit: 'analysis', placeholder: `O que aconteceu ${is7d ? 'no período' : 'no mês'} e por quê (clique para escrever)` },
      ...band(false),
    ],
  })

  // 11 — Próximos passos & Otimizações
  slides.push({
    id: 'next', label: 'Próximos passos', dark: false,
    els: [
      ...corners(false),
      title('Próximos passos & Otimizações', 66, 56),
      { t: 'text', x: 110, y: 190, w: 1060, h: 450, text: notes.next, size: 22, weight: 400, color: P.ink, lineHeight: 1.5, edit: 'next', placeholder: `O que vamos fazer ${is7d ? 'na próxima semana' : 'no próximo mês'} (clique para escrever)` },
      ...band(false),
    ],
  })

  return slides
}

/** Retorna os slides correspondentes ao modo selecionado (padrão ou avançado). */
export function buildSlides(d: ReportData, notes: ReportNotes, mode: ReportMode = 'standard'): SlideSpec[] {
  return mode === 'advanced' ? buildAdvancedSlides(d, notes) : buildStandardSlides(d, notes)
}
