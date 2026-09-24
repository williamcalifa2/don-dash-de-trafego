'use client'

import { useEffect, useState } from 'react'
import { Slide } from '@/components/ReportStudio'
import { STAGE, type SlideSpec } from '@/lib/reportSlides'
import type { Mark } from '@/lib/presentation'

/** Escala que faz o palco 1280 x 720 caber na caixa (sem passar de `max`). Usa ref por função: a caixa pode aparecer depois da primeira renderização. */
export function useFit<T extends HTMLElement>(max = 2, pad = 0) {
  const [el, setEl] = useState<T | null>(null)
  const [scale, setScale] = useState(0.3)
  useEffect(() => {
    if (!el) return
    const fit = () => setScale(Math.max(0.1, Math.min(max, (el.clientWidth - pad) / STAGE.w, (el.clientHeight - pad) / STAGE.h)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, max, pad])
  return { ref: setEl, scale }
}

/** As imagens dos slides passam pelo proxy da equipe; na tela do cliente passam pelo proxy do link (que confere o código). */
export function rewriteImages(slides: SlideSpec[], token: string): SlideSpec[] {
  const from = '/api/report/img?u=', to = `/api/present/${token}/img?u=`
  return slides.map(s => ({ ...s, els: s.els.map(e => ('src' in e && typeof e.src === 'string' && e.src.startsWith(from) ? { ...e, src: to + e.src.slice(from.length) } : e)) }))
}

export function MarksLayer({ marks, live }: { marks: Mark[]; live?: Mark | null }) {
  const all = live ? [...marks, live] : marks
  if (!all.length) return null
  return (
    <svg viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
      {all.map((m, i) => {
        if (m.t === 'pen' || m.t === 'hl') return <polyline key={i} points={m.p.map(([x, y]) => `${x * STAGE.w},${y * STAGE.h}`).join(' ')} fill="none" stroke={m.c} strokeWidth={m.t === 'hl' ? Math.max(m.w, 18) : m.w} strokeOpacity={m.t === 'hl' ? 0.38 : 1} strokeLinecap={m.t === 'hl' ? 'butt' : 'round'} strokeLinejoin="round" />
        if (m.t === 'rect') return <rect key={i} x={Math.min(m.x1, m.x2) * STAGE.w} y={Math.min(m.y1, m.y2) * STAGE.h} width={Math.abs(m.x2 - m.x1) * STAGE.w} height={Math.abs(m.y2 - m.y1) * STAGE.h} fill="none" stroke={m.c} strokeWidth={m.w} rx={4} />
        if (m.t === 'circle') return <ellipse key={i} cx={((m.x1 + m.x2) / 2) * STAGE.w} cy={((m.y1 + m.y2) / 2) * STAGE.h} rx={(Math.abs(m.x2 - m.x1) / 2) * STAGE.w} ry={(Math.abs(m.y2 - m.y1) / 2) * STAGE.h} fill="none" stroke={m.c} strokeWidth={m.w} />
        if (m.t === 'arrow') {
          const [x1, y1, x2, y2] = [m.x1 * STAGE.w, m.y1 * STAGE.h, m.x2 * STAGE.w, m.y2 * STAGE.h]
          const a = Math.atan2(y2 - y1, x2 - x1), h = 22 + m.w * 2
          const head = `${x2},${y2} ${x2 - h * Math.cos(a - 0.45)},${y2 - h * Math.sin(a - 0.45)} ${x2 - h * Math.cos(a + 0.45)},${y2 - h * Math.sin(a + 0.45)}`
          return <g key={i} stroke={m.c} strokeWidth={m.w} strokeLinecap="round" strokeLinejoin="round"><line x1={x1} y1={y1} x2={x2} y2={y2} /><polygon points={head} fill={m.c} /></g>
        }
        if (m.t !== 'text') return null
        return <text key={i} x={m.x * STAGE.w} y={m.y * STAGE.h} fill={m.c} fontSize={m.sz} fontWeight={700} fontFamily="Montserrat, system-ui, sans-serif" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.35)', strokeWidth: 3 }}>{m.s}</text>
      })}
    </svg>
  )
}

/** Um slide na escala pedida, com as anotações por cima. */
export function SlideView({ spec, scale, marks, children }: { spec: SlideSpec; scale: number; marks?: Mark[]; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: STAGE.w * scale, height: STAGE.h * scale }}>
      <Slide spec={spec} scale={scale} />
      {marks && marks.length > 0 && <div style={{ position: 'absolute', inset: 0 }}><MarksLayer marks={marks} /></div>}
      {children}
    </div>
  )
}
