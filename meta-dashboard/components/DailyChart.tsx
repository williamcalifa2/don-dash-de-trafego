'use client'

import type { DailySummary } from '@/lib/meta'

interface DailyChartProps {
  daily: DailySummary
  currency: string
}

function normalize(arr: number[]): number[] {
  const min = Math.min(...arr)
  const max = Math.max(...arr)
  const range = max - min || 1
  return arr.map((v) => (v - min) / range)
}

export function DailyChart({ daily, currency }: DailyChartProps) {
  const W = 780
  const H = 160
  const PL = 56
  const PR = 48
  const PT = 16
  const PB = 28
  const chartW = W - PL - PR
  const chartH = H - PT - PB
  const n = daily.dates.length

  const spendNorm = normalize(daily.spend)
  const leadsNorm = normalize(daily.leads)

  function toX(i: number) {
    return PL + (i / (n - 1)) * chartW
  }
  function toY(v: number) {
    return PT + (1 - v) * chartH
  }

  function polyline(norm: number[]) {
    return norm.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  }
  function area(norm: number[]) {
    const pts = norm.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
    return `M ${toX(0)},${toY(norm[0])} L ${pts} L ${toX(n - 1)},${PT + chartH} L ${toX(0)},${PT + chartH} Z`
  }

  const fmtSpend = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 0 }).format(v)

  const spendMin = Math.min(...daily.spend)
  const spendMax = Math.max(...daily.spend)
  const leadsMin = Math.min(...daily.leads)
  const leadsMax = Math.max(...daily.leads)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)' }}>
          <span style={{ width: 20, height: 2, background: 'var(--accent)', display: 'inline-block', borderRadius: 1 }} />
          Investimento diário
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)' }}>
          <span style={{ width: 20, height: 2, background: 'var(--green)', display: 'inline-block', borderRadius: 1, borderTop: '2px dashed var(--green)' }} />
          Leads diários
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', minWidth: 320 }}>
          {/* Grid lines */}
          {[0, 0.5, 1].map((t, i) => (
            <line key={i}
              x1={PL} x2={PL + chartW}
              y1={PT + (1 - t) * chartH} y2={PT + (1 - t) * chartH}
              stroke="var(--border-soft)" strokeWidth={1}
            />
          ))}

          {/* Spend area */}
          <path d={area(spendNorm)} fill="hsl(233 100% 81% / .08)" />
          <polyline points={polyline(spendNorm)} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

          {/* Leads line dashed */}
          <polyline points={polyline(leadsNorm)} fill="none" stroke="var(--green)" strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots — spend */}
          {spendNorm.map((v, i) => (
            <circle key={`s${i}`} cx={toX(i)} cy={toY(v)} r={3} fill="var(--bg-card)" stroke="var(--accent)" strokeWidth={1.5} />
          ))}

          {/* Dots — leads */}
          {leadsNorm.map((v, i) => (
            <circle key={`l${i}`} cx={toX(i)} cy={toY(v)} r={3} fill="var(--bg-card)" stroke="var(--green)" strokeWidth={1.5} />
          ))}

          {/* X axis labels */}
          {daily.dates.map((d, i) => (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-3)" fontFamily="var(--mono)">{d}</text>
          ))}

          {/* Y axis — spend (left) */}
          <text x={PL - 4} y={PT + 4} textAnchor="end" fontSize={9} fill="var(--text-3)" fontFamily="var(--mono)">{fmtSpend(spendMax)}</text>
          <text x={PL - 4} y={PT + chartH / 2 + 4} textAnchor="end" fontSize={9} fill="var(--text-3)" fontFamily="var(--mono)">{fmtSpend((spendMin + spendMax) / 2)}</text>
          <text x={PL - 4} y={PT + chartH + 4} textAnchor="end" fontSize={9} fill="var(--text-3)" fontFamily="var(--mono)">{fmtSpend(spendMin)}</text>

          {/* Y axis — leads (right) */}
          <text x={PL + chartW + 4} y={PT + 4} textAnchor="start" fontSize={9} fill="rgba(34,197,94,.8)" fontFamily="var(--mono)">{leadsMax}</text>
          <text x={PL + chartW + 4} y={PT + chartH + 4} textAnchor="start" fontSize={9} fill="rgba(34,197,94,.8)" fontFamily="var(--mono)">{leadsMin}</text>
        </svg>
      </div>
    </div>
  )
}
