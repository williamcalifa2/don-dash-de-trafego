'use client'

import { useState, useMemo } from 'react'
import { Check, Download } from 'lucide-react'
import type { MetricsSummary } from '@/lib/meta'

interface SimuladorTabProps {
  summary?: MetricsSummary
  currency?: string
}

function fmtBRL(v: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v)
}
function fmtN(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v < 1 ? v.toFixed(1) : String(Math.round(v))
}
function fmtPct(v: number, decimals = 1) {
  return v.toFixed(decimals).replace('.', ',') + '%'
}

interface SimParams {
  budget: number
  cpc: number
  convClickLead: number
  convLeadSale: number
  ticket: number
}

function calc(p: SimParams) {
  const clicks = p.cpc > 0 ? p.budget / p.cpc : 0
  const leads = clicks * (p.convClickLead / 100)
  const sales = leads * (p.convLeadSale / 100)
  const revenue = sales * p.ticket
  const cpl = leads > 0 ? p.budget / leads : 0
  const cpv = sales > 0 ? p.budget / sales : 0
  return { clicks, leads, sales, revenue, cpl, cpv }
}

interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  accent?: string
}

function SliderField({ label, value, min, max, step, format, onChange, accent = 'var(--accent)' }: SliderFieldProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.5px' }}>{format(value)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--bg-card2)', borderRadius: 9999 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, pct)}%`, background: accent, borderRadius: 9999, transition: 'width .1s' }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', margin: 0 }}
        />
      </div>
    </div>
  )
}

function NumberInput({ label, value, step, prefix, onChange }: { label: string; value: number; step: number; prefix?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6 }}>{label}</div>
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', pointerEvents: 'none' }}>{prefix}</span>}
        <input
          type="number" min={0} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            width: '100%', height: 40, padding: prefix ? '0 12px 0 34px' : '0 12px',
            background: 'var(--bg)', border: '1px solid var(--border-input)',
            borderRadius: 'var(--radius)', color: 'var(--text-1)',
            fontSize: 14, fontWeight: 600,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  )
}

function FunnelBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 90, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', textAlign: 'right', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{ height: 32, background: 'var(--bg-card2)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`, background: color,
            borderRadius: 9999, transition: 'width .3s ease',
            display: 'flex', alignItems: 'center', paddingLeft: 10,
          }}>
            {pct > 12 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtN(value)}</span>
            )}
          </div>
        </div>
        {pct <= 12 && (
          <span style={{ position: 'absolute', left: `calc(${pct}% + 14px)`, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{fmtN(value)}</span>
        )}
      </div>
      {sub && <div style={{ width: 80, fontSize: 10, color: 'var(--text-2)', textAlign: 'right', flexShrink: 0 }}>{sub}</div>}
    </div>
  )
}

const SCENARIOS = [
  { label: 'Conservador', factor: 0.70, accent: 'var(--amber)' },
  { label: 'Projetado',   factor: 1.00, accent: 'var(--accent)' },
  { label: 'Otimista',    factor: 1.30, accent: 'var(--green)' },
]

function MetricRow({ label, values, format, highlight }: { label: string; values: number[]; format: (v: number) => string; highlight?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'var(--scen-cols)', gap: 0, padding: '9px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: highlight ? 700 : 400, display: 'flex', alignItems: 'center' }}>{label}</div>
      {values.map((v, i) => (
        <div key={i} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: highlight ? SCENARIOS[i].accent : 'var(--text-1)' }}>
          {format(v)}
        </div>
      ))}
    </div>
  )
}

export function SimuladorTab({ summary, currency = 'BRL' }: SimuladorTabProps) {
  const defaultFromReal = useMemo<SimParams>(() => {
    if (!summary) return { budget: 10000, cpc: 18, convClickLead: 15, convLeadSale: 10, ticket: 3500 }
    return {
      budget: Math.round(summary.spend || 10000),
      cpc: summary.cpc ? Math.round(summary.cpc * 10) / 10 : 18,
      convClickLead: summary.clicks && summary.leads ? Math.round((summary.leads / summary.clicks) * 100 * 10) / 10 : 15,
      convLeadSale: 10,
      ticket: 3500,
    }
  }, [summary])

  const [p, setP] = useState<SimParams>(defaultFromReal)
  const [prefilled, setPrefilled] = useState(false)

  function set(key: keyof SimParams) {
    return (v: number) => setP(prev => ({ ...prev, [key]: v }))
  }

  function prefillFromReal() {
    setP(defaultFromReal)
    setPrefilled(true)
    setTimeout(() => setPrefilled(false), 2500)
  }

  const r = calc(p)
  const scenarioResults = SCENARIOS.map(sc => calc({ ...p, convClickLead: p.convClickLead * sc.factor, convLeadSale: p.convLeadSale * sc.factor }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>Simulador de Performance</div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 2 }}>Ajuste os parâmetros e veja o impacto em tempo real</div>
        </div>
        {summary && (
          <button onClick={prefillFromReal} className="btn btn-soft btn-sm"
            style={prefilled ? { background: 'var(--green)', color: '#fff' } : undefined}>
            {prefilled ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} strokeWidth={2.2} /> Dados preenchidos
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Download size={14} strokeWidth={2} /> Pré-preencher com dados reais
              </span>
            )}
          </button>
        )}
      </div>

      {/* Main grid */}
      <div className="sim-grid">

        {/* Inputs */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Parâmetros</div>

          {/* Verba + Ticket lado a lado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <NumberInput label="Verba mensal" value={p.budget} step={500} prefix="R$" onChange={set('budget')} />
            <NumberInput label="Ticket médio" value={p.ticket} step={100} prefix="R$" onChange={set('ticket')} />
          </div>

          <SliderField label="CPC médio" value={p.cpc} min={1} max={150} step={0.5} format={v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} onChange={set('cpc')} />
          <SliderField label="Taxa Clique → Lead" value={p.convClickLead} min={0.5} max={50} step={0.5} format={v => fmtPct(v)} onChange={set('convClickLead')} accent="var(--accent-dim)" />
          <SliderField label="Taxa Lead → Venda" value={p.convLeadSale} min={0.5} max={50} step={0.5} format={v => fmtPct(v)} onChange={set('convLeadSale')} accent="var(--green)" />
        </div>

        {/* Funnel + Receita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Funil bars */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>Funil estimado</div>
            <FunnelBar label="Cliques" value={r.clicks} max={r.clicks} color="var(--accent)" sub={`CPC ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.cpc)}`} />
            <FunnelBar label="Leads"   value={r.leads}  max={r.clicks} color="var(--accent-dim)" sub={`CPL ${fmtBRL(r.cpl, currency)}`} />
            <FunnelBar label="Vendas"  value={r.sales}  max={r.clicks} color="var(--green)" sub={`CPV ${fmtBRL(r.cpv, currency)}`} />
          </div>

          {/* Receita — single prominent tile */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6 }}>Receita estimada</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{fmtBRL(r.revenue, currency)}</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 2 }}>CPL</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{fmtBRL(r.cpl, currency)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 2 }}>CPV</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{fmtBRL(r.cpv, currency)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 2 }}>Vendas est.</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{fmtN(r.sales)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario comparison */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 16 }}>
          Análise de cenários
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-2)', marginLeft: 10, textTransform: 'none', letterSpacing: 0 }}>
            Conservador ×0,7 · Projetado: taxas atuais · Otimista ×1,3
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--scen-cols)', gap: 0, marginBottom: 8 }}>
          <div />
          {SCENARIOS.map(sc => (
            <div key={sc.label} className="scen-h" style={{ textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', color: sc.accent, paddingBottom: 6, borderBottom: `2px solid ${sc.accent}` }}>
              {sc.label}
            </div>
          ))}
        </div>
        <MetricRow label="Leads"   values={scenarioResults.map(r => r.leads)}   format={v => fmtN(v)} />
        <MetricRow label="Vendas"  values={scenarioResults.map(r => r.sales)}   format={v => fmtN(v)} />
        <MetricRow label="CPL"     values={scenarioResults.map(r => r.cpl)}     format={v => fmtBRL(v, currency)} />
        <MetricRow label="CPV"     values={scenarioResults.map(r => r.cpv)}     format={v => fmtBRL(v, currency)} />
        <MetricRow label="Receita" values={scenarioResults.map(r => r.revenue)} format={v => fmtBRL(v, currency)} highlight />
      </div>

      {/* Benchmarks */}
      <div className="card" style={{ padding: '16px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 12 }}>Benchmarks Meta Ads 2026</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {[
            { label: 'CTR médio geral',              value: '1,58%' },
            { label: 'CTR lead gen',                 value: '2,59%' },
            { label: 'Conv. Clique→Lead (saúde)',    value: '11–14%' },
            { label: 'Conv. Clique→Lead (educação)', value: '13–16%' },
            { label: 'Conv. Clique→Lead (média)',    value: '7,72%' },
            { label: 'CPL saúde (R$)',               value: '30–150' },
          ].map(b => (
            <div key={b.label}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 2 }}>{b.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{b.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
