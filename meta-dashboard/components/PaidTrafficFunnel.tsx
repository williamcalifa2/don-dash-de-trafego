'use client'

import { useState } from 'react'

export interface PaidFunnelData {
  impressions: number
  clicks: number
  leads: number
  conversions: number
  spend: number
  revenue?: number
  currency?: string
  /** nome da etapa de resultado e do custo (ex.: 'Conversas Iniciadas' / 'Custo/Conversa') */
  stageLabel?: string
  costLabel?: string
  rateLabel?: string
  goals?: {
    clicks?: number
    leads?: number
    conversions?: number
    cpc?: number
    cpl?: number
    cpv?: number
    convClickLead?: number
    convLeadSale?: number
  }
}

const W = 600
const SVG_H = 200
const MIN_H = 30
const MAX_H = 178

function waveH(v: number, maxV: number): number {
  if (!maxV) return MIN_H
  return MIN_H + (MAX_H - MIN_H) * Math.pow(Math.max(0, v / maxV), 0.36)
}

function fmtN(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}
function fmtC(v: number, cur: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(v)
}
function fmtP(v: number): string { return `${v.toFixed(1).replace('.', ',')}%` }

export function PaidTrafficFunnel({
  impressions, clicks, leads, conversions, spend, revenue, currency = 'BRL', goals, stageLabel = 'Leads Gerados', costLabel = 'CPL', rateLabel = 'Lead',
}: PaidFunnelData) {
  const [hover, setHover] = useState<number | null>(null)

  // Derived metrics
  const ctr  = impressions ? clicks / impressions * 100 : 0
  const lpR  = clicks      ? leads / clicks * 100       : 0
  const slR  = leads       ? conversions / leads * 100  : 0
  const ovR  = impressions ? conversions / impressions * 100 : 0
  const roas = revenue && spend ? revenue / spend : null
  const cpc  = clicks      ? spend / clicks      : null
  const cpl  = leads       ? spend / leads       : null
  const cpa  = conversions ? spend / conversions : null

  // Wave geometry
  const vals = [impressions, clicks, leads, conversions]
  const hs   = vals.map(v => waveH(v, impressions))
  const ys   = hs.map(hi => SVG_H - hi)
  const xs   = [0, 150, 300, 450, W]
  const mxs  = [75, 225, 375, 525]

  // Full wave filled path
  const wavePath = `
    M 0 ${ys[0]}
    C ${mxs[0]} ${ys[0]}, ${mxs[0]} ${ys[1]}, ${xs[1]} ${ys[1]}
    C ${mxs[1]} ${ys[1]}, ${mxs[1]} ${ys[2]}, ${xs[2]} ${ys[2]}
    C ${mxs[2]} ${ys[2]}, ${mxs[2]} ${ys[3]}, ${xs[3]} ${ys[3]}
    L ${W} ${ys[3]} L ${W} ${SVG_H} L 0 ${SVG_H} Z`

  // Per-column clip paths for hover highlight
  const colPaths = [0, 1, 2, 3].map(i => {
    const x0 = xs[i], x1 = xs[i + 1]
    const y0 = ys[i], y1 = i < 3 ? ys[i + 1] : ys[i]
    return `M ${x0} ${y0} C ${mxs[i]} ${y0}, ${mxs[i]} ${y1}, ${x1} ${y1} L ${x1} ${SVG_H} L ${x0} ${SVG_H} Z`
  })

  const stageGoals = [
    undefined,
    goals?.clicks,
    goals?.leads,
    goals?.conversions,
  ]

  // Per-column secondary progress: conversion rate vs goal
  // i=2 (Leads): actual click→lead rate vs goal
  // i=3 (Conversões): actual lead→sale rate vs goal
  const rateGoals: (null | { actual: number; target: number; label: string })[] = [
    null,
    goals?.cpc != null && goals.cpc > 0 && cpc != null
      ? { actual: goals.cpc, target: cpc, label: `CPC: ${fmtC(cpc, currency)} / meta ${fmtC(goals.cpc, currency)}` }
      : null,
    goals?.convClickLead != null && goals.convClickLead > 0
      ? { actual: lpR, target: goals.convClickLead, label: `${fmtP(lpR)} / meta ${fmtP(goals.convClickLead)}` }
      : (goals?.cpl != null && goals.cpl > 0 && cpl != null
        ? { actual: goals.cpl, target: cpl, label: `${costLabel}: ${fmtC(cpl, currency)} / meta ${fmtC(goals.cpl, currency)}` }
        : null),
    goals?.convLeadSale != null && goals.convLeadSale > 0
      ? { actual: slR, target: goals.convLeadSale, label: `${fmtP(slR)} / meta ${fmtP(goals.convLeadSale)}` }
      : (goals?.cpv != null && goals.cpv > 0 && cpa != null
        ? { actual: goals.cpv, target: cpa, label: `CPV: ${fmtC(cpa, currency)} / meta ${fmtC(goals.cpv, currency)}` }
        : null),
  ]

  const stages = [
    { label: 'Impressões'     },
    { label: 'Cliques no Link'},
    { label: stageLabel },
    { label: 'Conversões'     },
  ]

  const trans = [
    { x: xs[1], y: ys[1], label: `${fmtP(ctr)} CTR`    },
    { x: xs[2], y: ys[2], label: `${fmtP(lpR)} ${rateLabel}` },
    { x: xs[3], y: ys[3], label: `${fmtP(slR)} Venda`  },
  ]

  return (
    <>
      <style>{`
        @keyframes pfSlideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pfFade    { from { opacity:0 } to { opacity:1 } }
        .pf-col { animation: pfSlideUp .45s ease both; }
        .pf-col:nth-child(1) { animation-delay:.05s }
        .pf-col:nth-child(2) { animation-delay:.12s }
        .pf-col:nth-child(3) { animation-delay:.19s }
        .pf-col:nth-child(4) { animation-delay:.26s }
        .pf-wave { animation: pfFade .6s ease .1s both; }
        .pf-badge { animation: pfSlideUp .4s ease both; }
        .pf-badge:nth-child(1) { animation-delay:.35s }
        .pf-badge:nth-child(2) { animation-delay:.42s }
        .pf-badge:nth-child(3) { animation-delay:.49s }
        @media (prefers-reduced-motion: reduce) { .pf-col, .pf-wave, .pf-badge { animation: none; } }
        @media (max-width: 640px) { .pf-head { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>

      {/* Main card wrapper */}
      <div style={{ position: 'relative' }}>

        {/* ── Main card ── */}
        <div className="card" style={{ overflow: 'hidden' }}>

          {/* Header — 4 columns */}
          <div className="pf-head" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {stages.map((s, i) => (
              <div key={i} className="pf-col" style={{
                textAlign: 'center',
                padding: '24px 12px 20px',
                borderRight: i < 3 ? '1px solid var(--border-soft)' : 'none',
                opacity: hover !== null && hover !== i ? 0.4 : 1,
                transition: 'opacity .18s',
                cursor: 'default',
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--text-2)',
                  marginBottom: 6,
                }}>
                  {s.label}
                </div>
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '-0.5px',
                  color: 'var(--text-1)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}>
                  {fmtN(vals[i])}
                </div>
                {stageGoals[i] != null && stageGoals[i]! > 0 && (() => {
                  const pct = Math.min(1, vals[i] / stageGoals[i]!)
                  const over = pct >= 1
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: over ? 'var(--green)' : 'var(--text-2)', marginBottom: 4, textAlign: 'center' }}>
                        {fmtN(vals[i])} / {fmtN(stageGoals[i]!)}
                        <span style={{ color: over ? 'var(--green)' : 'var(--accent-dim)', marginLeft: 4 }}>{Math.round(pct * 100)}%</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-card2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${Math.min(100, pct * 100)}%`,
                          background: over ? 'var(--green)' : 'linear-gradient(90deg, var(--accent-dim), var(--accent))',
                          transition: 'width .4s ease',
                        }} />
                      </div>
                    </div>
                  )
                })()}
                {rateGoals[i] != null && (() => {
                  const rg = rateGoals[i]!
                  const pct = Math.min(1, rg.actual / rg.target)
                  const onTarget = rg.actual >= rg.target
                  return (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-2)', marginBottom: 3, textAlign: 'center', lineHeight: 1.3 }}>
                        {rg.label}
                      </div>
                      <div style={{ height: 3, background: 'var(--bg-card2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2,
                          width: `${Math.min(100, pct * 100)}%`,
                          background: onTarget ? 'var(--green)' : 'var(--amber)',
                          transition: 'width .4s ease',
                        }} />
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>

          {/* Wave SVG */}
          <div className="pf-wave" style={{ position: 'relative' }}>
            {/* ── Floating ROAS card ── */}
            <div style={{
              position: 'absolute', top: 10, right: 12, zIndex: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '8px 14px',
              boxShadow: 'var(--shadow-elegant)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', color: 'var(--accent-dim)', textTransform: 'uppercase' }}>Retorno Geral</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.3px', margin: '2px 0 1px', fontVariantNumeric: 'tabular-nums' }}>
                {roas ? `ROAS ${roas.toFixed(1)}x` : fmtP(ovR)}
              </div>
            </div>
            <svg
              viewBox={`0 0 ${W} ${SVG_H}`}
              style={{ width: '100%', display: 'block', overflow: 'visible' }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="pfMainGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   style={{ stopColor: 'var(--accent-dim)' }} />
                  <stop offset="26%"  style={{ stopColor: 'var(--accent)' }} />
                  <stop offset="54%"  style={{ stopColor: 'color-mix(in srgb, var(--accent) 55%, var(--bg-card))' }} />
                  <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--accent) 22%, var(--bg-card))' }} />
                </linearGradient>
                <linearGradient id="pfShimmer" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"  stopColor="#fff" stopOpacity=".18" />
                  <stop offset="60%" stopColor="#fff" stopOpacity=".04" />
                  <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d={wavePath} fill="url(#pfMainGrad)" />
              <path d={wavePath} fill="url(#pfShimmer)" />

              {colPaths.map((d, i) => (
                <path key={i} d={d}
                  fill={hover === i ? 'rgba(255,255,255,.14)' : 'transparent'}
                  style={{ cursor: 'pointer', transition: 'fill .16s' }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              ))}

              {[1, 2, 3].map(i => (
                <line key={i}
                  x1={xs[i]} y1={ys[i]}
                  x2={xs[i]} y2={SVG_H}
                  stroke="rgba(255,255,255,.45)"
                  strokeWidth={1.5}
                />
              ))}

              {trans.map((t, i) => {
                const bw = Math.round(t.label.length * 5.4 + 24), bh = 19
                const bx = t.x, by = t.y
                return (
                  <g key={i} className="pf-badge">
                    <rect
                      x={bx - bw / 2} y={by - bh - 8}
                      width={bw} height={bh} rx={11}
                      fill="var(--bg-card)" stroke="var(--border)" strokeWidth={1}
                      style={{ filter: 'drop-shadow(0 2px 8px hsl(231 52% 40% / .18))' }}
                    />
                    <text
                      x={bx} y={by - 8 - bh / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} fontWeight={700} fill="var(--text-1)"
                      style={{ fontFamily: 'var(--font)' }}
                    >
                      {t.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    </>
  )
}
