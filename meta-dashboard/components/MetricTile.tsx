'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Sparkline } from './Sparkline'

interface MetricTileProps {
  label: string
  value: string
  sparkData?: number[]
  prevValue?: number | null
  currentRaw?: number | null
  lowerIsBetter?: boolean
  /** texto pequeno abaixo do valor (ex.: "+12 no período") */
  note?: string
}

function Delta({ current, prev, lowerIsBetter }: { current: number; prev: number; lowerIsBetter?: boolean }) {
  if (!prev) return null
  const pct = ((current - prev) / Math.abs(prev)) * 100
  const abs = Math.abs(pct)
  const flat = abs < 0.05
  const up = pct >= 0
  const label = abs >= 100 ? `${Math.round(abs)}%` : `${abs.toFixed(1).replace('.', ',')}%`
  const good = lowerIsBetter ? !up : up
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 12, fontWeight: 600,
      color: flat ? 'var(--text-2)' : good ? 'var(--green)' : 'var(--red)',
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-.01em',
    }}>
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

export function MetricTile({ label, value, sparkData, prevValue, currentRaw, lowerIsBetter, note }: MetricTileProps) {
  const hasDelta = currentRaw != null && prevValue != null && prevValue !== 0
  const hasSpark = sparkData && sparkData.length > 1

  return (
    <div className="card metric-tile-card" style={{
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 100,
    }}>
      {/* Top: label */}
      <div className="metric-tile-label" style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
        textTransform: 'uppercase' as const, color: 'var(--text-2)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </div>

      {/* Bottom: value + delta | sparkline */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
          <div className="metric-tile-value" style={{
            fontSize: 20, fontWeight: 700, color: 'var(--text-1)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {value}
          </div>
          {hasDelta && (
            <Delta current={currentRaw!} prev={prevValue!} lowerIsBetter={lowerIsBetter} />
          )}
          {!hasDelta && note && <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>}
        </div>

        {hasSpark && (
          <div className="metric-tile-sparkline" style={{ flexShrink: 0, marginBottom: 2 }}>
            <Sparkline data={sparkData} width={64} height={32} />
          </div>
        )}
      </div>
    </div>
  )
}
