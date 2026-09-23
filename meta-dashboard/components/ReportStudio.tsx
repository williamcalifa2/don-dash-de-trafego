'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Eye, EyeOff, FileText, Loader2, RefreshCw, X, UploadCloud, RotateCcw } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { compact, type ReportData, type ReportMode, type ReportNotes, type ReportPreset } from '@/lib/report'
import { buildSlides, FONT, PALETTE, STAGE, type El, type SlideSpec } from '@/lib/reportSlides'

type Loaded = ReportData & { draftAnalysis: string }
type Phase = { kind: 'loading'; text: string } | { kind: 'error'; text: string } | { kind: 'ready'; data: Loaded }

const needsPrepare = (d: Loaded) => d.paid.status === 'pending' || d.organic.status === 'incomplete' || d.organic.status === 'pending'

function SvgChart({ el }: { el: Extract<El, { t: 'chart' }> }) {
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
            <line x1={padLeft} y1={g.y} x2={padLeft + plotW} y2={g.y} stroke="#EAEAEF" strokeDasharray="4 4" strokeWidth="1" />
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
            <text key={`lbl-${i}`} x={getX(i)} y={padTop + plotH + 22} textAnchor="middle" fontSize="11" fill="#71717A" fontFamily="sans-serif">
              {lbl}
            </text>
          )
        })}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 6, fontSize: 13, fontWeight: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0B0B14' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: color0 }} />
          <span>{s0.name} (Eixo esquerdo)</span>
        </div>
        {s1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0B0B14' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: color1 }} />
            <span>{s1.name} (Eixo direito)</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SvgDoughnut({ el }: { el: Extract<El, { t: 'chart' }> }) {
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
          <circle cx={90} cy={90} r={R} fill="none" stroke="#1E293B" strokeWidth={24} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E2E8F0' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span>{lbl}</span>
              </div>
              <span style={{ fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                {val.toFixed(val >= 10 ? 0 : 1).replace('.', ',')}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SvgBarChart({ el }: { el: Extract<El, { t: 'chart' }> }) {
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 11, color: '#E2E8F0', marginBottom: 6 }}>
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
                <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="#1E293B" strokeWidth={1} strokeDasharray="3 3" />
                <text x={PL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#CBD5E1">{tickLabel}</text>
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
                        <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize="9" fontWeight={700} fill="#F8FAFC">
                          {val}
                        </text>
                      )}
                    </g>
                  )
                })}
                <text x={cx} y={H - 6} textAnchor="middle" fontSize="9.5" fill="#E2E8F0">{lbl}</text>
              </g>
            )
          })}
        </svg>
      </div>

      {costSubtitle && (
        <div style={{ fontSize: 11, color: '#CBD5E1', textAlign: 'center', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {costSubtitle}
        </div>
      )}
    </div>
  )
}

function SvgFunnel({ el }: { el: Extract<El, { t: 'funnel' }> }) {
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
    <div style={{ position: 'relative', width: W, height: H, background: '#0F172A', border: '1.5px solid #1E293B', borderRadius: 16, overflow: 'hidden', padding: 20, boxSizing: 'border-box' }}>
      {/* Top KPI Header */}
      <div style={{ display: 'flex', alignItems: 'center', height: topH - 20, borderBottom: '1px solid #1E293B', paddingBottom: 15 }}>
        <div style={{ display: 'flex', flex: 1, gap: 15 }}>
          {stages.map((stg, i) => (
            <div key={i} style={{ flex: 1, position: 'relative' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: i === 2 ? '#22C55E' : '#64748B' }}>
                {stg.label}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: i === 2 ? '#22C55E' : '#F8FAFC', lineHeight: 1.15, marginTop: 4 }}>
                {stg.val}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                {stg.sub}
              </div>
              {i < 3 && <div style={{ position: 'absolute', right: -7, top: 8, bottom: 8, width: 1, background: '#1E293B' }} />}
            </div>
          ))}
        </div>

        {/* ROAS Badge */}
        <div style={{ width: 140, background: '#131927', border: '1px solid #1E293B', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B' }}>RETORNO GERAL</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF', marginTop: 2 }}>{roas ? `${roas}x` : '0,0%'}</div>
        </div>
      </div>

      {/* Wave Graphic */}
      <div style={{ position: 'relative', width: waveW, height: waveH, marginTop: 15, background: '#131927', borderRadius: 12, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${waveW} ${waveH}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="funnelWaveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818CF8" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#4F46E5" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#1E1B4B" stopOpacity="0.10" />
            </linearGradient>
          </defs>

          {[xs[1], xs[2], xs[3]].map((x, idx) => (
            <line key={idx} x1={x} x2={x} y1={0} y2={waveH} stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} strokeDasharray="4 4" />
          ))}

          <path d={wavePath} fill="url(#funnelWaveGrad)" />
        </svg>

        {/* Drop-off Conversion rate pill tags */}
        <div style={{ position: 'absolute', left: xs[1] - 65, top: ys[1] - 20, background: '#0F172A', border: '1.5px solid #6366F1', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#818CF8', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 5 }}>
          {ctr}% CTR
        </div>

        <div style={{ position: 'absolute', left: xs[2] - 75, top: ys[2] - 20, background: '#0F172A', border: '1.5px solid #22C55E', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#22C55E', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 5 }}>
          {clickToResultRate}% {resultLabel}
        </div>

        <div style={{ position: 'absolute', left: xs[3] - 60, top: ys[3] - 20, background: '#0F172A', border: '1.5px solid #F59E0B', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#F59E0B', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 5 }}>
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
}: {
  el: El
  onEdit?: (key: NonNullable<Extract<El, { t: 'text' }>['edit']>, value: string) => void
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
    const imgContent = el.src ? (
      <img src={el.src} alt="" style={{ ...pos, objectFit: 'cover', borderRadius: el.radius, cursor: el.url ? 'pointer' : undefined }} />
    ) : (
      <div style={{ ...pos, background: '#1E293B', borderRadius: el.radius }} />
    )
    return el.url ? (
      <a href={el.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        {imgContent}
      </a>
    ) : imgContent
  }
  if (el.t === 'chart') {
    return (
      <div style={{ ...pos, background: '#0F172A', borderRadius: 16, border: '1.5px solid #1E293B', padding: '16px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
        {el.title && <div style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC', marginBottom: 8, fontFamily: `${FONT}, sans-serif` }}>{el.title}</div>}
        <div style={{ flex: 1, minHeight: 0 }}>
          {el.chartType === 'doughnut' ? (
            <SvgDoughnut el={el} />
          ) : el.chartType === 'bar' ? (
            <SvgBarChart el={el} />
          ) : (
            <SvgChart el={el} />
          )}
        </div>
      </div>
    )
  }
  if (el.t === 'funnel') {
    return <div style={pos}><SvgFunnel el={el} /></div>
  }
  if (el.t === 'table') {
    return (
      <div style={{ ...pos, background: '#0F172A', borderRadius: 14, border: '1.5px solid #1E293B', overflow: 'hidden', boxSizing: 'border-box', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
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
              <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#0F172A' : '#131927', borderBottom: '1px solid #1E293B' }}>
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    style={{
                      padding: '12px 16px',
                      fontSize: 12,
                      fontWeight: cell.bold ? 700 : 400,
                      color: cell.color ?? '#F8FAFC',
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
  return (
    <div style={{ width: STAGE.w * scale, height: STAGE.h * scale, position: 'relative', overflow: 'hidden', borderRadius: scale < 0.5 ? 4 : 8, flexShrink: 0 }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: spec.dark ? PALETTE.dark : PALETTE.light, overflow: 'hidden', transition: 'background-color 0.2s ease, opacity 0.2s ease' }}>
        {spec.els.map((el, i) => <Element key={i} el={el} onEdit={onEdit} />)}
      </div>
    </div>
  )
}

export function ReportStudio({
  onClose,
  initialPreset = 'last_month',
  initialMode = 'standard',
}: {
  onClose: () => void
  initialPreset?: ReportPreset
  initialMode?: ReportMode
}) {
  const [preset, setPreset] = useState<ReportPreset>(initialPreset)
  const [mode, setMode] = useState<ReportMode>(initialMode)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', text: 'Carregando o relatório…' })
  const [notes, setNotes] = useState<ReportNotes | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState(0)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [exporting, setExporting] = useState<null | 'pptx' | 'pdf'>(null)
  const [scale, setScale] = useState(0.6)
  const stageBox = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const load = useCallback(async (opts: { prepare?: boolean; targetPreset?: ReportPreset } = {}) => {
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
  }, [preset])

  useEffect(() => { load() }, [load])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  // ajusta o palco à largura disponível
  useEffect(() => {
    const el = stageBox.current
    if (!el) return
    const fit = () => setScale(Math.max(0.3, Math.min(1, (el.clientWidth - 32) / STAGE.w, (el.clientHeight - 32) / STAGE.h)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase.kind])

  const data = phase.kind === 'ready' ? phase.data : null
  const slides = useMemo(() => (data && notes ? buildSlides(data, notes, mode) : []), [data, notes, mode])
  const included = slides.filter(s => !hidden.has(s.id))

  const save = useCallback(async (n: ReportNotes, p = preset) => {
    setSaved('saving')
    const r = await apiFetch('/api/report/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', notes: n, preset: p }) }).catch(() => null)
    dirty.current = false
    setSaved(r?.ok ? 'saved' : 'error')
  }, [preset])

  const edit = useCallback((key: keyof ReportNotes, value: string) => {
    setNotes(prev => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      dirty.current = true; setSaved('idle')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => save(next), 1200)
      return next
    })
  }, [save])

  const switchPreset = useCallback((next: ReportPreset) => {
    if (next === preset) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (dirty.current && notes) void save(notes, preset)
    setPreset(next)
    setPhase({ kind: 'loading', text: next === 'last_7d' ? 'Carregando relatório dos últimos 7 dias…' : 'Carregando relatório do último mês…' })
    void load({ targetPreset: next, prepare: true })
  }, [preset, notes, save, load])

  // não perde o texto se fechar logo depois de editar
  const close = useCallback(() => { if (saveTimer.current) clearTimeout(saveTimer.current); if (dirty.current && notes) void save(notes); onClose() }, [notes, onClose, save])

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

  const active = slides[Math.min(current, Math.max(0, slides.length - 1))]

  const ui = (
    <div role="dialog" aria-modal="true" aria-label="Relatório mensal" className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg, #F7F8FA)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {data ? (preset === 'last_7d' ? 'Relatório semanal' : 'Relatório mensal') : 'Relatório'}
              {data ? ` · ${data.month.label}` : ''}
            </div>
            {data && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.client.name} · {included.length} de {slides.length} slides</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card2, rgba(0,0,0,0.06))', padding: '3px 4px', borderRadius: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${preset === 'last_month' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => switchPreset('last_month')}
              title="Relatório do mês anterior fechado"
            >
              Mês passado
            </button>
            <button
              type="button"
              className={`btn btn-sm ${preset === 'this_month' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => switchPreset('this_month')}
              title="Relatório do mês atual até o momento"
            >
              Este mês
            </button>
            <button
              type="button"
              className={`btn btn-sm ${preset === 'last_7d' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => switchPreset('last_7d')}
              title="Relatório dos últimos 7 dias"
            >
              Últimos 7 dias
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card2, rgba(0,0,0,0.06))', padding: '3px 4px', borderRadius: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'standard' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => { setMode('standard'); setCurrent(0) }}
            >
              Padrão (10 slides)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'advanced' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => { setMode('advanced'); setCurrent(0) }}
            >
              Avançado (12 slides)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'organic' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => { setMode('organic'); setCurrent(0) }}
              title="Relatório focado exclusivamente em resultados orgânicos"
            >
              Orgânico (6 slides)
            </button>
          </div>
        </div>
        {data && <span aria-live="polite" style={{ fontSize: 12, color: saved === 'error' ? 'var(--red)' : 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {saved === 'saving' && <><Loader2 size={13} className="spin" /> Salvando…</>}{saved === 'saved' && <><Check size={13} /> Textos salvos</>}{saved === 'error' && 'Não foi possível salvar os textos'}
        </span>}
        {data && <button className="btn btn-outline btn-sm" onClick={exportPdf} disabled={!!exporting}><FileText size={14} strokeWidth={1.75} /> {exporting === 'pdf' ? 'Preparando…' : 'Baixar PDF'}</button>}
        {data && <button className="btn btn-primary btn-sm" onClick={exportPptx} disabled={!!exporting}><Download size={14} strokeWidth={1.75} /> {exporting === 'pptx' ? 'Gerando…' : 'Baixar PowerPoint'}</button>}
        <button className="btn btn-outline btn-icon btn-sm" onClick={close} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button>
      </header>

      {phase.kind === 'loading' && <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-2)', fontSize: 14 }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} className="spin" /> {phase.text}</span></div>}
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
          <div ref={stageBox} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, background: 'var(--muted-bg, rgba(127,127,160,.08))' }}>
            <div style={{ boxShadow: '0 8px 30px rgba(0,0,0,.18)', borderRadius: 8 }}>
              <Slide spec={active} scale={scale} onEdit={edit} />
            </div>
            {active.id === 'creatives' && data.paid.top.length > 0 && (
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
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Os campos com contorno tracejado são textos seus: clique e escreva. O resto vem dos dados da Meta.</p>
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
