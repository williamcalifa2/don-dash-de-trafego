'use client'

import { Sparkline } from './Sparkline'

interface MetricTileProps {
  label: string
  value: string
  sparkData?: number[]
}

export function MetricTile({ label, value, sparkData }: MetricTileProps) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.08em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-3)',
      }}>
        {label}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--text-1)',
            letterSpacing: '-0.5px',
            fontFamily: 'var(--mono)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.2,
            marginTop: 4,
          }}>
            {value}
          </div>

        </div>

        {sparkData && sparkData.length > 1 && (
          <div style={{ flexShrink: 0, opacity: 0.85 }}>
            <Sparkline data={sparkData} width={72} height={36} />
          </div>
        )}
      </div>
    </div>
  )
}
