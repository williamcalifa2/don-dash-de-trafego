/** Gera o PowerPoint (.pptx) a partir dos mesmos slides do editor. Roda no navegador; textos ficam editáveis no PowerPoint e no Canva. */
import { compact, FONT, PALETTE, STAGE, type El, type SlideSpec } from './reportSlides'

const IN = 96 // px do palco por polegada (1280 px = 13,333 pol)
const inch = (px: number) => px / IN
const pt = (px: number) => Math.round(px * 0.75 * 10) / 10

function toPptxColor(c: string | undefined): { color: string; transparency?: number } | null {
  if (!c) return null
  const str = c.trim()
  if (str.startsWith('#')) {
    const clean = str.slice(1)
    if (clean.length === 6) return { color: clean.toUpperCase() }
    if (clean.length === 3) return { color: clean.split('').map(x => x + x).join('').toUpperCase() }
    if (clean.length === 8) {
      const rgb = clean.slice(0, 6)
      const alpha = parseInt(clean.slice(6, 8), 16) / 255
      return { color: rgb.toUpperCase(), transparency: Math.round((1 - alpha) * 100) }
    }
  }
  if (str.startsWith('rgba(')) {
    const parts = str.replace('rgba(', '').replace(')', '').split(',').map(s => s.trim())
    const r = Math.max(0, Math.min(255, parseInt(parts[0], 10) || 0))
    const g = Math.max(0, Math.min(255, parseInt(parts[1], 10) || 0))
    const b = Math.max(0, Math.min(255, parseInt(parts[2], 10) || 0))
    const a = Math.max(0, Math.min(1, parseFloat(parts[3]) || 0))
    const rgbHex = [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
    return { color: rgbHex, transparency: Math.round((1 - a) * 100) }
  }
  if (str.startsWith('rgb(')) {
    const parts = str.replace('rgb(', '').replace(')', '').split(',').map(s => s.trim())
    const r = Math.max(0, Math.min(255, parseInt(parts[0], 10) || 0))
    const g = Math.max(0, Math.min(255, parseInt(parts[1], 10) || 0))
    const b = Math.max(0, Math.min(255, parseInt(parts[2], 10) || 0))
    return { color: [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase() }
  }
  return { color: str.replace('#', '').toUpperCase() }
}
const hex = (c: string) => toPptxColor(c)?.color ?? '000000'

async function toData(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { credentials: 'same-origin' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
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
        const fillStyle = toPptxColor(el.fill)
        slide.addShape(el.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          ...pos,
          fill: fillStyle ? { color: fillStyle.color, ...(fillStyle.transparency ? { transparency: fillStyle.transparency } : {}) } : { type: 'none' },
          line: el.line ? { color: hex(el.line), width: 1.5 } : { type: 'none' },
          ...(el.radius ? { rectRadius: inch(Math.min(el.radius, Math.min(el.w, el.h) / 2)) } : {}),
          ...(el.url ? { hyperlink: { url: el.url } } : {}),
        })
      } else if (el.t === 'img') {
        const data = el.src ? await toData(el.src) : null
        if (data) {
          slide.addImage({ data, ...pos, sizing: { type: 'cover', w: pos.w, h: pos.h } })
        } else {
          slide.addShape(pptx.ShapeType.roundRect, {
            ...pos,
            fill: { color: hex(PALETTE.card) },
            line: { color: hex(PALETTE.cardBorder), width: 1 },
            rectRadius: inch(8),
          })
        }
      } else if (el.t === 'chart') {
        // Suporte a gráficos Donut (rosca) e Barras (agrupadas e simples)
        if (el.chartType === 'doughnut') {
          // Card de fundo
          slide.addShape(pptx.ShapeType.roundRect, {
            ...pos,
            fill: { color: hex(PALETTE.card) },
            line: { color: hex(PALETTE.cardBorder), width: 1.5 },
            rectRadius: inch(14),
          })
          slide.addText(el.title ?? '', {
            x: pos.x + inch(20),
            y: pos.y + inch(16),
            w: pos.w - inch(40),
            h: inch(30),
            fontSize: pt(15),
            bold: true,
            color: hex(PALETTE.white),
            fontFace: FONT,
          })
          slide.addChart(pptx.ChartType.doughnut, el.data, {
            x: pos.x + inch(15),
            y: pos.y + inch(55),
            w: pos.w - inch(30),
            h: pos.h - inch(70),
            holeSize: el.holeSize ?? 60,
            chartColors: el.colors.map(hex),
            showLegend: el.showLegend ?? true,
            legendPos: 'r',
            legendFontSize: pt(11),
            legendColor: hex(PALETTE.white),
            legendFontFace: FONT,
            showPercent: true,
            dataLabelColor: hex(PALETTE.white),
            dataLabelFontSize: pt(10),
          })
        } else {
          const chartType = el.chartType === 'line' ? pptx.ChartType.line : pptx.ChartType.bar
          // Card de fundo
          slide.addShape(pptx.ShapeType.roundRect, {
            ...pos,
            fill: { color: hex(PALETTE.card) },
            line: { color: hex(PALETTE.cardBorder), width: 1.5 },
            rectRadius: inch(14),
          })
          if (el.title) {
            slide.addText(el.title, {
              x: pos.x + inch(20),
              y: pos.y + inch(14),
              w: pos.w - inch(40),
              h: inch(26),
              fontSize: pt(14),
              bold: true,
              color: hex(PALETTE.white),
              fontFace: FONT,
            })
          }
          const chartH = el.costSubtitle ? pos.h - inch(75) : pos.h - inch(55)
          slide.addChart(chartType, el.data, {
            x: pos.x + inch(15),
            y: pos.y + inch(45),
            w: pos.w - inch(30),
            h: chartH,
            showTitle: false,
            chartColors: el.colors.map(hex),
            barGrouping: el.barGrouping ?? 'clustered',
            showLegend: el.showLegend ?? true,
            legendPos: 't',
            legendFontSize: pt(10),
            legendColor: hex(PALETTE.soft),
            legendFontFace: FONT,
            valAxisLabelColor: hex(PALETTE.muted),
            catAxisLabelColor: hex(PALETTE.soft),
            valAxisLineShow: false,
            catAxisLineShow: true,
            showValue: el.showValueLabels ?? false,
            dataLabelColor: hex(PALETTE.white),
            dataLabelFontSize: pt(9),
          })
          if (el.costSubtitle) {
            slide.addText(el.costSubtitle, {
              x: pos.x + inch(15),
              y: pos.y + pos.h - inch(26),
              w: pos.w - inch(30),
              h: inch(20),
              fontSize: pt(10),
              color: hex(PALETTE.muted),
              fontFace: FONT,
              align: 'center',
            })
          }
        }
      } else if (el.t === 'funnel') {
        // Container escuro do Funil
        slide.addShape(pptx.ShapeType.roundRect, {
          ...pos,
          fill: { color: hex(PALETTE.card) },
          line: { color: hex(PALETTE.cardBorder), width: 1.5 },
          rectRadius: inch(16),
        })

        // Top KPI Header (4 etapas)
        const colW = (pos.w - inch(180)) / 4
        const stages = [
          { label: 'IMPRESSÕES', val: compact(el.impressions), sub: 'Pessoas impactadas' },
          { label: 'CLIQUES NO LINK', val: compact(el.clicks), sub: `${el.ctr}% CTR` },
          { label: el.resultLabel.toUpperCase(), val: compact(el.results), sub: el.costPerResult ? `Custo: ${el.costPerResult}` : 'Resultados' },
          { label: 'CONVERSÕES', val: compact(el.conversions), sub: 'Vendas / Contatos' },
        ]

        stages.forEach((stg, sIdx) => {
          const sx = pos.x + inch(20) + sIdx * colW
          slide.addText(stg.label, {
            x: sx, y: pos.y + inch(14), w: colW, h: inch(20),
            fontSize: pt(11), bold: true, color: hex(sIdx === 2 ? PALETTE.green : PALETTE.muted), fontFace: FONT,
          })
          slide.addText(stg.val, {
            x: sx, y: pos.y + inch(34), w: colW, h: inch(36),
            fontSize: pt(28), bold: true, color: hex(sIdx === 2 ? PALETTE.green : PALETTE.white), fontFace: FONT,
          })
          slide.addText(stg.sub, {
            x: sx, y: pos.y + inch(70), w: colW, h: inch(18),
            fontSize: pt(10), color: hex(PALETTE.soft), fontFace: FONT,
          })

          // Linhas divisórias entre colunas
          if (sIdx < 3) {
            slide.addShape(pptx.ShapeType.rect, {
              x: sx + colW - inch(5), y: pos.y + inch(18), w: inch(1), h: inch(65),
              fill: { color: hex(PALETTE.cardBorder) }, line: { type: 'none' },
            })
          }
        })

        // Badge de Retorno Geral (ROAS) no canto superior direito
        const roasVal = el.roas ? `${el.roas}x` : '0,0%'
        slide.addShape(pptx.ShapeType.roundRect, {
          x: pos.x + pos.w - inch(150), y: pos.y + inch(18), w: inch(130), h: inch(64),
          fill: { color: hex(PALETTE.cardSoft) }, line: { color: hex(PALETTE.cardBorder), width: 1 },
          rectRadius: inch(10),
        })
        slide.addText('RETORNO GERAL', {
          x: pos.x + pos.w - inch(150), y: pos.y + inch(24), w: inch(130), h: inch(18),
          fontSize: pt(9), bold: true, color: hex(PALETTE.muted), align: 'center', fontFace: FONT,
        })
        slide.addText(roasVal, {
          x: pos.x + pos.w - inch(150), y: pos.y + inch(42), w: inch(130), h: inch(32),
          fontSize: pt(20), bold: true, color: hex(PALETTE.white), align: 'center', fontFace: FONT,
        })

        // Área da onda / fluxo do funil
        slide.addShape(pptx.ShapeType.roundRect, {
          x: pos.x + inch(20), y: pos.y + inch(105), w: pos.w - inch(40), h: pos.h - inch(125),
          fill: { color: hex(PALETTE.cardSoft) }, line: { color: hex(PALETTE.cardBorder), width: 1 },
          rectRadius: inch(12),
        })

        // Pílulas de drop-off / taxas de conversão entre etapas
        const pillW = inch(140)
        const pillH = inch(36)
        const pillY = pos.y + inch(240)

        // Pílula 1: CTR
        slide.addShape(pptx.ShapeType.roundRect, {
          x: pos.x + colW - inch(50), y: pillY, w: pillW, h: pillH,
          fill: { color: hex(PALETTE.card) }, line: { color: hex(PALETTE.violet), width: 1.5 },
          rectRadius: inch(18),
        })
        slide.addText(`${el.ctr}% CTR`, {
          x: pos.x + colW - inch(50), y: pillY, w: pillW, h: pillH,
          fontSize: pt(12), bold: true, color: hex(PALETTE.violetLight), align: 'center', valign: 'middle', fontFace: FONT,
        })

        // Pílula 2: Conversa / Lead
        slide.addShape(pptx.ShapeType.roundRect, {
          x: pos.x + colW * 2 - inch(50), y: pillY + inch(45), w: pillW + inch(20), h: pillH,
          fill: { color: hex(PALETTE.card) }, line: { color: hex(PALETTE.green), width: 1.5 },
          rectRadius: inch(18),
        })
        slide.addText(`${el.clickToResultRate}% ${el.resultLabel}`, {
          x: pos.x + colW * 2 - inch(50), y: pillY + inch(45), w: pillW + inch(20), h: pillH,
          fontSize: pt(12), bold: true, color: hex(PALETTE.green), align: 'center', valign: 'middle', fontFace: FONT,
        })

        // Pílula 3: Venda / Conversão
        slide.addShape(pptx.ShapeType.roundRect, {
          x: pos.x + colW * 3 - inch(50), y: pillY + inch(80), w: pillW, h: pillH,
          fill: { color: hex(PALETTE.card) }, line: { color: hex(PALETTE.amber), width: 1.5 },
          rectRadius: inch(18),
        })
        slide.addText(`0,0% Venda`, {
          x: pos.x + colW * 3 - inch(50), y: pillY + inch(80), w: pillW, h: pillH,
          fontSize: pt(12), bold: true, color: hex(PALETTE.amber), align: 'center', valign: 'middle', fontFace: FONT,
        })
      } else if (el.t === 'table') {
        const headerRow = el.headers.map((h, i) => ({
          text: h,
          options: {
            fontFace: FONT,
            fontSize: pt(12),
            bold: true,
            color: 'FFFFFF',
            fill: { color: hex(PALETTE.violet) },
            align: (i === 0 ? 'left' : 'center') as 'left' | 'right' | 'center',
            valign: 'middle' as const,
          },
        }))
        const dataRows = el.rows.map((row, rIdx) =>
          row.map(cell => ({
            text: cell.text,
            options: {
              fontFace: FONT,
              fontSize: pt(11),
              bold: !!cell.bold,
              color: hex(cell.color ?? (spec.dark ? PALETTE.white : PALETTE.ink)),
              fill: { color: hex(rIdx % 2 === 0 ? PALETTE.card : PALETTE.cardSoft) },
              align: (cell.align ?? 'left') as 'left' | 'right' | 'center',
              valign: 'middle' as const,
            },
          }))
        )
        slide.addTable([headerRow, ...dataRows], {
          ...pos,
          colW: el.colWidths.map(inch),
          border: { type: 'solid', pt: 1, color: hex(PALETTE.cardBorder) },
          margin: [4, 8, 4, 8],
        })
      } else if (el.text.trim()) {
        const lines = el.text.split('\n')
        slide.addText(
          lines.map((line, i) => ({ text: line, options: { breakLine: i < lines.length - 1 } })),
          {
            ...pos,
            fontFace: FONT,
            fontSize: pt(el.size),
            bold: (el.weight ?? 400) >= 600,
            color: hex(el.color),
            align: el.align ?? 'left',
            valign: el.valign ?? 'top',
            margin: 0,
            wrap: true,
            ...(el.lineHeight ? { lineSpacingMultiple: el.lineHeight } : {}),
            ...(el.url ? { hyperlink: { url: el.url } } : {}),
          }
        )
      }
    }
  }
  await pptx.writeFile({ fileName: `${fileName}.pptx` })
}
