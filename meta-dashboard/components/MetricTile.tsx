'use client'

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
  return (
    <span style={{
      fontSize: 12, fontWeight: 600,
      color: flat ? 'var(--text-2)' : good ? 'var(--green)' : 'var(--red)',
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-.01em',
    }}>
      {flat ? '→' : up ? '↑' : '↓'} {label}
    </span>
  )
}

export function MetricTile({ label, value, sparkData, prevValue, currentRaw, lowerIsBetter, note }: MetricTileProps) {
  const hasDelta = currentRaw != null && prevValue != null && prevValue !== 0
  const hasSpark = sparkData && sparkData.length > 1

  return (
    <div className="card" style={{
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 100,
    }}>
      {/* Top: label */}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
        textTransform: 'uppercase' as const, color: 'var(--text-2)',
      }}>
        {label}
      </div>

      {/* Bottom: value + delta | sparkline */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{
            fontSize: 20, fontWeight: 700, color: 'var(--text-1)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
          }}>
            {value}
          </div>
          {hasDelta && (
            <Delta current={currentRaw!} prev={prevValue!} lowerIsBetter={lowerIsBetter} />
          )}
          {!hasDelta && note && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{note}</span>}
        </div>

        {hasSpark && (
          <div style={{ flexShrink: 0, marginBottom: 2 }}>
            <Sparkline data={sparkData} width={64} height={32} />
          </div>
        )}
      </div>
    </div>
  )
}
