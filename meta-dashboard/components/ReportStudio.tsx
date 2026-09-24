'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileText,
  Highlighter,
  Loader2,
  Moon,
  MousePointer,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Type,
  Undo2,
  UploadCloud,
  X,
} from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from '@/components/PulseLoader'
import { compact, type ReportData, type ReportMode, type ReportNotes, type ReportPreset, type SavedReport } from '@/lib/report'
import { buildSlides, FONT, PALETTE, PALETTE_LIGHT, STAGE, type El, type SlideSpec } from '@/lib/reportSlides'
import { useTheme } from '@/lib/useTheme'

export type DrawTool = 'pointer' | 'laser' | 'pen' | 'highlighter' | 'rect' | 'circle' | 'arrow' | 'text'

export interface DrawPoint {
  x: number
  y: number
}

export interface DrawStroke {
  tool: DrawTool
  color: string
  width: number
  points: DrawPoint[]
  text?: string
  fontSize?: number
  fontFamily?: 'sans' | 'display' | 'serif' | 'mono'
}

const TEXT_FONTS = [
  { id: 'sans' as const, label: 'Inter' },
  { id: 'display' as const, label: 'Outfit' },
  { id: 'serif' as const, label: 'Serif' },
  { id: 'mono' as const, label: 'Mono' },
]

const TEXT_SIZES = [
  { label: 'P', size: 18 },
  { label: 'M', size: 26 },
  { label: 'G', size: 36 },
]

const DRAW_COLORS = [
  { label: 'Vermelho Destaque', value: '#EF4444' },
  { label: 'Amarelo Atenção', value: '#FACC15' },
  { label: 'Roxo Don', value: '#6366F1' },
  { label: 'Verde Sucesso', value: '#22C55E' },
  { label: 'Azul Ciano', value: '#06B6D4' },
  { label: 'Branco / Neutro', value: '#FFFFFF' },
]

const DRAW_WIDTHS = [
  { label: 'Fino', value: 3 },
  { label: 'Médio', value: 6 },
  { label: 'Grosso', value: 12 },
]

type Loaded = ReportData & { draftAnalysis: string }
type Phase = { kind: 'loading'; text: string } | { kind: 'error'; text: string } | { kind: 'ready'; data: Loaded }

const needsPrepare = (d: Loaded) => d.paid.status === 'pending' || d.organic.status === 'incomplete' || d.organic.status === 'pending'

function SvgChart({ el, dark = true }: { el: Extract<El, { t: 'chart' }>; dark?: boolean }) {
  const { data, colors } = el
  if (!data || data.length === 0 || !data[0]?.labels || data[0].labels.length === 0) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#9A9AB8', fontSize: 14 }}>Sem dados para exibir no gráfico</div>
  }

  const labels = data[0].labels
  const n = labels.length
  const w = 960
  const h = 360
  const padLeft = 65
  const padRight = 65
  const padTop = 30
  const padBottom = 50
  const plotW = w - padLeft - padRight
  const plotH = h - padTop - padBottom

  const s0 = data[0]
  const max0 = Math.max(...s0.values.map(v => Number(v) || 0), 1) * 1.15
  const s1 = data[1]
  const max1 = s1 ? Math.max(...s1.values.map(v => Number(v) || 0), 1) * 1.2 : 1

  const getX = (i: number) => padLeft + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const getY0 = (val: number) => padTop + plotH - ((Number(val) || 0) / max0) * plotH
  const getY1 = (val: number) => padTop + plotH - ((Number(val) || 0) / max1) * plotH

  const color0 = colors[0]?.startsWith('#') ? colors[0] : `#${colors[0] || '6F6DF7'}`
  const color1 = colors[1]?.startsWith('#') ? colors[1] : `#${colors[1] || '16A34A'}`

  const d0 = s0.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY0(v)}`).join(' ')
  const area0 = `${d0} L ${getX(n - 1)} ${padTop + plotH} L ${getX(0)} ${padTop + plotH} Z`
  const d1 = s1 ? s1.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY1(v)}`).join(' ') : ''

  const stepCount = 4
  const gridLines = Array.from({ length: stepCount + 1 }).map((_, idx) => {
    const ratio = idx / stepCount
    const y = padTop + plotH - ratio * plotH
    const v0 = Math.round(ratio * max0)
    const v1 = s1 ? Math.round(ratio * max1) : null
    return { y, v0, v1 }
  })

  const showLabelIdx = (i: number) => {
    if (n <= 10) return true
    if (n <= 20) return i % 2 === 0 || i === n - 1
    return i % Math.ceil(n / 10) === 0 || i === n - 1
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="chartGrad0" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color0} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color0} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {gridLines.map((g, idx) => (
          <g key={idx}>
            <line x1={padLeft} y1={g.y} x2={padLeft + plotW} y2={g.y} stroke={dark ? '#1E293B' : '#EAEAEF'} strokeDasharray="4 4" strokeWidth="1" />
            <text x={padLeft - 10} y={g.y + 4} textAnchor="end" fontSize="11" fill={color0} fontWeight="600" fontFamily="sans-serif">
              R$ {g.v0}
            </text>
            {g.v1 != null && (
              <text x={padLeft + plotW + 10} y={g.y + 4} textAnchor="start" fontSize="11" fill={color1} fontWeight="600" fontFamily="sans-serif">
                {g.v1}
              </text>
            )}
          </g>
        ))}

        <path d={area0} fill="url(#chartGrad0)" />
        <path d={d0} fill="none" stroke={color0} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {s0.values.map((v, i) => (
          <circle key={`c0-${i}`} cx={getX(i)} cy={getY0(v)} r="4" fill="#FFFFFF" stroke={color0} strokeWidth="2.5" />
        ))}

        {s1 && (
          <>
            <path d={d1} fill="none" stroke={color1} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {s1.values.map((v, i) => (
              <circle key={`c1-${i}`} cx={getX(i)} cy={getY1(v)} r="4" fill="#FFFFFF" stroke={color1} strokeWidth="2.5" />
            ))}
          </>
        )}

        {labels.map((lbl, i) => {
          if (!showLabelIdx(i)) return null
          return (
            <text key={`lbl-${i}`} x={getX(i)} y={padTop + plotH + 22} textAnchor="middle" fontSize="11" fill={dark ? '#CBD5E1' : '#71717A'} fontFamily="sans-serif">
              {lbl}
            </text>
          )
        })}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 6, fontSize: 13, fontWeight: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: dark ? '#F8FAFC' : '#0B0B14' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: color0 }} />
          <span>{s0.name} (Eixo esquerdo)</span>
        </div>
        {s1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: dark ? '#F8FAFC' : '#0B0B14' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: color1 }} />
            <span>{s1.name} (Eixo direito)</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SvgDoughnut({ el, dark = true }: { el: Extract<El, { t: 'chart' }>; dark?: boolean }) {
  const { data, colors } = el
  const s0 = data[0]
  if (!s0 || !s0.values.length) return null

  const total = s0.values.reduce((sum, v) => sum + Number(v || 0), 0)
  const R = 68
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px 15px', boxSizing: 'border-box' }}>
      <div style={{ position: 'relative', width: 170, height: 170, flexShrink: 0 }}>
        <svg viewBox="0 0 180 180" width="100%" height="100%">
          <circle cx={90} cy={90} r={R} fill="none" stroke={dark ? '#1E293B' : '#E2E8F0'} strokeWidth={24} />
          {total > 0 && s0.values.map((v, i) => {
            const val = Number(v || 0)
            const len = (val / total) * C
            const strokeColor = colors[i % colors.length] || '#818CF8'
            const circle = (
              <circle
                key={i}
                cx={90}
                cy={90}
                r={R}
                fill="none"
                stroke={strokeColor}
                strokeWidth={24}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 90 90)"
              >
                <title>{`${s0.labels[i]}: ${val.toFixed(1)}%`}</title>
              </circle>
            )
            acc += len
            return circle
          })}
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 180 }}>
        {s0.labels.map((lbl, i) => {
          const val = Number(s0.values[i] || 0)
          const dotColor = colors[i % colors.length] || '#818CF8'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: dark ? '#E2E8F0' : '#475569' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span>{lbl}</span>
              </div>
              <span style={{ fontWeight: 700, color: dark ? '#FFFFFF' : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                {val.toFixed(val >= 10 ? 0 : 1).replace('.', ',')}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SvgBarChart({ el, dark = true }: { el: Extract<El, { t: 'chart' }>; dark?: boolean }) {
  const { data, colors, showValueLabels, costSubtitle } = el
  if (!data || !data.length || !data[0].labels.length) return null

  const labels = data[0].labels
  const seriesCount = data.length
  const allVals = data.flatMap(s => s.values.map(v => Number(v) || 0))
  const max = Math.max(...allVals, 1) * 1.15

  const W = 520
  const H = costSubtitle ? 145 : 165
  const PL = 36
  const PR = 15
  const PT = showValueLabels ? 20 : 10
  const PB = 24
  const plotW = W - PL - PR
  const plotH = H - PT - PB

  const slotW = plotW / labels.length
  const bw = Math.min(22, (slotW * 0.72) / seriesCount)
  const groupW = bw * seriesCount + (seriesCount - 1) * 3

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {seriesCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 11, color: dark ? '#E2E8F0' : '#475569', marginBottom: 6 }}>
          {data.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[idx % colors.length] }} />
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
          {[0, 0.5, 1].map(t => {
            const y = PT + plotH * (1 - t)
            const tickVal = Math.round(max * t)
            const tickLabel = tickVal >= 1000 ? `${(tickVal / 1000).toFixed(1)}k` : String(tickVal)
            return (
              <g key={t}>
                <line x1={PL} x2={W - PR} y1={y} y2={y} stroke={dark ? '#1E293B' : '#E2E8F0'} strokeWidth={1} strokeDasharray="3 3" />
                <text x={PL - 6} y={y + 3} textAnchor="end" fontSize="9" fill={dark ? '#CBD5E1' : '#64748B'}>{tickLabel}</text>
              </g>
            )
          })}

          {labels.map((lbl, i) => {
            const cx = PL + slotW * i + slotW / 2
            const x0 = cx - groupW / 2
            return (
              <g key={i}>
                {data.map((s, sIdx) => {
                  const val = Number(s.values[i]) || 0
                  const h = Math.max(0, (val / max) * plotH)
                  const x = x0 + sIdx * (bw + 3)
                  const y = PT + plotH - h
                  const barColor = colors[sIdx % colors.length] || '#818CF8'
                  return (
                    <g key={sIdx}>
                      <rect x={x} y={y} width={bw} height={h} rx={2} fill={barColor} />
                      {showValueLabels && val > 0 && (
                        <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="9" fontWeight={700} fill={dark ? '#F8FAFC' : '#0F172A'}>
                          {val}
                        </text>
                      )}
                    </g>
                  )
                })}
                <text x={cx} y={H - 6} textAnchor="middle" fontSize="9.5" fill={dark ? '#E2E8F0' : '#475569'}>{lbl}</text>
              </g>
            )
          })}
        </svg>
      </div>

      {costSubtitle && (
        <div style={{ fontSize: 11, color: dark ? '#CBD5E1' : '#64748B', textAlign: 'center', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {costSubtitle}
        </div>
      )}
    </div>
  )
}

function SvgFunnel({ el, dark = true }: { el: Extract<El, { t: 'funnel' }>; dark?: boolean }) {
  const { impressions, clicks, results, conversions, ctr, clickToResultRate, resultLabel, roas, costPerResult } = el

  const W = 1160
  const H = 485
  const topH = 100
  const waveW = W - 40
  const waveH = H - topH - 40

  const stages = [
    { label: 'IMPRESSÕES', val: compact(impressions), sub: 'Pessoas impactadas' },
    { label: 'CLIQUES NO LINK', val: compact(clicks), sub: `${ctr}% CTR` },
    { label: resultLabel.toUpperCase(), val: compact(results), sub: costPerResult ? `Custo: ${costPerResult}` : 'Resultados' },
    { label: 'CONVERSÕES', val: compact(conversions), sub: 'Vendas / Contatos' },
  ]

  const vals = [impressions || 1, clicks || 1, results || 1, conversions || 1]
  const minWh = 35
  const maxWh = waveH - 40
  const waveHeights = vals.map(v => minWh + (maxWh - minWh) * Math.pow(Math.max(0, v / (impressions || 1)), 0.36))
  const ys = waveHeights.map(hi => waveH - hi)

  const xs = [0, waveW * 0.28, waveW * 0.58, waveW * 0.85, waveW]
  const mxs = [waveW * 0.14, waveW * 0.43, waveW * 0.71, waveW * 0.92]

  const wavePath = `
    M 0 ${ys[0]}
    C ${mxs[0]} ${ys[0]}, ${mxs[0]} ${ys[1]}, ${xs[1]} ${ys[1]}
    C ${mxs[1]} ${ys[1]}, ${mxs[1]} ${ys[2]}, ${xs[2]} ${ys[2]}
    C ${mxs[2]} ${ys[2]}, ${mxs[2]} ${ys[3]}, ${xs[3]} ${ys[3]}
    L ${waveW} ${ys[3]} L ${waveW} ${waveH} L 0 ${waveH} Z`

  return (
    <div style={{ position: 'relative', width: W, height: H, background: dark ? '#0F172A' : '#FFFFFF', border: `1.5px solid ${dark ? '#1E293B' : '#E2E8F0'}`, borderRadius: 16, overflow: 'hidden', padding: 20, boxSizing: 'border-box', boxShadow: dark ? undefined : '0 4px 16px rgba(0,0,0,0.05)' }}>
      {/* Top KPI Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: topH - 20, borderBottom: `1px solid ${dark ? '#1E293B' : '#E2E8F0'}`, paddingBottom: 15 }}>
        <div style={{ display: 'flex', flex: 1, gap: 15 }}>
          {stages.map((stg, i) => (
            <div key={i} style={{ flex: 1, position: 'relative' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: i === 2 ? '#22C55E' : (dark ? '#64748B' : '#64748B') }}>
                {stg.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: i === 2 ? '#22C55E' : (dark ? '#F8FAFC' : '#0F172A'), lineHeight: 1.15, marginTop: 4 }}>
                {stg.val}
              </div>
              <div style={{ fontSize: 11, color: dark ? '#94A3B8' : '#64748B', marginTop: 4 }}>
                {stg.sub}
              </div>
              {i < 3 && <div style={{ position: 'absolute', right: -7, top: 8, bottom: 8, width: 1, background: dark ? '#1E293B' : '#E2E8F0' }} />}
            </div>
          ))}
        </div>

        {/* ROAS Badge */}
        <div style={{ width: 140, background: dark ? '#131927' : '#F8FAFC', border: `1px solid ${dark ? '#1E293B' : '#E2E8F0'}`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B' }}>RETORNO GERAL</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: dark ? '#FFFFFF' : '#0F172A', marginTop: 2 }}>{roas ? `${roas}x` : '0,0%'}</div>
        </div>
      </div>

      {/* Wave Graphic */}
      <div style={{ position: 'relative', width: waveW, height: waveH, marginTop: 15, background: dark ? '#131927' : '#F8FAFC', borderRadius: 12, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${waveW} ${waveH}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="funnelWaveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818CF8" stopOpacity={dark ? 0.55 : 0.45} />
              <stop offset="60%" stopColor="#4F46E5" stopOpacity={dark ? 0.30 : 0.22} />
              <stop offset="100%" stopColor={dark ? '#1E1B4B' : '#EEF2FF'} stopOpacity={dark ? 0.10 : 0.05} />
            </linearGradient>
          </defs>

          {[xs[1], xs[2], xs[3]].map((x, idx) => (
            <line key={idx} x1={x} x2={x} y1={0} y2={waveH} stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'} strokeWidth={1.5} strokeDasharray="4 4" />
          ))}

          <path d={wavePath} fill="url(#funnelWaveGrad)" />
        </svg>

        {/* Drop-off Conversion rate pill tags */}
        <div style={{ position: 'absolute', left: xs[1] - 65, top: ys[1] - 20, background: dark ? '#0F172A' : '#FFFFFF', border: '1.5px solid #6366F1', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#6366F1', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 5 }}>
          {ctr}% CTR
        </div>

        <div style={{ position: 'absolute', left: xs[2] - 75, top: ys[2] - 20, background: dark ? '#0F172A' : '#FFFFFF', border: '1.5px solid #22C55E', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#16A34A', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 5 }}>
          {clickToResultRate}% {resultLabel}
        </div>

        <div style={{ position: 'absolute', left: xs[3] - 60, top: ys[3] - 20, background: dark ? '#0F172A' : '#FFFFFF', border: '1.5px solid #F59E0B', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#D97706', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 5 }}>
          0,0% Venda
        </div>
      </div>
    </div>
  )
}

function EditableTextElement({
  el,
  pos,
  onEdit,
}: {
  el: Extract<El, { t: 'text' }>
  pos: React.CSSProperties
  onEdit: (key: NonNullable<Extract<El, { t: 'text' }>['edit']>, val: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const key = el.edit!

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...pos,
        position: 'absolute',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <textarea
        ref={textareaRef}
        aria-label={el.placeholder ?? 'Texto'}
        value={el.text}
        placeholder={el.placeholder}
        onChange={e => onEdit(key, e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellCheck
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          boxSizing: 'border-box',
          margin: 0,
          padding: '6px 28px 6px 6px',
          background: focused ? 'rgba(99, 102, 241, 0.08)' : hovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
          border: focused ? '1px dashed rgba(99, 102, 241, 0.7)' : hovered ? '1px dashed rgba(148, 163, 184, 0.35)' : '1px dashed transparent',
          borderRadius: 8,
          outline: 'none',
          resize: 'none',
          overflow: 'auto',
          fontFamily: `${FONT}, system-ui, sans-serif`,
          fontSize: el.size,
          fontWeight: el.weight ?? 400,
          color: el.color,
          lineHeight: el.lineHeight ?? 1.45,
          textAlign: el.align ?? 'left',
          transition: 'all 0.15s ease',
        }}
      />

      {/* Botão de Lápis vetor cinza profissional (conforme referência visual) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          textareaRef.current?.focus()
          textareaRef.current?.select()
        }}
        title="Clique para editar este texto"
        aria-label="Editar texto"
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 6,
          background: focused ? 'rgba(99, 102, 241, 0.25)' : hovered ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.1)',
          border: `1px solid ${focused ? 'rgba(129, 140, 248, 0.6)' : hovered ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.22)'}`,
          color: focused ? '#818CF8' : hovered ? '#FFFFFF' : '#94A3B8',
          cursor: 'pointer',
          padding: 0,
          transition: 'all 0.15s ease',
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    </div>
  )
}

/** Uma linha de texto/forma do slide. Com `onEdit`, os textos da equipe viram campos editáveis. */
function Element({
  el,
  onEdit,
  dark = true,
}: {
  el: El
  onEdit?: (key: NonNullable<Extract<El, { t: 'text' }>['edit']>, value: string) => void
  dark?: boolean
}) {
  const pos = { position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h } as const
  if (el.t === 'box') {
    const boxContent = (
      <div style={{ ...pos, background: el.fill, border: el.line ? `1.5px solid ${el.line}` : undefined, borderRadius: el.radius, boxSizing: 'border-box', cursor: el.url ? 'pointer' : undefined }} />
    )
    return el.url ? (
      <a href={el.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        {boxContent}
      </a>
    ) : boxContent
  }
  if (el.t === 'img') {
    const isLogo = (el.w <= 200 && el.h <= 100) || el.radius != null
    const imgContent = el.src ? (
      <img
        src={el.src}
        alt=""
        style={{
          ...pos,
          objectFit: isLogo ? 'contain' : 'cover',
          borderRadius: el.radius ?? 12,
          border: isLogo ? `1.5px solid ${dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'}` : undefined,
          background: isLogo ? (dark ? 'rgba(255,255,255,0.05)' : '#FFFFFF') : undefined,
          padding: isLogo ? 6 : undefined,
          boxSizing: 'border-box',
          cursor: el.url ? 'pointer' : undefined,
        }}
      />
    ) : (
      <div style={{ ...pos, background: dark ? '#1E293B' : '#E2E8F0', borderRadius: el.radius ?? 12 }} />
    )
    return el.url ? (
      <a href={el.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        {imgContent}
      </a>
    ) : imgContent
  }
  if (el.t === 'chart') {
    return (
      <div style={{ ...pos, background: dark ? '#0F172A' : '#FFFFFF', borderRadius: 16, border: `1.5px solid ${dark ? '#1E293B' : '#E2E8F0'}`, padding: '16px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.2)' : '0 4px 16px rgba(0,0,0,0.06)' }}>
        {el.title && <div style={{ fontSize: 15, fontWeight: 700, color: dark ? '#F8FAFC' : '#0F172A', marginBottom: 8, fontFamily: `${FONT}, sans-serif` }}>{el.title}</div>}
        <div style={{ flex: 1, minHeight: 0 }}>
          {el.chartType === 'doughnut' ? (
            <SvgDoughnut el={el} dark={dark} />
          ) : el.chartType === 'bar' ? (
            <SvgBarChart el={el} dark={dark} />
          ) : (
            <SvgChart el={el} dark={dark} />
          )}
        </div>
      </div>
    )
  }
  if (el.t === 'funnel') {
    return <div style={pos}><SvgFunnel el={el} dark={dark} /></div>
  }
  if (el.t === 'table') {
    return (
      <div style={{ ...pos, background: dark ? '#0F172A' : '#FFFFFF', borderRadius: 14, border: `1.5px solid ${dark ? '#1E293B' : '#E2E8F0'}`, overflow: 'hidden', boxSizing: 'border-box', boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.2)' : '0 4px 16px rgba(0,0,0,0.06)' }}>
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: `${FONT}, system-ui, sans-serif` }}>
          <thead>
            <tr style={{ background: PALETTE.violet, color: '#FFFFFF', height: 46 }}>
              {el.headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    width: el.colWidths[i] ? `${(el.colWidths[i] / el.w) * 100}%` : 'auto',
                    textAlign: i === 0 ? 'left' : 'center',
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {el.rows.map((row, rIdx) => (
              <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? (dark ? '#0F172A' : '#FFFFFF') : (dark ? '#131927' : '#F8FAFC'), borderBottom: `1px solid ${dark ? '#1E293B' : '#E2E8F0'}` }}>
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    style={{
                      padding: '12px 16px',
                      fontSize: 12,
                      fontWeight: cell.bold ? 700 : 400,
                      color: cell.color ?? (dark ? '#F8FAFC' : '#0F172A'),
                      textAlign: cell.align ?? 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  const text: React.CSSProperties = {
    ...pos, fontFamily: `${FONT}, system-ui, sans-serif`, fontSize: el.size, fontWeight: el.weight ?? 400, color: el.color, textAlign: el.align ?? 'left',
    lineHeight: el.lineHeight ?? 1.2, whiteSpace: 'pre-wrap', overflow: 'visible', margin: 0,
    display: 'flex', alignItems: el.valign === 'middle' ? 'center' : 'flex-start', justifyContent: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
  }
  if (el.url) {
    return (
      <a href={el.url} target="_blank" rel="noreferrer" style={{ ...text, textDecoration: 'none', cursor: 'pointer' }}>
        <span style={{ width: '100%' }}>{el.text}</span>
      </a>
    )
  }
  if (el.edit && onEdit) {
    return <EditableTextElement el={el} pos={pos} onEdit={onEdit} />
  }
  return <div style={text}><span style={{ width: '100%' }}>{el.text}</span></div>
}

export function Slide({
  spec,
  scale,
  onEdit,
}: {
  spec: SlideSpec
  scale: number
  onEdit?: Parameters<typeof Element>[0]['onEdit']
}) {
  const isDark = spec.dark !== false
  return (
    <div style={{ width: STAGE.w * scale, height: STAGE.h * scale, position: 'relative', overflow: 'hidden', borderRadius: scale < 0.5 ? 4 : 8, flexShrink: 0 }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: isDark ? PALETTE.dark : '#FFFFFF', overflow: 'hidden', transition: 'background-color 0.2s ease, opacity 0.2s ease' }}>
        {spec.els.map((el, i) => <Element key={i} el={el} onEdit={onEdit} dark={isDark} />)}
      </div>
    </div>
  )
}

export function ReportStudio({
  onClose,
  initialPreset = 'last_month',
  initialMode = 'standard',
  savedReport = null,
  onSaveSuccess,
  readOnly = false,
}: {
  onClose: () => void
  initialPreset?: ReportPreset
  initialMode?: ReportMode
  savedReport?: SavedReport | null
  onSaveSuccess?: () => void
  readOnly?: boolean
}) {
  const [preset, setPreset] = useState<ReportPreset>(savedReport?.preset ?? initialPreset)
  const [mode, setMode] = useState<ReportMode>(savedReport?.mode ?? initialMode)
  const [reportTheme, setReportTheme] = useState<'light' | 'dark'>(() => {
    if (savedReport) return savedReport.theme
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('report_theme')
      if (stored === 'light' || stored === 'dark') return stored
    }
    return 'light'
  })
  const [formatMenuOpen, setFormatMenuOpen] = useState(false)
  const formatMenuRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<Phase>(() => {
    if (savedReport) {
      return {
        kind: 'ready',
        data: {
          ...savedReport.snapshot.data,
          draftAnalysis: savedReport.snapshot.notes.analysis || '',
        },
      }
    }
    return { kind: 'loading', text: 'Carregando o relatório…' }
  })
  const [notes, setNotes] = useState<ReportNotes | null>(() => savedReport?.snapshot.notes ?? null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState(0)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [exporting, setExporting] = useState<null | 'pptx' | 'pdf'>(null)
  const [scale, setScale] = useState(0.6)
  const stageBox = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // Modo Apresentação Dinâmica & Desenho
  const [drawingOpen, setDrawingOpen] = useState(false)
  const [drawTool, setDrawTool] = useState<DrawTool>('pen')
  const [drawColor, setDrawColor] = useState<string>('#EF4444')
  const [drawWidth, setDrawWidth] = useState<number>(6)
  const [laserActive, setLaserActive] = useState<boolean>(false)
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const [drawingsBySlide, setDrawingsBySlide] = useState<Record<string, DrawStroke[]>>({})
  const currentStrokeRef = useRef<DrawStroke | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Modo Apresentador com Próximo Slide e Carrossel
  const [presenterMode, setPresenterMode] = useState(false)
  const [presentationTime, setPresentationTime] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  // Cores de alto contraste garantido para containers escuros / claros
  const isDark = reportTheme === 'dark'
  const dockBg = isDark ? '#0F172A' : '#FFFFFF'
  const dockBorder = isDark ? '#1E293B' : '#E2E8F0'
  const dockText1 = isDark ? '#FFFFFF' : '#0F172A'
  const dockText2 = isDark ? '#CBD5E1' : '#475569'
  const dockText3 = isDark ? '#94A3B8' : '#64748B'

  // Dropdown de Download Unificado
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const downloadMenuRef = useRef<HTMLDivElement>(null)

  // Opções de Texto para Anotações
  const [textFont, setTextFont] = useState<'sans' | 'display' | 'serif' | 'mono'>('sans')
  const [textSize, setTextSize] = useState<number>(26)
  const [activeTextInput, setActiveTextInput] = useState<{ x: number; y: number; text: string } | null>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  // Foca o campo de texto ao abrir em nova posição (sem .select() para permitir digitação natural contínua)
  useEffect(() => {
    if (activeTextInput && textInputRef.current) {
      textInputRef.current.focus()
    }
  }, [activeTextInput?.x, activeTextInput?.y])

  // Rola suavemente o carrossel inferior do apresentador para centralizar o slide ativo
  useEffect(() => {
    if (!presenterMode) return
    const el = document.getElementById(`presenter-thumb-${current}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [current, presenterMode])

  // Cronômetro da Apresentação
  useEffect(() => {
    if (!presenterMode) {
      setPresentationTime(0)
      return
    }
    const timer = setInterval(() => setPresentationTime(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [presenterMode])

  const formatPresentationTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Fecha dropdown de download ao clicar fora
  useEffect(() => {
    if (!downloadMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setDownloadMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [downloadMenuOpen])

  // Salvar versão permanente no Report Studio
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [savingLibrary, setSavingLibrary] = useState(false)
  const [librarySaved, setLibrarySaved] = useState(false)

  const toggleReportTheme = () => {
    setReportTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') localStorage.setItem('report_theme', next)
      return next
    })
  }

  const load = useCallback(async (opts: { prepare?: boolean; targetPreset?: ReportPreset } = {}) => {
    if (savedReport) return
    const p = opts.targetPreset ?? preset
    let prepared = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await apiFetch(`/api/report/monthly?preset=${p}`, { cache: 'no-store' }).catch(() => null)
      const j = r ? await r.json().catch(() => ({})) as Loaded & { error?: string } : null
      if (!r || !r.ok || !j) { setPhase({ kind: 'error', text: j?.error ?? 'Não foi possível carregar o relatório. Tente de novo.' }); return }
      if (needsPrepare(j) && (opts.prepare ?? true) && !prepared) {
        prepared = true
        setPhase({ kind: 'loading', text: `Buscando os números de ${j.month.label} na Meta…` })
        const prep = await apiFetch('/api/report/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare', preset: p }) }).catch(() => null)
        const pj = prep ? await prep.json().catch(() => ({})) as { prepared?: boolean; reason?: string; error?: string; ads?: { reason?: string }; organic?: { reason?: string } } : null
        if (prep && !prep.ok && pj?.error) { setPhase({ kind: 'error', text: pj.error }); return }
        if (pj && pj.reason === 'cooldown') { /* já buscou agora há pouco: segue com o que tem */ }
        continue
      }
      setNotes({ ...j.notes, analysis: j.notes.analysis || j.draftAnalysis })
      setPhase({ kind: 'ready', data: j })
      return
    }
  }, [preset, savedReport])

  useEffect(() => { load() }, [load])

  const data = phase.kind === 'ready' ? phase.data : null
  const slides = useMemo(() => (data && notes ? buildSlides(data, notes, mode, reportTheme) : []), [data, notes, mode, reportTheme])
  const included = slides.filter(s => !hidden.has(s.id))
  const active = slides[Math.min(current, Math.max(0, slides.length - 1))]

  // Contagem dinâmica e precisa de slides por formato
  const modeCounts = useMemo(() => {
    if (!data || !notes) return { standard: 9, advanced: 11, organic: 10 }
    return {
      standard: buildSlides(data, notes, 'standard', reportTheme).length,
      advanced: buildSlides(data, notes, 'advanced', reportTheme).length,
      organic: buildSlides(data, notes, 'organic', reportTheme).length,
    }
  }, [data, notes, reportTheme])

  // Desfazer traço do slide atual
  const handleUndo = useCallback(() => {
    if (!active) return
    setDrawingsBySlide(prev => {
      const list = prev[active.id] || []
      if (list.length === 0) return prev
      return {
        ...prev,
        [active.id]: list.slice(0, list.length - 1),
      }
    })
  }, [active])

  // Limpar traços do slide atual
  const handleClear = useCallback(() => {
    if (!active) return
    setDrawingsBySlide(prev => ({
      ...prev,
      [active.id]: [],
    }))
  }, [active])

  // Salva o texto digitado nas anotações do slide
  const commitTextInput = useCallback((customText?: string) => {
    setActiveTextInput(prev => {
      if (!prev || !active) return null
      const txt = (customText !== undefined ? customText : prev.text).trim()
      if (txt) {
        const textStroke: DrawStroke = {
          tool: 'text',
          color: drawColor,
          width: 2,
          points: [{ x: prev.x, y: prev.y }],
          text: txt,
          fontSize: textSize,
          fontFamily: textFont,
        }
        setDrawingsBySlide(ds => ({
          ...ds,
          [active.id]: [...(ds[active.id] || []), textStroke],
        }))
      }
      return null
    })
  }, [active, drawColor, textSize, textFont])

  // Redesenha todos os traços no canvas do slide
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, STAGE.w, STAGE.h)

    const slideStrokes = drawingsBySlide[active.id] || []
    const allStrokes = currentStrokeRef.current
      ? [...slideStrokes, currentStrokeRef.current]
      : slideStrokes

    for (const s of allStrokes) {
      if (!s.points || s.points.length === 0) continue
      ctx.save()
      ctx.strokeStyle = s.color
      ctx.fillStyle = s.color
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (s.tool === 'highlighter') {
        ctx.globalAlpha = 0.35
        ctx.lineWidth = s.width * 3.5
      } else {
        ctx.globalAlpha = 1.0
        ctx.lineWidth = s.width
      }

      if (s.tool === 'pen' || s.tool === 'highlighter') {
        if (s.points.length === 1) {
          ctx.beginPath()
          ctx.arc(s.points[0].x, s.points[0].y, s.tool === 'highlighter' ? s.width * 1.5 : s.width / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(s.points[0].x, s.points[0].y)
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x, s.points[i].y)
          }
          ctx.stroke()
        }
      } else if (s.tool === 'rect') {
        if (s.points.length >= 2) {
          const p0 = s.points[0]
          const p1 = s.points[1]
          ctx.beginPath()
          ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y)
        }
      } else if (s.tool === 'circle') {
        if (s.points.length >= 2) {
          const p0 = s.points[0]
          const p1 = s.points[1]
          const cx = (p0.x + p1.x) / 2
          const cy = (p0.y + p1.y) / 2
          const rx = Math.abs(p1.x - p0.x) / 2
          const ry = Math.abs(p1.y - p0.y) / 2
          ctx.beginPath()
          ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      } else if (s.tool === 'arrow') {
        if (s.points.length >= 2) {
          const p0 = s.points[0]
          const p1 = s.points[1]
          const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x)
          const headLen = Math.max(16, s.width * 2.8)
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p1.x - headLen * Math.cos(angle - Math.PI / 6), p1.y - headLen * Math.sin(angle - Math.PI / 6))
          ctx.lineTo(p1.x - headLen * Math.cos(angle + Math.PI / 6), p1.y - headLen * Math.sin(angle + Math.PI / 6))
          ctx.closePath()
          ctx.fill()
        }
      } else if (s.tool === 'text' && s.text) {
        const fontFam = s.fontFamily === 'serif' ? 'Georgia, "Playfair Display", serif' : s.fontFamily === 'mono' ? '"JetBrains Mono", monospace' : s.fontFamily === 'display' ? '"Outfit", "Arial Black", sans-serif' : `${FONT}, Inter, sans-serif`
        ctx.font = `700 ${s.fontSize || 26}px ${fontFam}`
        ctx.fillStyle = s.color
        ctx.textBaseline = 'top'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)'
        ctx.shadowBlur = 5
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1
        ctx.fillText(s.text, s.points[0].x, s.points[0].y)
        ctx.shadowColor = 'transparent'
      }
      ctx.restore()
    }
  }, [active, drawingsBySlide])

  useEffect(() => {
    redrawCanvas()
  }, [redrawCanvas, current])

  // Converte coordenadas do clique para o espaço nativo 1280x720
  const getVirtualPoint = (e: React.MouseEvent<HTMLCanvasElement>): DrawPoint => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * STAGE.w
    const y = ((e.clientY - rect.top) / rect.height) * STAGE.h
    return { x: Math.round(x), y: Math.round(y) }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getVirtualPoint(e)
    setIsMouseDown(true)
    if (laserActive || drawTool === 'laser') {
      setLaserPos(pt)
    }
    if (!drawingOpen || drawTool === 'pointer' || drawTool === 'laser') {
      return
    }
    if (drawTool === 'text') {
      e.preventDefault()
      e.stopPropagation()
      if (activeTextInput && activeTextInput.text.trim()) {
        commitTextInput()
      }
      setActiveTextInput({ x: pt.x, y: pt.y, text: '' })
      return
    }
    currentStrokeRef.current = {
      tool: drawTool,
      color: drawColor,
      width: drawWidth,
      points: [pt],
    }
    redrawCanvas()
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getVirtualPoint(e)
    if (laserActive || drawTool === 'laser') {
      setLaserPos(pt)
    }

    if (!isMouseDown || !currentStrokeRef.current) return

    if (drawTool === 'pen' || drawTool === 'highlighter') {
      currentStrokeRef.current.points.push(pt)
    } else if (drawTool === 'rect' || drawTool === 'circle' || drawTool === 'arrow') {
      currentStrokeRef.current.points[1] = pt
    }
    redrawCanvas()
  }

  const handleCanvasMouseUp = () => {
    setIsMouseDown(false)
    if (currentStrokeRef.current && active) {
      const finishedStroke = currentStrokeRef.current
      currentStrokeRef.current = null
      const minPoints = (finishedStroke.tool === 'pen' || finishedStroke.tool === 'highlighter') ? 1 : 2
      if (finishedStroke.points.length >= minPoints) {
        setDrawingsBySlide(prev => ({
          ...prev,
          [active.id]: [...(prev[active.id] || []), finishedStroke],
        }))
      }
    }
    redrawCanvas()
  }

  const handleCanvasMouseLeave = () => {
    setIsMouseDown(false)
    if (currentStrokeRef.current && active) {
      const finishedStroke = currentStrokeRef.current
      currentStrokeRef.current = null
      const minPoints = (finishedStroke.tool === 'pen' || finishedStroke.tool === 'highlighter') ? 1 : 2
      if (finishedStroke.points.length >= minPoints) {
        setDrawingsBySlide(prev => ({
          ...prev,
          [active.id]: [...(prev[active.id] || []), finishedStroke],
        }))
      }
    }
    setLaserPos(null)
    redrawCanvas()
  }

  // Teclado: Escape fecha, Setas passam slides, D toggle drawing, L toggle laser, Ctrl+Z undo
  // Teclado: Escape fecha, Setas passam slides, D toggle drawing, L toggle laser, P toggle presenter, Ctrl+Z undo
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (presenterMode) {
          setPresenterMode(false)
          return
        }
        onClose()
        return
      }
      const activeEl = document.activeElement
      const tag = activeEl?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (activeEl as HTMLElement)?.isContentEditable) {
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        handleUndo()
        return
      }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        setLaserActive(v => !v)
        return
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        setDrawingOpen(v => !v)
        return
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setPresenterMode(v => !v)
        return
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        setDrawTool('text')
        setDrawingOpen(true)
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCurrent(curr => Math.min(slides.length - 1, curr + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrent(curr => Math.max(0, curr - 1))
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [slides.length, onClose, handleUndo, presenterMode])

  // Fecha dropdown de formatos ao clicar fora
  useEffect(() => {
    if (!formatMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (formatMenuRef.current && !formatMenuRef.current.contains(e.target as Node)) {
        setFormatMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [formatMenuOpen])

  // ajusta o palco à largura disponível
  useEffect(() => {
    const el = stageBox.current
    if (!el) return
    const fit = () => {
      const extraW = drawingOpen ? 104 : 36
      const extraH = presenterMode ? 190 : 48
      setScale(Math.max(0.3, Math.min(1, (el.clientWidth - extraW) / STAGE.w, (el.clientHeight - extraH) / STAGE.h)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase.kind, drawingOpen, presenterMode])

  const save = useCallback(async (n: ReportNotes, p = preset) => {
    if (readOnly || savedReport) return
    setSaved('saving')
    const r = await apiFetch('/api/report/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', notes: n, preset: p }) }).catch(() => null)
    dirty.current = false
    setSaved(r?.ok ? 'saved' : 'error')
  }, [preset, readOnly, savedReport])

  const edit = useCallback((key: keyof ReportNotes, value: string) => {
    if (readOnly) return
    setNotes(prev => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      dirty.current = true; setSaved('idle')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => save(next), 1200)
      return next
    })
  }, [save, readOnly])

  const switchPreset = useCallback((next: ReportPreset) => {
    if (savedReport || next === preset) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (dirty.current && notes) void save(notes, preset)
    setPreset(next)
    setPhase({ kind: 'loading', text: next === 'last_7d' ? 'Carregando relatório dos últimos 7 dias…' : 'Carregando relatório do último mês…' })
    void load({ targetPreset: next, prepare: true })
  }, [preset, notes, save, load, savedReport])

  // não perde o texto se fechar logo depois de editar
  const close = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (dirty.current && notes && !readOnly && !savedReport) void save(notes)
    onClose()
  }, [notes, onClose, save, readOnly, savedReport])

  const handleSaveToLibrary = async () => {
    if (!data || !notes) return
    setSavingLibrary(true)
    try {
      const titleToSave = (saveTitle || savedReport?.title || `Relatório · ${data.month.label}`).trim()
      const res = await apiFetch('/api/report/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: savedReport?.id,
          title: titleToSave,
          preset,
          periodKey: data.month.key,
          periodLabel: data.month.label,
          mode,
          theme: reportTheme,
          slidesCount: included.length,
          snapshot: { data, notes },
        }),
      })
      if (res.ok) {
        setLibrarySaved(true)
        setSaveModalOpen(false)
        onSaveSuccess?.()
        setTimeout(() => setLibrarySaved(false), 3000)
      }
    } finally {
      setSavingLibrary(false)
    }
  }

  const fileName = data
    ? `Relatorio-${mode === 'advanced' ? 'Avancado-' : ''}${data.month.key}-${data.client.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`
    : 'Relatorio'

  async function exportPptx() {
    if (!included.length) return
    setExporting('pptx')
    try { const { downloadPptx } = await import('@/lib/reportPptx'); await downloadPptx(included, fileName) } finally { setExporting(null) }
  }
  function exportPdf() {
    if (!included.length) return
    setExporting('pdf')
    const title = document.title
    document.title = fileName
    document.body.classList.add('printing-report')
    const done = () => { document.body.classList.remove('printing-report'); document.title = title; setExporting(null); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    setTimeout(() => window.print(), 250) // deixa as imagens do modo impressão carregarem
  }

  const ui = (
    <div role="dialog" aria-modal="true" aria-label="Relatório mensal" className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg, #F7F8FA)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes laserGlow {
          0% { transform: scale(0.95); opacity: 0.85; }
          100% { transform: scale(1.18); opacity: 1; }
        }
        @keyframes laserRipple {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{savedReport ? savedReport.title : (data ? (preset === 'last_7d' ? 'Relatório semanal' : 'Relatório mensal') : 'Relatório')}</span>
              {savedReport && (
                <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
                  Arquivo Salvo
                </span>
              )}
            </div>
            {data && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.client.name} · {included.length} de {slides.length} slides · {data.month.label}</div>}
          </div>
          {!savedReport && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card2, rgba(0,0,0,0.06))', padding: '3px 4px', borderRadius: 20 }}>
              <button
                type="button"
                className={`btn btn-sm ${preset === 'last_month' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 28, padding: '0 12px', fontSize: 12, borderRadius: 16 }}
                onClick={() => switchPreset('last_month')}
                title="Relatório do mês anterior fechado"
              >
                Mês passado
              </button>
              <button
                type="button"
                className={`btn btn-sm ${preset === 'this_month' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 28, padding: '0 12px', fontSize: 12, borderRadius: 16 }}
                onClick={() => switchPreset('this_month')}
                title="Relatório do mês atual até o momento"
              >
                Este mês
              </button>
              <button
                type="button"
                className={`btn btn-sm ${preset === 'last_7d' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 28, padding: '0 12px', fontSize: 12, borderRadius: 16 }}
                onClick={() => switchPreset('last_7d')}
                title="Relatório dos últimos 7 dias"
              >
                Últimos 7 dias
              </button>
            </div>
          )}
        </div>

        {readOnly && (
          <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 20, padding: '4px 12px', fontWeight: 600, fontSize: 12 }}>
            Modo Apresentação
          </span>
        )}

        {!readOnly && !savedReport && data && <span aria-live="polite" style={{ fontSize: 12, color: saved === 'error' ? 'var(--red)' : 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {saved === 'saving' && <><Loader2 size={13} className="spin" /> Salvando…</>}{saved === 'saved' && <><Check size={13} /> Textos salvos</>}{saved === 'error' && 'Não foi possível salvar os textos'}
        </span>}

        {/* Dropdown de Formato ao lado de Baixar PDF com flecha para baixo */}
        {data && (
          <div ref={formatMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '0 14px' }}
              onClick={() => setFormatMenuOpen(o => !o)}
              aria-haspopup="true"
              aria-expanded={formatMenuOpen}
              title="Selecionar formato do relatório"
            >
              <span>
                {mode === 'standard' && `Padrão (${modeCounts.standard} slides)`}
                {mode === 'advanced' && `Avançado (${modeCounts.advanced} slides)`}
                {mode === 'organic' && `Orgânico (${modeCounts.organic} slides)`}
              </span>
              <ChevronDown size={14} style={{ transform: formatMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
            </button>
            {formatMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 230,
                  background: 'var(--bg-card, #FFFFFF)',
                  border: '1px solid var(--border, #E2E8F0)',
                  borderRadius: 14,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                  padding: 6,
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {[
                  { id: 'standard' as const, label: 'Padrão', count: modeCounts.standard, desc: 'Visão executiva com KPIs e criativos' },
                  { id: 'advanced' as const, label: 'Avançado', count: modeCounts.advanced, desc: 'Completo com público, plataformas e funil' },
                  { id: 'organic' as const, label: 'Orgânico', count: modeCounts.organic, desc: 'Exclusivo para engajamento e métricas orgânicas' },
                ].map(item => {
                  const isSel = mode === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMode(item.id)
                        setCurrent(0)
                        setFormatMenuOpen(false)
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderRadius: 10,
                        background: isSel ? 'var(--bg-card2, rgba(99,102,241,0.1))' : 'transparent',
                        border: isSel ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isSel ? PALETTE.violet : 'var(--text-1)' }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', background: 'var(--bg-card2, rgba(0,0,0,0.06))', padding: '2px 8px', borderRadius: 999 }}>
                          {item.count} slides
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {item.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Botão Salvar no Report Studio (visível para Staff) */}
        {!readOnly && data && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{
              borderRadius: 20,
              padding: '0 14px',
              borderColor: librarySaved ? 'var(--green)' : undefined,
              color: librarySaved ? 'var(--green)' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={() => {
              setSaveTitle(savedReport?.title || `Relatório · ${data.month.label}`)
              setSaveModalOpen(true)
            }}
            title="Salvar versão permanente na biblioteca do Report Studio"
          >
            {librarySaved ? <Check size={14} strokeWidth={2} /> : <Bookmark size={14} strokeWidth={1.75} />}
            <span>{librarySaved ? 'Salvo no Studio!' : savedReport ? 'Atualizar no Studio' : 'Salvar no Studio'}</span>
          </button>
        )}

        {/* Botão de Apresentar */}
        {data && (
          <button
            type="button"
            className={`btn btn-sm ${presenterMode ? 'btn-primary' : 'btn-outline'}`}
            style={{
              borderRadius: 20,
              padding: '0 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
            }}
            onClick={() => setPresenterMode(v => !v)}
            title="Iniciar apresentação em tela cheia com próximo slide e anotações (P)"
          >
            <Play size={14} strokeWidth={2} fill={presenterMode ? 'currentColor' : 'none'} />
            <span>{presenterMode ? 'Apresentando' : 'Apresentar'}</span>
          </button>
        )}

        {/* Botão Laser Pointer rápido */}
        {/* Botão de Download Único com Dropdown */}
        {data && (
          <div ref={downloadMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{
                borderRadius: 20,
                padding: '0 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
              }}
              onClick={() => setDownloadMenuOpen(o => !o)}
              aria-haspopup="true"
              aria-expanded={downloadMenuOpen}
              title="Baixar relatório em PDF ou PowerPoint"
              disabled={!!exporting}
            >
              {exporting ? (
                <>
                  <Loader2 size={14} className="spin" />
                  <span>{exporting === 'pdf' ? 'Gerando PDF…' : 'Gerando PPTX…'}</span>
                </>
              ) : (
                <>
                  <Download size={14} strokeWidth={1.75} />
                  <span>Baixar</span>
                  <ChevronDown size={14} style={{ transform: downloadMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                </>
              )}
            </button>
            {downloadMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 240,
                  background: 'var(--bg-card, #FFFFFF)',
                  border: '1px solid var(--border, #E2E8F0)',
                  borderRadius: 14,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.14)',
                  padding: 6,
                  zIndex: 60,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDownloadMenuOpen(false)
                    exportPdf()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2, rgba(99,102,241,0.08))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <FileText size={16} strokeWidth={1.8} style={{ color: PALETTE.violet }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Baixar em PDF</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Documento para envio rápido ou impressão</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDownloadMenuOpen(false)
                    void exportPptx()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card2, rgba(99,102,241,0.08))')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Download size={16} strokeWidth={1.8} style={{ color: PALETTE.violet }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Baixar PowerPoint (.pptx)</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Apresentação editável com slides</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Botão Modo Desenho */}
        {data && (
          <button
            type="button"
            className={`btn btn-sm ${drawingOpen ? 'btn-primary' : 'btn-outline'}`}
            style={{
              borderRadius: 20,
              padding: '0 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
            }}
            onClick={() => {
              setDrawingOpen(o => !o)
              if (!drawingOpen && drawTool === 'pointer') {
                setDrawTool('pen')
              }
            }}
            title="Ativar modo de anotações dinâmicas e formas geométricas (D)"
          >
            <Pencil size={14} strokeWidth={1.8} />
            <span>Modo Desenho</span>
          </button>
        )}

        {/* Botão de Alternar Light / Dark Mode nos Relatórios */}
        <button
          type="button"
          className="btn btn-outline btn-icon btn-sm"
          style={{ borderRadius: 20, width: 32, height: 32 }}
          onClick={toggleReportTheme}
          title={reportTheme === 'dark' ? 'Mudar relatório para Tema Claro' : 'Mudar relatório para Tema Escuro'}
          aria-label="Alternar tema do relatório"
        >
          {reportTheme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
        </button>

        <button className="btn btn-outline btn-icon btn-sm" style={{ borderRadius: 20, width: 32, height: 32 }} onClick={close} aria-label="Fechar">
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>

      {phase.kind === 'loading' && <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><PulseLoader size={56} caption={phase.text} /></div>}
      {phase.kind === 'error' && (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <p role="alert" style={{ fontSize: 14, color: 'var(--text-1)', margin: '0 0 14px' }}>{phase.text}</p>
            <button className="btn btn-outline btn-sm" onClick={() => { setPhase({ kind: 'loading', text: 'Carregando o relatório…' }); void load() }}><RefreshCw size={14} strokeWidth={1.75} /> Tentar de novo</button>
          </div>
        </div>
      )}

      {data && notes && active && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {!presenterMode && (
            <nav aria-label="Slides" style={{ width: 176, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
              {slides.map((s, i) => {
                const off = hidden.has(s.id)
                return (
                  <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button onClick={() => setCurrent(i)} aria-current={i === current} aria-label={`Slide ${i + 1}: ${s.label}`} style={{ padding: 0, border: `2px solid ${i === current ? PALETTE.violet : 'transparent'}`, borderRadius: 8, background: 'none', cursor: 'pointer', opacity: off ? 0.35 : 1 }}>
                      <Slide spec={s} scale={0.11} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
                      <span>{i + 1}. {s.label}</span>
                      <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 24, height: 24 }} onClick={() => setHidden(h => { const n = new Set(h); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} aria-label={off ? `Incluir ${s.label}` : `Ocultar ${s.label}`} title={off ? 'Incluir no relatório' : 'Ocultar do relatório'}>
                        {off ? <EyeOff size={13} strokeWidth={1.75} /> : <Eye size={13} strokeWidth={1.75} />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </nav>
          )}
          <div ref={stageBox} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, background: 'var(--muted-bg, rgba(127,127,160,.08))', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, maxWidth: '100%' }}>
              <div
                style={{
                  position: 'relative',
                  width: STAGE.w * scale,
                  height: STAGE.h * scale,
                  boxShadow: '0 8px 30px rgba(0,0,0,.18)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <Slide spec={active} scale={scale} onEdit={readOnly || (drawingOpen && drawTool !== 'pointer') ? undefined : edit} />

                {/* Canvas Overlay para Modo Desenho */}
                <canvas
                  ref={canvasRef}
                  width={STAGE.w}
                  height={STAGE.h}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseLeave}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: STAGE.w * scale,
                    height: STAGE.h * scale,
                    pointerEvents: (drawingOpen || laserActive || drawTool === 'laser' || drawTool === 'text') ? 'auto' : 'none',
                    cursor: (laserActive || drawTool === 'laser')
                      ? 'none'
                      : drawTool === 'text'
                        ? 'text'
                        : (drawingOpen && drawTool !== 'pointer')
                          ? 'crosshair'
                          : 'default',
                    zIndex: 35,
                  }}
                />

                {/* Input Direto no Slide para Digitação Natural */}
                {activeTextInput && (
                  <div
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: Math.max(4, Math.min(STAGE.w * scale - 180, activeTextInput.x * scale)),
                      top: Math.max(4, Math.min(STAGE.h * scale - 40, activeTextInput.y * scale)),
                      zIndex: 60,
                      pointerEvents: 'auto',
                    }}
                  >
                    <input
                      ref={textInputRef}
                      autoFocus
                      type="text"
                      value={activeTextInput.text}
                      onChange={e => {
                        const val = e.target.value
                        setActiveTextInput(prev => prev ? { ...prev, text: val } : null)
                      }}
                      onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitTextInput()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          setActiveTextInput(null)
                        }
                      }}
                      onBlur={() => {
                        commitTextInput()
                      }}
                      placeholder="Digite aqui…"
                      style={{
                        background: 'rgba(15, 23, 42, 0.55)',
                        backdropFilter: 'blur(4px)',
                        border: '1.5px dashed rgba(255, 255, 255, 0.45)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        color: drawColor || '#FFFFFF',
                        fontSize: Math.max(15, textSize * scale),
                        fontFamily: textFont === 'serif' ? 'Georgia, "Playfair Display", serif' : textFont === 'mono' ? '"JetBrains Mono", monospace' : textFont === 'display' ? '"Outfit", "Arial Black", sans-serif' : 'Inter, sans-serif',
                        fontWeight: 700,
                        outline: 'none',
                        minWidth: 140,
                        maxWidth: Math.max(200, STAGE.w * scale - (activeTextInput.x * scale) - 20),
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
                        textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
                      }}
                    />
                  </div>
                )}

                {/* Laser Pointer com Halo Brilhante e Pulso */}
                {(laserActive || drawTool === 'laser') && laserPos && (
                  <div
                    style={{
                      position: 'absolute',
                      left: laserPos.x * scale,
                      top: laserPos.y * scale,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none',
                      zIndex: 45,
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: isMouseDown ? 34 : 26,
                        height: isMouseDown ? 34 : 26,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(239,68,68,0.55) 0%, rgba(239,68,68,0.2) 65%, transparent 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'laserGlow 1.2s ease-in-out infinite alternate',
                        filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.9))',
                      }}
                    >
                      <div
                        style={{
                          width: isMouseDown ? 10 : 8,
                          height: isMouseDown ? 10 : 8,
                          borderRadius: '50%',
                          background: '#FFFFFF',
                          boxShadow: '0 0 6px 2px #EF4444',
                        }}
                      />
                      {isMouseDown && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: -6,
                            borderRadius: '50%',
                            border: '2px solid rgba(239,68,68,0.7)',
                            animation: 'laserRipple 0.8s ease-out infinite',
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Barra Lateral Direita de Ferramentas de Apresentação */}
              {drawingOpen && (
                <aside
                  aria-label="Ferramentas de Apresentação Dinâmica"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 8px',
                    background: dockBg,
                    border: `1.5px solid ${dockBorder}`,
                    borderRadius: 16,
                    boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 50,
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  {/* Laser Pointer */}
                  <button
                    type="button"
                    onClick={() => {
                      setLaserActive(l => !l)
                      if (!laserActive) setDrawTool('laser')
                    }}
                    title={laserActive ? 'Desativar Laser Pointer (L)' : 'Ativar Laser Pointer (L) - Mouse visível e brilhante para o cliente'}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: laserActive || drawTool === 'laser' ? 'rgba(239,68,68,0.2)' : 'transparent',
                      color: laserActive || drawTool === 'laser' ? '#EF4444' : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Sparkles size={17} strokeWidth={2} />
                    {laserActive && (
                      <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 6px #EF4444' }} />
                    )}
                  </button>

                  {/* Cursor Normal */}
                  <button
                    type="button"
                    onClick={() => setDrawTool('pointer')}
                    title="Cursor Normal (Navegar ou editar textos)"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: drawTool === 'pointer' ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: drawTool === 'pointer' ? PALETTE.violet : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <MousePointer size={17} strokeWidth={1.8} />
                  </button>

                  <div style={{ width: 24, height: 1, background: dockBorder, margin: '2px 0' }} />

                  {/* Caneta */}
                  <button
                    type="button"
                    onClick={() => setDrawTool('pen')}
                    title="Caneta Livre"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: drawTool === 'pen' ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: drawTool === 'pen' ? PALETTE.violet : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Pencil size={17} strokeWidth={1.8} />
                  </button>

                  {/* Marca-Texto */}
                  <button
                    type="button"
                    onClick={() => setDrawTool('highlighter')}
                    title="Marca-Texto Translúcido"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: drawTool === 'highlighter' ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: drawTool === 'highlighter' ? PALETTE.violet : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Highlighter size={17} strokeWidth={1.8} />
                  </button>

                  {/* Retângulo */}
                  <button
                    type="button"
                    onClick={() => setDrawTool('rect')}
                    title="Forma: Retângulo"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: drawTool === 'rect' ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: drawTool === 'rect' ? PALETTE.violet : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Square size={17} strokeWidth={1.8} />
                  </button>

                  {/* Círculo */}
                  <button
                    type="button"
                    onClick={() => setDrawTool('circle')}
                    title="Forma: Círculo / Elipse"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: drawTool === 'circle' ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: drawTool === 'circle' ? PALETTE.violet : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Circle size={17} strokeWidth={1.8} />
                  </button>

                  {/* Seta */}
                  <button
                    type="button"
                    onClick={() => setDrawTool('arrow')}
                    title="Forma: Seta Indicativa"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: drawTool === 'arrow' ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: drawTool === 'arrow' ? PALETTE.violet : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <ArrowUpRight size={18} strokeWidth={1.8} />
                  </button>

                  {/* Texto ("T") */}
                  <button
                    type="button"
                    onClick={() => setDrawTool('text')}
                    title="Digitar Texto no Slide (T)"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: drawTool === 'text' ? 'rgba(99,102,241,0.2)' : 'transparent',
                      color: drawTool === 'text' ? PALETTE.violet : dockText2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Type size={18} strokeWidth={2} />
                  </button>

                  {/* Configurações de Texto (Fonte e Tamanho) */}
                  {drawTool === 'text' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', padding: '2px 0' }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {TEXT_SIZES.map(s => (
                          <button
                            key={s.label}
                            type="button"
                            onClick={() => setTextSize(s.size)}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              border: 'none',
                              background: textSize === s.size ? PALETTE.violet : 'transparent',
                              color: textSize === s.size ? '#FFFFFF' : dockText2,
                              fontSize: 10,
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                            title={`Tamanho ${s.label} (${s.size}px)`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <select
                        value={textFont}
                        onChange={e => setTextFont(e.target.value as any)}
                        style={{
                          width: 58,
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 6,
                          background: isDark ? '#1E293B' : '#F1F5F9',
                          color: dockText1,
                          border: `1px solid ${dockBorder}`,
                          padding: '3px 4px',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                        title="Fonte do texto"
                      >
                        <option value="sans" style={{ background: isDark ? '#1E293B' : '#FFFFFF', color: dockText1 }}>Inter</option>
                        <option value="display" style={{ background: isDark ? '#1E293B' : '#FFFFFF', color: dockText1 }}>Outfit</option>
                        <option value="serif" style={{ background: isDark ? '#1E293B' : '#FFFFFF', color: dockText1 }}>Serif</option>
                        <option value="mono" style={{ background: isDark ? '#1E293B' : '#FFFFFF', color: dockText1 }}>Mono</option>
                      </select>
                    </div>
                  )}

                  <div style={{ width: 24, height: 1, background: dockBorder, margin: '2px 0' }} />

                  {/* Cores */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '2px 0' }}>
                    {DRAW_COLORS.map(c => {
                      const isSel = drawColor === c.value
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setDrawColor(c.value)}
                          title={c.label}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: c.value,
                            border: isSel ? '2px solid #6366F1' : `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
                            boxShadow: isSel ? `0 0 0 2px rgba(99,102,241,0.4)` : 'none',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'transform 0.12s ease',
                            transform: isSel ? 'scale(1.25)' : 'none',
                          }}
                        />
                      )
                    })}
                  </div>

                  <div style={{ width: 24, height: 1, background: dockBorder, margin: '2px 0' }} />

                  {/* Espessuras */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    {DRAW_WIDTHS.map(w => {
                      const isSel = drawWidth === w.value
                      return (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => setDrawWidth(w.value)}
                          title={`Traço ${w.label}`}
                          style={{
                            width: 28,
                            height: 20,
                            borderRadius: 6,
                            border: 'none',
                            background: isSel ? 'rgba(99,102,241,0.2)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              width: 14,
                              height: w.value === 3 ? 2 : w.value === 6 ? 4 : 7,
                              borderRadius: 999,
                              background: isSel ? PALETTE.violet : dockText3,
                            }}
                          />
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ width: 24, height: 1, background: dockBorder, margin: '2px 0' }} />

                  {/* Desfazer */}
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!active || !(drawingsBySlide[active.id]?.length)}
                    title="Desfazer (Ctrl+Z)"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      color: (active && drawingsBySlide[active.id]?.length) ? dockText1 : dockText3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: (active && drawingsBySlide[active.id]?.length) ? 'pointer' : 'not-allowed',
                      opacity: (active && drawingsBySlide[active.id]?.length) ? 1 : 0.4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Undo2 size={16} strokeWidth={1.8} />
                  </button>

                  {/* Limpar slide */}
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={!active || !(drawingsBySlide[active.id]?.length)}
                    title="Limpar anotações deste slide"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      color: (active && drawingsBySlide[active.id]?.length) ? '#EF4444' : dockText3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: (active && drawingsBySlide[active.id]?.length) ? 'pointer' : 'not-allowed',
                      opacity: (active && drawingsBySlide[active.id]?.length) ? 1 : 0.4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Trash2 size={16} strokeWidth={1.8} />
                  </button>
                </aside>
              )}
            </div>

            {/* Dock Inferior do Apresentador (Exibição do Próximo Slide, Navegação e Cronômetro) */}
            {presenterMode ? (
              <div
                style={{
                  width: '100%',
                  maxWidth: 1100,
                  background: dockBg,
                  border: `1.5px solid ${dockBorder}`,
                  borderRadius: 16,
                  padding: '10px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
                  marginTop: 6,
                  zIndex: 50,
                  userSelect: 'none',
                }}
              >
                {/* Barra Superior de Controles do Apresentador */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  {/* Navegação Anterior / Próximo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setCurrent(curr => Math.max(0, curr - 1))}
                      disabled={current === 0}
                      title="Slide Anterior (←)"
                      style={{
                        height: 32,
                        padding: '0 12px',
                        borderRadius: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: current === 0 ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        background: current === 0 ? 'rgba(255, 255, 255, 0.1)' : '#FFFFFF',
                        color: current === 0 ? 'rgba(255, 255, 255, 0.35)' : '#0F172A',
                        border: 'none',
                        boxShadow: current === 0 ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.25)',
                      }}
                    >
                      <ChevronLeft size={16} />
                      <span>Anterior</span>
                    </button>

                    <span style={{ fontSize: 13, fontWeight: 700, color: dockText1, minWidth: 90, textAlign: 'center' }}>
                      Slide {current + 1} de {slides.length}
                    </span>

                    <button
                      type="button"
                      onClick={() => setCurrent(curr => Math.min(slides.length - 1, curr + 1))}
                      disabled={current === slides.length - 1}
                      title="Próximo Slide (→)"
                      style={{
                        height: 32,
                        padding: '0 14px',
                        borderRadius: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: current === slides.length - 1 ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        background: current === slides.length - 1 ? 'rgba(99, 102, 241, 0.2)' : (PALETTE.violet || '#6366F1'),
                        color: current === slides.length - 1 ? 'rgba(255, 255, 255, 0.4)' : '#FFFFFF',
                        border: 'none',
                        boxShadow: current === slides.length - 1 ? 'none' : '0 2px 10px rgba(99, 102, 241, 0.4)',
                      }}
                    >
                      <span>Próximo</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Cronômetro da Apresentação */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: dockText2, fontSize: 13, fontWeight: 600 }}>
                    <Clock size={15} style={{ color: PALETTE.violet }} />
                    <span>{formatPresentationTime(presentationTime)}</span>
                  </div>

                  {/* Sair do Modo Apresentador */}
                  <button
                    type="button"
                    onClick={() => setPresenterMode(false)}
                    title="Sair do modo apresentação (Esc)"
                    style={{
                      height: 32,
                      padding: '0 12px',
                      borderRadius: 10,
                      color: '#CBD5E1',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <X size={15} />
                    <span>Sair (Esc)</span>
                  </button>
                </div>

                {/* Carrossel Horizontal de Slides (Filmstrip de Navegação e Próximos Slides) */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    aria-label="Rolar carrossel para a esquerda"
                    onClick={() => carouselRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
                    style={{
                      width: 28,
                      height: 60,
                      borderRadius: 6,
                      background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(241, 245, 249, 0.9)',
                      border: `1px solid ${dockBorder}`,
                      color: dockText1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div
                    ref={carouselRef}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      overflowX: 'auto',
                      padding: '4px 2px',
                      scrollbarWidth: 'none',
                      scrollBehavior: 'smooth',
                      flex: 1,
                    }}
                  >
                    {slides.map((s, idx) => {
                      const isCurrent = idx === current
                      const isNext = idx === current + 1
                      return (
                        <div
                          key={s.id}
                          id={`presenter-thumb-${idx}`}
                          onClick={() => setCurrent(idx)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            cursor: 'pointer',
                            flexShrink: 0,
                            opacity: isCurrent ? 1 : isNext ? 0.95 : 0.6,
                            transform: isCurrent ? 'scale(1.03)' : 'scale(1)',
                            transition: 'all 0.15s ease',
                          }}
                          title={`Slide ${idx + 1}: ${s.label}`}
                        >
                          <div
                            style={{
                              width: 120,
                              height: 68,
                              borderRadius: 8,
                              overflow: 'hidden',
                              position: 'relative',
                              border: isCurrent
                                ? `2px solid ${PALETTE.violet}`
                                : isNext
                                  ? '2px dashed rgba(99, 102, 241, 0.7)'
                                  : `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                              boxShadow: isCurrent
                                ? '0 0 14px rgba(99, 102, 241, 0.45)'
                                : '0 2px 8px rgba(0,0,0,0.15)',
                            }}
                          >
                            <Slide spec={s} scale={0.094} />
                            {isCurrent && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  left: 4,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  background: PALETTE.violet,
                                  color: '#FFFFFF',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.4px',
                                }}
                              >
                                Atual
                              </span>
                            )}
                            {isNext && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 4,
                                  left: 4,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  background: 'rgba(99, 102, 241, 0.85)',
                                  color: '#FFFFFF',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.4px',
                                }}
                              >
                                Próximo
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: isCurrent ? 700 : 500,
                              color: isCurrent ? PALETTE.violet : isNext ? dockText1 : dockText3,
                              maxWidth: 120,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              textAlign: 'center',
                            }}
                          >
                            {idx + 1}. {s.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    aria-label="Rolar carrossel para a direita"
                    onClick={() => carouselRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
                    style={{
                      width: 28,
                      height: 60,
                      borderRadius: 6,
                      background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(241, 245, 249, 0.9)',
                      border: `1px solid ${dockBorder}`,
                      color: dockText1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {!readOnly && active.id === 'creatives' && data.paid.top.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card, #FFFFFF)', border: '1px solid var(--border, #E2E2EA)', borderRadius: 8, padding: '6px 14px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2, #55556A)' }}>Melhorar resolução dos criativos:</span>
                    {data.paid.top.slice(0, 3).map((a, idx) => {
                      const isOverridden = !!notes.creativeOverrides?.[a.id]
                      return (
                        <div key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <label
                            className="btn btn-outline btn-sm"
                            style={{ height: 26, padding: '0 8px', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Substituir thumbnail por imagem em alta definição do seu computador"
                          >
                            <UploadCloud size={12} />
                            <span>Criativo {idx + 1} {isOverridden ? '✓' : ''}</span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                const reader = new FileReader()
                                reader.onload = () => {
                                  const dataUrl = String(reader.result)
                                  const nextOverrides = { ...(notes.creativeOverrides ?? {}), [a.id]: dataUrl }
                                  const nextNotes = { ...notes, creativeOverrides: nextOverrides }
                                  setNotes(nextNotes)
                                  void save(nextNotes)
                                }
                                reader.readAsDataURL(file)
                              }}
                            />
                          </label>
                          {isOverridden && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              style={{ width: 22, height: 22 }}
                              title="Restaurar imagem original da Meta"
                              onClick={() => {
                                const nextOverrides = { ...(notes.creativeOverrides ?? {}) }
                                delete nextOverrides[a.id]
                                const nextNotes = { ...notes, creativeOverrides: nextOverrides }
                                setNotes(nextNotes)
                                void save(nextNotes)
                              }}
                            >
                              <RotateCcw size={11} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {!readOnly ? (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
                    {drawingOpen
                      ? 'Modo Desenho ativo: selecione uma ferramenta na barra à direita. Pressione T para digitar texto ou L para Laser.'
                      : 'Os campos com contorno tracejado são textos seus: clique e escreva. Clique em "Apresentar" para conduzir a reunião.'}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
                    Use as setas do teclado (← e →) para navegar pelos slides. Pressione P para Apresentar e D para desenhar.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal para Salvar no Report Studio */}
      {saveModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-card, #FFFFFF)', border: '1px solid var(--border)', borderRadius: 16, maxWidth: 440, width: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-1)' }}>Salvar no Report Studio</h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.4 }}>
              Este relatório ficará salvo permanentemente na biblioteca do cliente. Ele poderá acessá-lo, assistir à apresentação e baixar em PDF ou PowerPoint a qualquer momento.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
              Título do Relatório
            </label>
            <input
              type="text"
              value={saveTitle}
              onChange={e => setSaveTitle(e.target.value)}
              placeholder={`Relatório · ${data?.month.label || 'Mensal'}`}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-1)',
                fontSize: 14,
                marginBottom: 20,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSaveModalOpen(false)}
                disabled={savingLibrary}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveToLibrary}
                disabled={savingLibrary}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {savingLibrary ? <Loader2 size={14} className="spin" /> : <Bookmark size={14} />}
                <span>{savingLibrary ? 'Salvando…' : savedReport ? 'Atualizar no Studio' : 'Salvar no Studio'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Modo impressão: todos os slides incluídos, um por página (fora da tela, só aparece ao imprimir).
  const print = (
    <div className="report-print-root" aria-hidden="true">
      {included.map(s => <div key={s.id} className="report-page"><Slide spec={s} scale={1} /></div>)}
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(<>{ui}{print}</>, document.body)
}
