/**
 * Slides do relatório mensal como dados (posição, texto, cor), num palco de 1280 x 720.
 * A mesma descrição desenha a tela do editor e gera o PowerPoint, então o que se vê é o que se baixa.
 */
import { compact, deltaLabel, pct, type ReportData, type ReportNotes, type ReportStat } from './report'

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
export interface SlideSpec { id: string; label: string; dark: boolean; els: El[] }

const P = PALETTE
const upper = (s: string) => s.toLocaleUpperCase('pt-BR')
const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
export const proxied = (u: string | null) => (u ? `/api/report/img?u=${encodeURIComponent(u)}` : null)

function corners(dark: boolean): El[] {
  const c = dark ? '#B9B9D0' : '#55556A'
  const s = 10
  return [
    { t: 'text', x: 40, y: 30, w: 400, h: 16, text: 'DON COMUNICAÇÃO DIGITAL', size: s, weight: 600, color: c },
    { t: 'text', x: 840, y: 30, w: 400, h: 16, text: 'O OURO OU NADA', size: s, weight: 600, color: c, align: 'right' },
    { t: 'text', x: 40, y: 676, w: 400, h: 16, text: 'O OURO OU NADA', size: s, weight: 600, color: c },
    { t: 'text', x: 840, y: 676, w: 400, h: 16, text: 'DON COMUNICAÇÃO DIGITAL', size: s, weight: 600, color: c, align: 'right' },
  ]
}
const band = (dark: boolean): El[] => [{ t: 'box', x: 0, y: 708, w: 1280, h: 12, fill: dark ? P.violet : P.violet }]
const title = (text: string, size: number, y: number, align: 'left' | 'center' = 'left', h = size + 20): El => ({ t: 'text', x: 60, y, w: 1160, h, text: upper(text), size, weight: 800, color: P.violet, align, lineHeight: 1 })

function statCell(s: ReportStat, x: number, y: number): El[] {
  const d = s.delta == null ? '' : deltaLabel(s.delta)
  const good = s.delta == null ? true : s.lowerIsBetter ? s.delta <= 0 : s.delta >= 0
  return [
    { t: 'box', x: x - 130, y, w: 260, h: 36, line: P.violet, radius: 18 },
    { t: 'text', x: x - 130, y, w: 260, h: 36, text: upper(s.label), size: 14, weight: 600, color: P.violet, align: 'center', valign: 'middle' },
    { t: 'text', x: x - 190, y: y + 46, w: 380, h: 64, text: s.value, size: 54, weight: 500, color: P.ink, align: 'center', valign: 'middle' },
    ...(d ? [{ t: 'text', x: x - 190, y: y + 110, w: 380, h: 22, text: d, size: 16, weight: 700, color: good ? P.green : P.red, align: 'center' } as El] : []),
  ]
}

interface Phone { thumb: string | null; stats: Array<[string, string]> }
function phones(items: Phone[]): El[] {
  const out: El[] = []
  items.slice(0, 3).forEach((it, i) => {
    const x0 = 70 + i * 400
    out.push({ t: 'box', x: x0, y: 205, w: 190, h: 400, fill: P.phone, radius: 30 })
    out.push({ t: 'img', x: x0 + 9, y: 214, w: 172, h: 382, src: it.thumb, radius: 22 })
    it.stats.forEach(([label, value], j) => {
      const y = 245 + j * 100
      out.push({ t: 'text', x: x0 + 215, y, w: 160, h: 20, text: label, size: 14, weight: 700, color: P.ink, align: 'center' })
      out.push({ t: 'box', x: x0 + 225, y: y + 26, w: 140, h: 38, fill: P.violet, radius: 19 })
      out.push({ t: 'text', x: x0 + 225, y: y + 26, w: 140, h: 38, text: value, size: 16, weight: 700, color: P.white, align: 'center', valign: 'middle' })
    })
  })
  return out
}

export function buildSlides(d: ReportData, notes: ReportNotes): SlideSpec[] {
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
      { t: 'text', x: 60, y: 146, w: 1160, h: 26, text: `Anúncios campeões ${is7d ? 'da semana' : 'do mês'} no gerenciador de anúncios da Meta.`, size: 16, weight: 500, color: P.ink },
      ...phones(paid.top.map(a => ({
        thumb: proxied(a.thumb),
        stats: [[paid.resultLabel, compact(a.results)], ['Investimento', a.spend ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: d.currency }).format(a.spend) : '—'], [a.costPerResult != null ? 'Custo por resultado' : 'CTR', a.costPerResult != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: d.currency }).format(a.costPerResult) : pct(a.ctr)]] as Array<[string, string]>,
      }))),
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
