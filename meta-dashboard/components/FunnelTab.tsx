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

/* ─── Organic flow funnel — pink→gold gradient, echo layers, bezier curves ─── */
interface FunnelStage {
  label: string
  value: number
  sublabel?: string
}

function OrganicFunnel({ stages }: { stages: FunnelStage[] }) {
  const W = 560
  const CY = 100            // vertical center in SVG coords
  const MAX_H = 80          // max half-height
  const MIN_H = 8           // floor so thin stages stay visible
  const ECHO1 = 9           // echo 1 expansion
  const ECHO2 = 17          // echo 2 expansion
  const xs = [0, 140, 280, 420, 560]   // x-positions for 4 zones (5 edges)
  const mxs = [70, 210, 350, 490]      // bezier control x midpoints

  // Power-scale heights so small values remain visible
  const maxV = stages[0]?.value || 1
  const hs = [...stages.map(s => {
    const ratio = Math.max(0, s.value / maxV)
    return Math.max(MIN_H, Math.pow(ratio, 0.38) * MAX_H)
  }), 0] // dummy 5th — filled below
  hs[4] = hs[3] // right edge mirrors stage-4 height

  // tops / bots for main shape
  const t = hs.map(h => CY - h)
  const b = hs.map(h => CY + h)

  // Build closed bezier path from 5 (x, yTop) points then reverse along (x, yBot)
  function shape(dTop: number[], dBot: number[]) {
    const top = `
      M ${xs[0]} ${dTop[0]}
      C ${mxs[0]} ${dTop[0]}, ${mxs[0]} ${dTop[1]}, ${xs[1]} ${dTop[1]}
      C ${mxs[1]} ${dTop[1]}, ${mxs[1]} ${dTop[2]}, ${xs[2]} ${dTop[2]}
      C ${mxs[2]} ${dTop[2]}, ${mxs[2]} ${dTop[3]}, ${xs[3]} ${dTop[3]}
      C ${mxs[3]} ${dTop[3]}, ${mxs[3]} ${dTop[4]}, ${xs[4]} ${dTop[4]}`
    const bot = `
      L ${xs[4]} ${dBot[4]}
      C ${mxs[3]} ${dBot[4]}, ${mxs[3]} ${dBot[3]}, ${xs[3]} ${dBot[3]}
      C ${mxs[2]} ${dBot[3]}, ${mxs[2]} ${dBot[2]}, ${xs[2]} ${dBot[2]}
      C ${mxs[1]} ${dBot[2]}, ${mxs[1]} ${dBot[1]}, ${xs[1]} ${dBot[1]}
      C ${mxs[0]} ${dBot[1]}, ${mxs[0]} ${dBot[0]}, ${xs[0]} ${dBot[0]}
      Z`
    return top + bot
  }

  const mainPath  = shape(t, b)
  const echo1Path = shape(hs.map(h => CY - (h + ECHO1)), hs.map(h => CY + (h + ECHO1)))
  const echo2Path = shape(hs.map(h => CY - (h + ECHO2)), hs.map(h => CY + (h + ECHO2)))

  // Conversion rates (stage i vs stage i-1)
  const rates = stages.map((s, i) => {
    if (i === 0) return null
    const prev = stages[i - 1].value
    return prev > 0 ? (s.value / prev) * 100 : 0
  })

  // Zone centers for labels
  const zoneCxs = [70, 210, 350, 490]

  return (
    <svg
      viewBox={`0 0 ${W} 200`}
      style={{ width: '100%', display: 'block', overflow: 'visible' }}
      aria-label="Funil de conversão"
    >
      <defs>
        <linearGradient id="ofg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FF1493" />
          <stop offset="28%"  stopColor="#FF5C8A" />
          <stop offset="65%"  stopColor="#FF8C55" />
          <stop offset="100%" stopColor="#FFD700" />
        </linearGradient>
        <linearGradient id="oe1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FF1493" stopOpacity=".13" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity=".09" />
        </linearGradient>
        <linearGradient id="oe2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FF1493" stopOpacity=".05" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity=".03" />
        </linearGradient>
      </defs>

      {/* Echo layers */}
      <path d={echo2Path} fill="url(#oe2)" />
      <path d={echo1Path} fill="url(#oe1)" />

      {/* Main funnel */}
      <path d={mainPath} fill="url(#ofg)" />

      {/* Stage dividers */}
      {[1, 2, 3].map(i => (
        <line key={i}
          x1={xs[i]} y1={t[i]}
          x2={xs[i]} y2={b[i]}
          stroke="rgba(255,255,255,.40)"
          strokeWidth={1.5}
          strokeDasharray="3 2.5"
        />
      ))}

      {/* % labels inside zones */}
      {stages.map((_, i) => {
        const h = hs[i]
        const cx = zoneCxs[i]
        const labelY = CY + 1
        const rate = i === 0 ? null : rates[i]
        const display = i === 0 ? '100%' : (rate != null ? fmtPct(rate) : '—')
        const fontSize = Math.min(24, Math.max(9, h * 0.55))
        const fits = h >= 11

        if (!fits) return null
        return (
          <text
            key={i}
            x={cx} y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
            fontWeight={700}
            fill={i === 3 ? 'rgba(80,40,0,.85)' : 'rgba(255,255,255,.95)'}
            style={{ fontFamily: 'var(--font)' }}
          >
            {display}
          </text>
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

  const funnelStages = [
    { label: 'Impressões', value: impressions },
    { label: 'Cliques',    value: clicks },
    { label: 'Leads',      value: leads },
    { label: 'Conversões', value: effectiveSales },
  ]

  return (
    <div>
      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Investimento', value: fmt(spend, currency) },
          { label: 'CPM',          value: fmt(cpm, currency) },
          { label: 'CTR',          value: `${ctr.toFixed(2)}%` },
          { label: 'Frequência',   value: frequency.toFixed(1) },
          { label: 'ROAS',         value: effectiveRoas ? `${effectiveRoas.toFixed(2)}x` : '—' },
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

      {/* Organic funnel card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '24px 24px 20px',
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 18 }}>
          Funil de conversão
        </div>

        <OrganicFunnel stages={funnelStages} />

        {/* Stage labels below funnel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 14, textAlign: 'center', gap: 4 }}>
          {[
            { label: 'Impressões', value: fmtN(impressions), sub: null },
            { label: 'Cliques',    value: fmtN(clicks),      sub: `CTR ${ctr.toFixed(2)}%` },
            { label: 'Leads',      value: fmtN(leads),        sub: cpl ? `CPL ${fmt(cpl, currency)}` : null },
            { label: 'Conversões', value: fmtN(effectiveSales), sub: cpv ? `CPV ${fmt(cpv, currency)}` : null },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {item.value || '—'}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 2 }}>
                {item.label}
              </div>
              {item.sub && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {item.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Conversion rates row */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px',
        display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 16,
      }}>
        {[
          { label: 'Imp → Clique',       value: fmtPct(clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0), good: ctr >= 1 },
          { label: 'Clique → Lead',       value: fmtPct(leadRate), good: leadRate >= 3 },
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
