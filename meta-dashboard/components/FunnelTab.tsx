'use client'

import { useState, useEffect } from 'react'
import type { MetricsSummary } from '@/lib/meta'
import { PaidTrafficFunnel } from './PaidTrafficFunnel'
import { useLeadsData as useLeads } from '@/lib/leadsContext'
import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'
import { apiFetch } from '@/lib/apiFetch'
import { Settings } from 'lucide-react'

interface FunnelTabProps {
  summary: MetricsSummary
  currency: string
  clientSlug?: string
  tv?: boolean
  kind?: ResultKind
}

function fmt(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v)
}
function fmtPct(v: number) { return v.toFixed(1).replace('.', ',') + '%' }

export function FunnelTab({ summary, currency, clientSlug = 'dal-moro', tv = false, kind = 'form' }: FunnelTabProps) {
  const L = KIND_LABELS[kind]
  // Em clientes de site/conversas, a etapa do meio é o resultado real da conta (conversas, leads do site ou resultados).
  const leads = kind === 'form' ? summary.leads : summary.results
  const { impressions, clicks, purchases, purchase_value, spend, ctr } = summary
  const hasPurchases = purchases > 0

  // Pull converted count from Supabase leads
  const { leads: allLeads } = useLeads()
  const supabaseConverted = allLeads.filter(l => l.status === 'Convertido').length
  const supabaseRevenue   = allLeads.reduce((s, l) => s + (l.status === 'Convertido' ? (l.valor_pedido ?? 0) : 0), 0)
  const hasSupabaseData   = supabaseConverted > 0

  const [manualSales, setManualSales] = useState(0)
  const [manualRevenue, setManualRevenue] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draftSales, setDraftSales] = useState('')
  const [draftRevenue, setDraftRevenue] = useState('')

  const [goals, setGoals] = useState({
    clicks: 0, leads: 0, conversions: 0,
    cpc: 0, cpl: 0, cpv: 0,
    convClickLead: 0, convLeadSale: 0,
  })
  const [editingGoals, setEditingGoals] = useState(false)
  const [draftGoals, setDraftGoals] = useState({
    clicks: '', leads: '', conversions: '',
    cpc: '', cpl: '', cpv: '',
    convClickLead: '', convLeadSale: '',
  })

  const hasSupabase = typeof window !== 'undefined' && !!(process.env.NEXT_PUBLIC_SUPABASE_URL)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('funnel_goals')
      if (saved) setGoals(JSON.parse(saved))
    } catch {}
  }, [])

  function saveGoals() {
    const g = {
      clicks: Math.max(0, Number(draftGoals.clicks) || 0),
      leads: Math.max(0, Number(draftGoals.leads) || 0),
      conversions: Math.max(0, Number(draftGoals.conversions) || 0),
      cpc: Math.max(0, Number(draftGoals.cpc) || 0),
      cpl: Math.max(0, Number(draftGoals.cpl) || 0),
      cpv: Math.max(0, Number(draftGoals.cpv) || 0),
      convClickLead: Math.max(0, Number(draftGoals.convClickLead) || 0),
      convLeadSale: Math.max(0, Number(draftGoals.convLeadSale) || 0),
    }
    setGoals(g)
    try { localStorage.setItem('funnel_goals', JSON.stringify(g)) } catch {}
    setEditingGoals(false)
  }

  useEffect(() => {
    async function load() {
      if (hasSupabase) {
        try {
          const res = await apiFetch('/api/fechamentos')
          const { rows = [] } = await res.json() as { rows?: { count: number; revenue: number }[] }
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
      try {
        await apiFetch('/api/fechamentos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: today, count: sales, revenue }),
        })
      } catch {}
    }
    try { localStorage.setItem('funnel_manual', JSON.stringify({ sales, revenue })) } catch {}
    setEditing(false)
  }

  const effectiveSales   = hasPurchases ? purchases      : hasSupabaseData ? supabaseConverted : manualSales
  const effectiveRevenue = hasPurchases ? purchase_value : hasSupabaseData ? supabaseRevenue   : manualRevenue

  const cpc = clicks > 0 ? spend / clicks : null
  const cpl = leads > 0 ? spend / leads : null
  const cpv = effectiveSales > 0 ? spend / effectiveSales : null
  const leadRate = clicks > 0 ? (leads / clicks) * 100 : 0
  const closeRate = leads > 0 && effectiveSales > 0 ? (effectiveSales / leads) * 100 : null
  const overallRate = clicks > 0 && effectiveSales > 0 ? (effectiveSales / clicks) * 100 : null

  const openGoals = () => {
    setDraftGoals({
      clicks: String(goals.clicks || ''),
      leads: String(goals.leads || ''),
      conversions: String(goals.conversions || ''),
      cpc: String(goals.cpc || ''),
      cpl: String(goals.cpl || ''),
      cpv: String(goals.cpv || ''),
      convClickLead: String(goals.convClickLead || ''),
      convLeadSale: String(goals.convLeadSale || ''),
    })
    setEditingGoals(true)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px',
    background: 'var(--bg)', border: '1px solid var(--border-input)',
    borderRadius: 'var(--radius)', color: 'var(--text-1)',
    fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
    textTransform: 'uppercase', color: 'var(--text-2)',
    display: 'block', marginBottom: 6,
  }
  const sectionHeadStyle: React.CSSProperties = {
    fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
    marginBottom: 12, paddingBottom: 8,
    borderBottom: '1px solid var(--border-soft)',
  }

  return (
    <div>
      {/* Paid Traffic Funnel — gear icon positioned top-right */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <PaidTrafficFunnel
          impressions={impressions}
          clicks={clicks}
          leads={leads}
          stageLabel={L.stage}
          costLabel={L.cost}
          rateLabel={kind === 'conversa' ? 'Conversa' : kind === 'misto' ? 'Resultado' : 'Lead'}
          conversions={effectiveSales}
          spend={spend}
          revenue={effectiveRevenue > 0 ? effectiveRevenue : undefined}
          currency={currency}
          goals={Object.values(goals).some(v => v > 0) ? goals : undefined}
        />
        {!tv && <button
          onClick={openGoals}
          title="Configurar metas"
          aria-label="Configurar metas"
          className="btn btn-outline btn-icon btn-sm"
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 11 }}
        >
          <Settings size={16} strokeWidth={1.75} />
        </button>}
      </div>

      {/* Goals config panel — slides in below funnel */}
      {editingGoals && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>Configurar metas do período</div>
            <button onClick={() => setEditingGoals(false)} aria-label="Fechar" title="Fechar" className="btn btn-ghost btn-icon btn-sm" style={{ fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {/* Section 1 — Volume */}
          <div style={sectionHeadStyle}>1. Volume esperado</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {([
              { key: 'clicks' as const, label: 'Meta de Cliques' },
              { key: 'leads' as const, label: `Meta de ${L.many}` },
              { key: 'conversions' as const, label: 'Meta de Conversões' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input type="number" min={0} value={draftGoals[key]}
                  onChange={e => setDraftGoals(g => ({ ...g, [key]: e.target.value }))}
                  placeholder="0" style={inputStyle} />
              </div>
            ))}
          </div>

          {/* Section 2 — Cost targets */}
          <div style={sectionHeadStyle}>2. Meta de custo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {([
              { key: 'cpc' as const, label: 'CPC meta (R$)' },
              { key: 'cpl' as const, label: `${L.cost} meta (R$)` },
              { key: 'cpv' as const, label: 'CPV meta (R$)' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input type="number" min={0} step="0.01" value={draftGoals[key]}
                  onChange={e => setDraftGoals(g => ({ ...g, [key]: e.target.value }))}
                  placeholder="0" style={inputStyle} />
              </div>
            ))}
          </div>

          {/* Section 3 — Conversion rate targets */}
          <div style={sectionHeadStyle}>3. Taxas de conversão esperadas</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            {([
              { key: 'convClickLead' as const, label: `${L.clickTo} (%)` },
              { key: 'convLeadSale' as const, label: `${kind === 'conversa' ? 'Conversa' : kind === 'misto' ? 'Resultado' : 'Lead'} → Venda (%)` },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input type="number" min={0} max={100} step="0.1" value={draftGoals[key]}
                  onChange={e => setDraftGoals(g => ({ ...g, [key]: e.target.value }))}
                  placeholder="0" style={inputStyle} />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditingGoals(false)} className="btn btn-outline">Cancelar</button>
            <button onClick={saveGoals} className="btn btn-primary">Salvar metas</button>
          </div>
        </div>
      )}

      {/* Conversion rates row */}
      <div className="card" style={{
        padding: '16px 24px',
        display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 16,
      }}>
        {[
          { label: 'Imp → Clique',       value: fmtPct(clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0), good: ctr >= 1 },
          { label: L.clickTo,       value: fmtPct(leadRate), good: goals.convClickLead > 0 ? leadRate >= goals.convClickLead : leadRate >= 3 },
          ...(closeRate != null ? [{ label: `${kind === 'conversa' ? 'Conversa' : kind === 'misto' ? 'Resultado' : 'Lead'} → Fechamento`, value: fmtPct(closeRate), good: goals.convLeadSale > 0 ? closeRate >= goals.convLeadSale : closeRate >= 5 }] : []),
          ...(overallRate != null ? [{ label: 'Clique → Fechamento', value: fmtPct(overallRate), good: overallRate >= 1 }] : []),
        ].map(r => (
          <div key={r.label}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>{r.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: r.good ? 'var(--green)' : 'var(--red)' }}>{r.value}</div>
          </div>
        ))}
        {effectiveRevenue > 0 && effectiveSales > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>Ticket médio</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)' }}>{fmt(effectiveRevenue / effectiveSales, currency)}</div>
          </div>
        )}
        {goals.cpc > 0 && cpc != null && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>CPC real / meta</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: cpc <= goals.cpc ? 'var(--green)' : 'var(--red)' }}>
              {fmt(cpc, currency)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)' }}>/ {fmt(goals.cpc, currency)}</span>
            </div>
          </div>
        )}
        {goals.cpl > 0 && cpl != null && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>{L.cost} real / meta</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: cpl <= goals.cpl ? 'var(--green)' : 'var(--red)' }}>
              {fmt(cpl, currency)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)' }}>/ {fmt(goals.cpl, currency)}</span>
            </div>
          </div>
        )}
        {goals.cpv > 0 && cpv != null && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>CPV real / meta</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: cpv <= goals.cpv ? 'var(--green)' : 'var(--red)' }}>
              {fmt(cpv, currency)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)' }}>/ {fmt(goals.cpv, currency)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Manual sales — hidden when Supabase data is available */}
      {!tv && !hasPurchases && !hasSupabaseData && (
        <div className="card" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editing ? 16 : 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              Conversões manuais
              {effectiveSales > 0 && (
                <span style={{ marginLeft: 10, color: 'var(--text-2)', fontSize: 14, fontWeight: 500 }}>
                  {effectiveSales} fechamentos{effectiveRevenue > 0 ? ` · ${fmt(effectiveRevenue, currency)}` : ''}
                </span>
              )}
            </div>
            <button
              onClick={() => { setDraftSales(String(manualSales || '')); setDraftRevenue(String(manualRevenue || '')); setEditing(!editing) }}
              className="btn btn-soft btn-sm"
            >
              {effectiveSales > 0 ? 'Editar' : '+ Adicionar'}
            </button>
          </div>

          {editing && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Fechamentos</label>
                  <input type="number" min={0} value={draftSales} onChange={e => setDraftSales(e.target.value)} placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Receita (R$)</label>
                  <input type="number" min={0} value={draftRevenue} onChange={e => setDraftRevenue(e.target.value)} placeholder="0" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(false)} className="btn btn-outline btn-sm">Cancelar</button>
                <button onClick={saveManual} className="btn btn-primary btn-sm">Salvar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
