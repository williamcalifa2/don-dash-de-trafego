'use client'

import { useState, useEffect } from 'react'
import type { MetricsSummary } from '@/lib/meta'
import { upsertFechamento, getFechamentos } from '@/lib/supabase'

interface FunnelTabProps {
  summary: MetricsSummary
  currency: string
  clientSlug?: string
}

function fmt(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v)
}
function fmtN(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}
function fmtPct(v: number) { return v.toFixed(1).replace('.', ',') + '%' }

interface SankeyProps {
  stages: { label: string; value: number; cost?: string; costLabel?: string }[]
}

function SankeyFunnel({ stages }: SankeyProps) {
  const W = 860
  const H = 220
  const padX = 24
  const barW = 20
  const centerY = H / 2

  const maxV = stages[0]?.value || 1
  const maxBarH = H * 0.88

  const count = stages.length
  const innerW = W - padX * 2 - barW
  const xs = stages.map((_, i) => padX + (i / (count - 1)) * innerW)
  const heights = stages.map(s => Math.max(6, (s.value / maxV) * maxBarH))
  const tops = heights.map(h => centerY - h / 2)
  const bots = heights.map(h => centerY + h / 2)
  const pcts = stages.map((s, i) => i === 0 ? 100 : (s.value / maxV) * 100)

  const barColors = ['#f97066', '#fb923c', '#c084fc', '#818cf8']
  const bandGrads = [
    { from: '#f97066cc', to: '#fb923ccc' },
    { from: '#fb923ccc', to: '#c084fccc' },
    { from: '#c084fccc', to: '#818cf8cc' },
  ]

  const bands = stages.slice(0, -1).map((_, i) => {
    const x1 = xs[i] + barW
    const x2 = xs[i + 1]
    const mx = (x1 + x2) / 2
    return `M ${x1} ${tops[i]} C ${mx} ${tops[i]}, ${mx} ${tops[i + 1]}, ${x2} ${tops[i + 1]} L ${x2} ${bots[i + 1]} C ${mx} ${bots[i + 1]}, ${mx} ${bots[i]}, ${x1} ${bots[i]} Z`
  })

  const headerH = 52
  const footerH = 48
  const totalH = headerH + H + footerH

  return (
    <svg
      viewBox={`0 0 ${W} ${totalH}`}
      style={{ width: '100%', display: 'block', overflow: 'visible' }}
      aria-label="Funil de conversão"
    >
      <defs>
        {bandGrads.map((g, i) => (
          <linearGradient key={i} id={`sg-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={g.from} />
            <stop offset="100%" stopColor={g.to} />
          </linearGradient>
        ))}
      </defs>

      {/* Bands */}
      <g transform={`translate(0, ${headerH})`}>
        {bands.map((d, i) => (
          <path key={i} d={d} fill={`url(#sg-${i})`} />
        ))}

        {/* Bar columns */}
        {stages.map((_, i) => (
          <rect
            key={i}
            x={xs[i]} y={tops[i]}
            width={barW} height={heights[i]}
            rx={barW / 2}
            fill={barColors[i] ?? '#818cf8'}
          />
        ))}
      </g>

      {/* Labels + pct above bars */}
      {stages.map((s, i) => {
        const cx = xs[i] + barW / 2
        const barTop = headerH + tops[i]
        return (
          <g key={i}>
            <text
              x={cx} y={barTop - 28}
              textAnchor="middle"
              fontSize={10} fontWeight={700}
              fill="var(--text-3)"
              style={{ fontFamily: 'var(--font)', letterSpacing: '0.08em', textTransform: 'uppercase' } as React.CSSProperties}
            >
              {s.label}
            </text>
            {i > 0 && (
              <text
                x={cx} y={barTop - 13}
                textAnchor="middle"
                fontSize={11} fontWeight={700}
                fill={barColors[i] ?? '#818cf8'}
                style={{ fontFamily: 'var(--mono)' } as React.CSSProperties}
              >
                {fmtPct(pcts[i])}
              </text>
            )}
          </g>
        )
      })}

      {/* Values + cost below bars */}
      {stages.map((s, i) => {
        const cx = xs[i] + barW / 2
        const barBot = headerH + bots[i]
        return (
          <g key={i}>
            <text
              x={cx} y={barBot + 18}
              textAnchor="middle"
              fontSize={15} fontWeight={700}
              fill="var(--text-1)"
              style={{ fontFamily: 'var(--mono)' } as React.CSSProperties}
            >
              {s.value > 0 ? fmtN(s.value) : '—'}
            </text>
            {s.cost && (
              <text
                x={cx} y={barBot + 34}
                textAnchor="middle"
                fontSize={10} fontWeight={500}
                fill="var(--text-3)"
                style={{ fontFamily: 'var(--mono)' } as React.CSSProperties}
              >
                {s.costLabel} {s.cost}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function FunnelTab({ summary, currency, clientSlug = 'dal-moro' }: FunnelTabProps) {
  const { impressions, clicks, leads, purchases, purchase_value, spend, cpm, ctr, frequency } = summary
  const hasPurchases = purchases > 0

  const [manualSales, setManualSales] = useState(0)
  const [manualRevenue, setManualRevenue] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draftSales, setDraftSales] = useState('')
  const [draftRevenue, setDraftRevenue] = useState('')

  const hasSupabase = typeof window !== 'undefined' && !!(process.env.NEXT_PUBLIC_SUPABASE_URL)

  useEffect(() => {
    async function load() {
      if (hasSupabase) {
        try {
          const rows = await getFechamentos(clientSlug)
          const total = rows.reduce((s, r) => ({ count: s.count + r.count, revenue: s.revenue + r.revenue }), { count: 0, revenue: 0 })
          if (total.count > 0) { setManualSales(total.count); setManualRevenue(total.revenue); return }
        } catch {}
      }
      try {
        const saved = localStorage.getItem('funnel_manual')
        if (saved) {
          const { sales, revenue } = JSON.parse(saved)
          setManualSales(Number(sales) || 0)
          setManualRevenue(Number(revenue) || 0)
        }
      } catch {}
    }
    load()
  }, [clientSlug, hasSupabase])

  async function saveManual() {
    const sales = Math.max(0, Number(draftSales) || 0)
    const revenue = Math.max(0, Number(draftRevenue) || 0)
    setManualSales(sales)
    setManualRevenue(revenue)
    const today = new Date().toISOString().slice(0, 10)
    if (hasSupabase) {
      try { await upsertFechamento(clientSlug, today, sales, revenue) } catch {}
    }
    try { localStorage.setItem('funnel_manual', JSON.stringify({ sales, revenue })) } catch {}
    setEditing(false)
  }

  const effectiveSales = hasPurchases ? purchases : manualSales
  const effectiveRevenue = hasPurchases ? purchase_value : manualRevenue

  const cpc = clicks > 0 ? spend / clicks : null
  const cpl = leads > 0 ? spend / leads : null
  const cpv = effectiveSales > 0 ? spend / effectiveSales : null
  const leadRate = clicks > 0 ? (leads / clicks) * 100 : 0
  const closeRate = leads > 0 && effectiveSales > 0 ? (effectiveSales / leads) * 100 : null
  const overallRate = clicks > 0 && effectiveSales > 0 ? (effectiveSales / clicks) * 100 : null
  const effectiveRoas = effectiveRevenue > 0 && spend > 0 ? effectiveRevenue / spend : null

  const sankeyStages = [
    { label: 'Impressões', value: impressions },
    { label: 'Cliques', value: clicks, cost: cpc ? fmt(cpc, currency) : undefined, costLabel: 'CPC' },
    { label: 'Leads', value: leads, cost: cpl ? fmt(cpl, currency) : undefined, costLabel: 'CPL' },
    { label: 'Conversões', value: effectiveSales, cost: cpv ? fmt(cpv, currency) : undefined, costLabel: 'CPV' },
  ]

  return (
    <div>
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Investimento', value: fmt(spend, currency) },
          { label: 'CPM', value: fmt(cpm, currency) },
          { label: 'CTR', value: `${ctr.toFixed(2)}%` },
          { label: 'Frequência', value: frequency.toFixed(1) },
          { label: 'ROAS', value: effectiveRoas ? `${effectiveRoas.toFixed(2)}x` : '—' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Sankey chart */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '28px 28px 20px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 20 }}>
          Funil de conversão
        </div>
        <SankeyFunnel stages={sankeyStages} />
      </div>

      {/* Conversion rates row */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px',
        display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 16,
      }}>
        {[
          { label: 'Imp → Clique', value: fmtPct(clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0), good: ctr >= 1 },
          { label: 'Clique → Lead', value: fmtPct(leadRate), good: leadRate >= 3 },
          ...(closeRate != null ? [{ label: 'Lead → Fechamento', value: fmtPct(closeRate), good: closeRate >= 5 }] : []),
          ...(overallRate != null ? [{ label: 'Clique → Fechamento', value: fmtPct(overallRate), good: overallRate >= 1 }] : []),
        ].map(r => (
          <div key={r.label}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 2 }}>{r.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: r.good ? 'var(--green)' : 'var(--red)' }}>{r.value}</div>
          </div>
        ))}
        {effectiveRevenue > 0 && effectiveSales > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 2 }}>Ticket médio</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{fmt(effectiveRevenue / effectiveSales, currency)}</div>
          </div>
        )}
      </div>

      {/* Manual sales */}
      {!hasPurchases && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '16px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editing ? 16 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              Conversões manuais
              {effectiveSales > 0 && (
                <span style={{ marginLeft: 10, fontFamily: 'var(--mono)', color: 'var(--text-1)', fontSize: 14 }}>
                  {effectiveSales} fechamentos{effectiveRevenue > 0 ? ` · ${fmt(effectiveRevenue, currency)}` : ''}
                </span>
              )}
            </div>
            <button
              onClick={() => { setDraftSales(String(manualSales || '')); setDraftRevenue(String(manualRevenue || '')); setEditing(!editing) }}
              style={{
                fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)',
                borderRadius: 'var(--radius-sm)', padding: '4px 12px', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              {effectiveSales > 0 ? 'Editar' : '+ Adicionar'}
            </button>
          </div>

          {editing && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Fechamentos</label>
                  <input type="number" min={0} value={draftSales} onChange={e => setDraftSales(e.target.value)} placeholder="0" style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-1)',
                    fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, outline: 'none',
                  }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Receita (R$)</label>
                  <input type="number" min={0} value={draftRevenue} onChange={e => setDraftRevenue(e.target.value)} placeholder="0" style={{
                    width: '100%', padding: '10px 14px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-1)',
                    fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, outline: 'none',
                  }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(false)} style={{
                  padding: '7px 16px', fontSize: 12, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', fontFamily: 'var(--font)',
                }}>Cancelar</button>
                <button onClick={saveManual} style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--accent)', border: 'none',
                  borderRadius: 'var(--radius-sm)', color: '#0d0d0d', fontFamily: 'var(--font)',
                }}>Salvar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
