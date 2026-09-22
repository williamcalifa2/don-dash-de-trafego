/** Gera o PowerPoint (.pptx) a partir dos mesmos slides do editor. Roda no navegador; textos ficam editáveis no PowerPoint e no Canva. */
import { FONT, PALETTE, STAGE, type SlideSpec } from './reportSlides'

const IN = 96 // px do palco por polegada (1280 px = 13,333 pol)
const inch = (px: number) => px / IN
const pt = (px: number) => Math.round(px * 0.75 * 10) / 10
const hex = (c: string) => c.replace('#', '')

async function toData(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { credentials: 'same-origin' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    return await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob) })
  } catch { return null }
}

export async function downloadPptx(slides: SlideSpec[], fileName: string): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'DON', width: inch(STAGE.w), height: inch(STAGE.h) })
  pptx.layout = 'DON'
  pptx.title = fileName
  pptx.company = 'Don Comunicação Digital'

  for (const spec of slides) {
    const slide = pptx.addSlide()
    slide.background = { color: hex(spec.dark ? PALETTE.dark : PALETTE.light) }
    for (const el of spec.els) {
      const pos = { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h) }
      if (el.t === 'box') {
        slide.addShape(el.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          ...pos, ...(el.fill ? { fill: { color: hex(el.fill) } } : { fill: { type: 'none' } }),
          line: el.line ? { color: hex(el.line), width: 1.5 } : { type: 'none' },
          ...(el.radius ? { rectRadius: inch(Math.min(el.radius, Math.min(el.w, el.h) / 2)) } : {}),
        })
      } else if (el.t === 'img') {
        const data = el.src ? await toData(el.src) : null
        if (data) slide.addImage({ data, ...pos, sizing: { type: 'cover', w: pos.w, h: pos.h } })
        else slide.addShape(pptx.ShapeType.rect, { ...pos, fill: { color: 'D9D9E6' }, line: { type: 'none' } })
      } else if (el.t === 'chart') {
        const chartType = el.chartType === 'line' ? pptx.ChartType.line : pptx.ChartType.bar
        slide.addChart(chartType, el.data, {
          ...pos,
          showTitle: !!el.title,
          title: el.title ?? '',
          titleFontSize: pt(14),
          titleColor: hex(PALETTE.ink),
          titleFontFace: FONT,
          chartColors: el.colors.map(hex),
          showLegend: true,
          legendPos: 'b',
          legendFontSize: pt(11),
          legendFontFace: FONT,
          lineSmooth: true,
          lineDataSymbol: 'circle',
          lineDataSymbolSize: 6,
          valAxisLineShow: true,
          catAxisLineShow: true,
        })
      } else if (el.t === 'table') {
        const headerRow = el.headers.map((h, i) => ({
          text: h,
          options: {
            fontFace: FONT,
            fontSize: pt(13),
            bold: true,
            color: 'FFFFFF',
            fill: { color: hex(PALETTE.violet) },
            align: (i === 0 ? 'left' : 'right') as 'left' | 'right' | 'center',
            valign: 'middle' as const,
          },
        }))
        const dataRows = el.rows.map((row, rIdx) =>
          row.map(cell => ({
            text: cell.text,
            options: {
              fontFace: FONT,
              fontSize: pt(12),
              bold: !!cell.bold,
              color: hex(cell.color ?? PALETTE.ink),
              fill: { color: rIdx % 2 === 0 ? 'FFFFFF' : 'F7F7FA' },
              align: (cell.align ?? 'left') as 'left' | 'right' | 'center',
              valign: 'middle' as const,
            },
          }))
        )
        slide.addTable([headerRow, ...dataRows], {
          ...pos,
          colW: el.colWidths.map(inch),
          border: { type: 'solid', pt: 1, color: 'E2E2EA' },
          margin: [4, 8, 4, 8],
        })
      } else if (el.text.trim()) {
        const lines = el.text.split('\n')
        slide.addText(lines.map((line, i) => ({ text: line, options: { breakLine: i < lines.length - 1 } })), {
          ...pos, fontFace: FONT, fontSize: pt(el.size), bold: (el.weight ?? 400) >= 600, color: hex(el.color),
          align: el.align ?? 'left', valign: el.valign ?? 'top', margin: 0, wrap: true,
          ...(el.lineHeight ? { lineSpacingMultiple: el.lineHeight } : {}),
        })
      }
    }
  }
  await pptx.writeFile({ fileName: `${fileName}.pptx` })
}
