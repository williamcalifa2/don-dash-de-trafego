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
      borderRadius: 'var(--radius)',
      padding: '18px 20px 14px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minHeight: 96,
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color .15s, background .15s',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-med)'
      ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
      ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)'
    }}
    >
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '.22em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-3)',
        fontFamily: 'var(--font)',
      }}>
        {label}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
        <div style={{
          fontSize: 26,
          fontWeight: 500,
          color: 'var(--text-1)',
          letterSpacing: '-1px',
          fontFamily: 'var(--mono)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>
          {value}
        </div>

        {sparkData && sparkData.length > 1 && (
          <div style={{ flexShrink: 0, opacity: 0.35 }}>
            <Sparkline data={sparkData} width={64} height={32} />
          </div>
        )}
      </div>
    </div>
  )
}
