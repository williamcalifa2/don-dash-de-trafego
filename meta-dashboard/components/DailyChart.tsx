'use client'

import { useState } from 'react'
import type { DailySummary } from '@/lib/meta'

import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'

interface DailyChartProps {
  kind?: ResultKind
  daily: DailySummary
  currency: string
}

function normalize(arr: number[]): number[] {
  if (!arr || arr.length === 0) return []
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  if (!isFinite(min) || !isFinite(max)) return arr.map(() => 0)
  const range = max - min || 1
  return arr.map((v) => (v - min) / range)
}

export function DailyChart({ daily: raw, currency, kind = 'form' }: DailyChartProps) {
  const L = KIND_LABELS[kind]
  // Clientes de site/conversas: a linha tracejada é o resultado real do dia (conversas, leads do site ou resultados).
  const daily = kind === 'form' || !raw.metrics?.results ? raw : { ...raw, leads: raw.metrics.results }
  const n = daily.dates?.length ?? 0

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!daily || !daily.dates || daily.dates.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        Sem dados diários disponíveis para o período selecionado.
      </div>
    )
  }

  const W = 780
  const H = 160
  const PL = 56
  const PR = 48
  const PT = 16
  const PB = 28
  const chartW = W - PL - PR
  const chartH = H - PT - PB

  const spendData = daily.spend && daily.spend.length > 0 ? daily.spend : new Array(n).fill(0)
  const leadsData = daily.leads && daily.leads.length > 0 ? daily.leads : new Array(n).fill(0)

  const spendNorm = normalize(spendData)
  const leadsNorm = normalize(leadsData)

  function toX(i: number) {
    return PL + (i / Math.max(n - 1, 1)) * chartW
  }
  function toY(v: number) {
    return PT + (1 - v) * chartH
  }

  function polyline(norm: number[]) {
    if (!norm || norm.length === 0) return ''
    return norm.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  }
  function area(norm: number[]) {
    if (!norm || norm.length === 0) return ''
    const pts = norm.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
    return `M ${toX(0)},${toY(norm[0] ?? 0)} L ${pts} L ${toX(Math.max(n - 1, 0))},${PT + chartH} L ${toX(0)},${PT + chartH} Z`
  }

  const fmtSpend = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 0 }).format(v)
  const fmtSpendFull = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

  const spendMin = spendData.length > 0 ? Math.min(...spendData) : 0
  const spendMax = spendData.length > 0 ? Math.max(...spendData) : 0
  const leadsMin = leadsData.length > 0 ? Math.min(...leadsData) : 0
  const leadsMax = leadsData.length > 0 ? Math.max(...leadsData) : 0

  // Tooltip geometry
  const TW = 148
  const TH = 56
  const TR = 12
  const tooltipX = hoveredIdx !== null
    ? Math.min(Math.max(toX(hoveredIdx) - TW / 2, PL), PL + chartW - TW)
    : 0
  const spendY = hoveredIdx !== null ? toY(spendNorm[hoveredIdx]) : 0
  const leadsY = hoveredIdx !== null ? toY(leadsNorm[hoveredIdx]) : 0
  const anchorY = hoveredIdx !== null ? Math.min(spendY, leadsY) : 0
  const tooltipY = Math.max(PT, anchorY - TH - 10)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ width: 20, height: 2, background: 'var(--accent)', display: 'inline-block', borderRadius: 1 }} />
          Investimento diário
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ width: 20, height: 2, background: 'var(--green)', display: 'inline-block', borderRadius: 1, borderTop: '2px dashed var(--green)' }} />
          {kind === 'form' ? 'Leads diários' : `${L.many} por dia`}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', minWidth: 320, overflow: 'visible' }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Grid lines */}
          {[0, 0.5, 1].map((t, i) => (
            <line key={i}
              x1={PL} x2={PL + chartW}
              y1={PT + (1 - t) * chartH} y2={PT + (1 - t) * chartH}
              stroke="var(--border-soft)" strokeWidth={1}
            />
          ))}

          {/* Spend area */}
          <path d={area(spendNorm)} fill="var(--accent-soft)" />
          <polyline points={polyline(spendNorm)} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

          {/* Leads line dashed */}
          <polyline points={polyline(leadsNorm)} fill="none" stroke="var(--green)" strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Vertical crosshair on hover */}
          {hoveredIdx !== null && (
            <line
              x1={toX(hoveredIdx)} x2={toX(hoveredIdx)}
              y1={PT} y2={PT + chartH}
              stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3 2"
            />
          )}

          {/* Dots — spend */}
          {spendNorm.map((v, i) => (
            <circle key={`s${i}`}
              cx={toX(i)} cy={toY(v)}
              r={hoveredIdx === i ? 4.5 : 3}
              fill={hoveredIdx === i ? 'var(--accent)' : 'var(--bg-card)'}
              stroke="var(--accent)" strokeWidth={1.5}
              style={{ transition: 'r .1s, fill .1s' }}
            />
          ))}

          {/* Dots — leads */}
          {leadsNorm.map((v, i) => (
            <circle key={`l${i}`}
              cx={toX(i)} cy={toY(v)}
              r={hoveredIdx === i ? 4.5 : 3}
              fill={hoveredIdx === i ? 'var(--green)' : 'var(--bg-card)'}
              stroke="var(--green)" strokeWidth={1.5}
              style={{ transition: 'r .1s, fill .1s' }}
            />
          ))}

          {/* Invisible hit areas — wide columns per data point */}
          {daily.dates.map((_, i) => {
            const x = toX(i)
            const colW = n > 1 ? chartW / (n - 1) : chartW
            return (
              <rect key={`hit${i}`}
                x={x - colW / 2} y={PT}
                width={colW} height={chartH}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHoveredIdx(i)}
              />
            )
          })}

          {/* Tooltip */}
          {hoveredIdx !== null && (
            <g style={{ pointerEvents: 'none' }}>
              {/* Shadow */}
              <rect
                x={tooltipX + 1} y={tooltipY + 2}
                width={TW} height={TH} rx={TR}
                fill="hsl(0 0% 0% / .10)"
              />
              {/* Background */}
              <rect
                x={tooltipX} y={tooltipY}
                width={TW} height={TH} rx={TR}
                fill="var(--bg-card)" stroke="var(--border)" strokeWidth={1}
              />
              {/* Date */}
              <text
                x={tooltipX + 10} y={tooltipY + 16}
                fontSize={9.5} fontWeight={500}
                fill="var(--text-3)"
                fontFamily="var(--mono)"
                letterSpacing="0.5"
              >
                {daily.dates[hoveredIdx]}
              </text>
              {/* Spend dot */}
              <circle cx={tooltipX + 10} cy={tooltipY + 29} r={4} fill="var(--accent)" />
              <text
                x={tooltipX + 20} y={tooltipY + 33}
                fontSize={11} fontWeight={600}
                fill="var(--text-1)"
                fontFamily="var(--mono)"
              >
                {fmtSpendFull(spendData[hoveredIdx] ?? 0)}
              </text>
              {/* Leads dot */}
              <circle cx={tooltipX + 10} cy={tooltipY + 47} r={4} fill="var(--green)" />
              <text
                x={tooltipX + 20} y={tooltipY + 51}
                fontSize={11} fontWeight={600}
                fill="var(--text-1)"
                fontFamily="var(--mono)"
              >
                {leadsData[hoveredIdx] ?? 0} {kind === 'form' ? `lead${(leadsData[hoveredIdx] ?? 0) !== 1 ? 's' : ''}` : ((leadsData[hoveredIdx] ?? 0) === 1 ? L.one : L.many.toLowerCase())}
              </text>
            </g>
          )}

          {/* X axis labels */}
          {daily.dates.map((d, i) => (i % Math.ceil(n / 8) === 0 || hoveredIdx === i) && (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={9} fill={hoveredIdx === i ? 'var(--text-1)' : 'var(--text-3)'} fontFamily="var(--mono)" fontWeight={hoveredIdx === i ? 500 : 400}>{d}</text>
          ))}

          {/* Y axis — spend (left) */}
          <text x={PL - 4} y={PT + 4} textAnchor="end" fontSize={9} fill="var(--text-3)" fontFamily="var(--mono)">{fmtSpend(spendMax)}</text>
          <text x={PL - 4} y={PT + chartH / 2 + 4} textAnchor="end" fontSize={9} fill="var(--text-3)" fontFamily="var(--mono)">{fmtSpend((spendMin + spendMax) / 2)}</text>
          <text x={PL - 4} y={PT + chartH + 4} textAnchor="end" fontSize={9} fill="var(--text-3)" fontFamily="var(--mono)">{fmtSpend(spendMin)}</text>

          {/* Y axis — leads (right) */}
          <text x={PL + chartW + 4} y={PT + 4} textAnchor="start" fontSize={9} fill="var(--green)" fontFamily="var(--mono)">{leadsMax}</text>
          <text x={PL + chartW + 4} y={PT + chartH + 4} textAnchor="start" fontSize={9} fill="var(--green)" fontFamily="var(--mono)">{leadsMin}</text>
        </svg>
      </div>
    </div>
  )
}
