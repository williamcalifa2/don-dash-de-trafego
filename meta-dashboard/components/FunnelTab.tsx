'use client'

import { useState, useEffect } from 'react'
import type { MetricsSummary } from '@/lib/meta'

interface FunnelTabProps {
  summary: MetricsSummary
  currency: string
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

export function FunnelTab({ summary, currency }: FunnelTabProps) {
  const { impressions, clicks, leads, purchases, purchase_value, spend, reach, cpm, ctr, frequency } = summary
  const hasPurchases = purchases > 0

  const [manualSales, setManualSales] = useState(0)
  const [manualRevenue, setManualRevenue] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draftSales, setDraftSales] = useState('')
  const [draftRevenue, setDraftRevenue] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('funnel_manual')
      if (saved) {
        const { sales, revenue } = JSON.parse(saved)
        setManualSales(Number(sales) || 0)
        setManualRevenue(Number(revenue) || 0)
      }
    } catch {}
  }, [])

  function saveManual() {
    const sales = Math.max(0, Number(draftSales) || 0)
    const revenue = Math.max(0, Number(draftRevenue) || 0)
    setManualSales(sales)
    setManualRevenue(revenue)
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

  const stages = [
    {
      key: 'clicks',
      label: 'Cliques',
      value: clicks,
      pct: 100,
      color: 'hsl(172 55% 45%)',
      glow: 'hsl(172 55% 45% / .18)',
      cost: cpc ? fmt(cpc, currency) : null,
      costLabel: 'CPC',
      extra: `CTR ${fmtPct(ctr)}`,
    },
    {
      key: 'leads',
      label: 'Leads',
      value: leads,
      pct: clicks > 0 ? (leads / clicks) * 100 : 0,
      color: 'hsl(38 92% 55%)',
      glow: 'hsl(38 92% 55% / .18)',
      cost: cpl ? fmt(cpl, currency) : null,
      costLabel: 'CPL',
      extra: null,
    },
    {
      key: 'closings',
      label: 'Fechamentos',
      value: effectiveSales,
      pct: clicks > 0 ? (effectiveSales / clicks) * 100 : 0,
      color: 'hsl(233 100% 75%)',
      glow: 'hsl(233 100% 75% / .18)',
      cost: cpv ? fmt(cpv, currency) : null,
      costLabel: 'Custo/venda',
      extra: effectiveRevenue > 0 ? `Receita ${fmt(effectiveRevenue, currency)}` : null,
      manual: !hasPurchases,
    },
  ]

  const convRates = [
    { value: fmtPct(leadRate), label: 'clique → lead', good: leadRate >= 3 },
    ...(closeRate != null ? [{ value: fmtPct(closeRate), label: 'lead → fechamento', good: closeRate >= 5 }] : []),
  ]

  return (
    <div>
      {/* Top KPIs */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24,
      }}>
        {[
          { label: 'Investimento', value: fmt(spend, currency) },
          { label: 'Impressões', value: fmtN(impressions) },
          { label: 'CPM', value: fmt(cpm, currency) },
          { label: 'Frequência', value: frequency.toFixed(1) },
          { label: 'ROAS', value: effectiveRoas ? `${effectiveRoas.toFixed(2)}x` : '—' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--text-3)', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        {stages.map((stage, i) => (
          <div key={stage.key}>
            {/* Conversion rate separator */}
            {i > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 28px',
                borderTop: '1px solid var(--border-soft)',
                borderBottom: '1px solid var(--border-soft)',
                background: 'var(--bg)',
              }}>
                <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
                  <path d="M6 0v12M2 9l4 5 4-5" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{
                  fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)',
                  color: convRates[i - 1]?.good ? 'var(--green)' : 'var(--red)',
                }}>
                  {convRates[i - 1]?.value}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{convRates[i - 1]?.label}</span>
              </div>
            )}

            {/* Stage row */}
            <div style={{ padding: '20px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
                    textTransform: 'uppercase' as const, color: stage.color,
                  }}>
                    {stage.label}
                    {stage.manual && (
                      <span style={{ fontWeight: 400, color: 'var(--text-3)', letterSpacing: 0, textTransform: 'none' as const, marginLeft: 6 }}>
                        · manual
                      </span>
                    )}
                  </span>
                  {stage.extra && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{stage.extra}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                  {stage.cost && (
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {stage.costLabel}: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-2)', fontWeight: 600 }}>{stage.cost}</span>
                    </span>
                  )}
                  {stage.key === 'closings' && !hasPurchases && (
                    <button
                      onClick={() => { setDraftSales(String(manualSales || '')); setDraftRevenue(String(manualRevenue || '')); setEditing(true) }}
                      style={{
                        fontSize: 11, fontWeight: 600, color: stage.color,
                        background: 'transparent', border: `1px solid ${stage.color}44`,
                        borderRadius: 'var(--radius-sm)', padding: '3px 10px', cursor: 'pointer',
                        fontFamily: 'var(--font)',
                      }}
                    >
                      {effectiveSales > 0 ? 'Editar' : '+ Adicionar'}
                    </button>
                  )}
                </div>
              </div>

              {/* Edit form */}
              {editing && stage.key === 'closings' ? (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Fechamentos</label>
                      <input type="number" min={0} value={draftSales} onChange={e => setDraftSales(e.target.value)} placeholder="0" style={{
                        width: '100%', padding: '10px 14px',
                        background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--text-1)',
                        fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, outline: 'none',
                      }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Receita (R$)</label>
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
                      background: stage.color, border: 'none',
                      borderRadius: 'var(--radius-sm)', color: '#0d0d0d', fontFamily: 'var(--font)',
                    }}>Salvar</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  {/* Number */}
                  <div style={{
                    fontSize: 40, fontWeight: 700, fontFamily: 'var(--mono)',
                    color: 'var(--text-1)', letterSpacing: '-2px', lineHeight: 1,
                    minWidth: 120, flexShrink: 0,
                  }}>
                    {stage.value > 0 ? fmtN(stage.value) : '—'}
                  </div>

                  {/* Bar */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    <div style={{
                      height: 36, borderRadius: 6, background: 'var(--bg)',
                      overflow: 'hidden', position: 'relative' as const,
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.max(stage.pct, stage.value > 0 ? 1 : 0)}%`,
                        background: `linear-gradient(90deg, ${stage.color}, ${stage.color}aa)`,
                        borderRadius: 6,
                        boxShadow: `0 0 16px ${stage.glow}`,
                        transition: 'width .6s cubic-bezier(.4,0,.2,1)',
                        position: 'relative' as const,
                      }}>
                        {stage.pct >= 8 && (
                          <span style={{
                            position: 'absolute' as const, right: 10, top: '50%', transform: 'translateY(-50%)',
                            fontSize: 11, fontWeight: 700, color: '#000', opacity: 0.7,
                            fontFamily: 'var(--mono)',
                          }}>
                            {fmtPct(stage.pct)}
                          </span>
                        )}
                      </div>
                    </div>
                    {stage.pct < 8 && stage.value > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{fmtPct(stage.pct)} do total de cliques</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Overall conversion */}
        {overallRate != null && (
          <div style={{
            borderTop: '1px solid var(--border-soft)',
            padding: '14px 28px',
            background: 'var(--bg)',
            display: 'flex', gap: 32, flexWrap: 'wrap' as const,
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--text-3)', marginBottom: 2 }}>Conversão geral</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{fmtPct(overallRate)} <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>clique → fechamento</span></div>
            </div>
            {effectiveRevenue > 0 && effectiveSales > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--text-3)', marginBottom: 2 }}>Ticket médio</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{fmt(effectiveRevenue / effectiveSales, currency)}</div>
              </div>
            )}
            {effectiveRoas && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--text-3)', marginBottom: 2 }}>ROAS</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: effectiveRoas >= 3 ? 'var(--green)' : 'var(--amber)' }}>{effectiveRoas.toFixed(2)}x</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
