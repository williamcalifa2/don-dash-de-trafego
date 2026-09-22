'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronRight, ArrowDown, ArrowUp } from 'lucide-react'
import { useLeadsData } from '@/lib/leadsContext'
import { buildPerf, leadsInPeriod, norm, type Perf } from '@/lib/leadUtils'
import type { Lead } from '@/lib/leadTypes'
import { usePerformance, type AdPerfRow } from '@/lib/usePerformance'

export interface RetornoNode {
  key: string
  name: string
  perf: Perf
  children: RetornoNode[]
}

/** Cruza o investimento do Meta (por anúncio) com os leads registrados no app. */
export function buildRetorno(rows: AdPerfRow[], leads: Lead[]): { total: Perf; campaigns: RetornoNode[] } {
  const byCampaign = new Map<string, { name: string; spend: number; ads: Map<string, { name: string; spend: number }> }>()

  const campaign = (name: string) => {
    const k = norm(name) || '—'
    if (!byCampaign.has(k)) byCampaign.set(k, { name: name.trim() || 'Sem campanha', spend: 0, ads: new Map() })
    return byCampaign.get(k)!
  }
  const ad = (c: ReturnType<typeof campaign>, name: string) => {
    const k = norm(name) || '—'
    if (!c.ads.has(k)) c.ads.set(k, { name: name.trim() || 'Sem anúncio', spend: 0 })
    return c.ads.get(k)!
  }

  for (const r of rows) {
    const c = campaign(r.campaign_name)
    c.spend += r.spend
    ad(c, r.ad_name).spend += r.spend
  }
  for (const l of leads) ad(campaign(l.campanha ?? ''), l.ad_name ?? '')

  const campaigns: RetornoNode[] = [...byCampaign.entries()].map(([ck, c]) => {
    const cLeads = leads.filter(l => (norm(l.campanha) || '—') === ck)
    const children: RetornoNode[] = [...c.ads.entries()].map(([ak, a]) => ({
      key: `${ck}|${ak}`,
      name: a.name,
      perf: buildPerf(a.spend, cLeads.filter(l => (norm(l.ad_name) || '—') === ak)),
      children: [],
    }))
    return { key: ck, name: c.name, perf: buildPerf(c.spend, cLeads), children }
  })

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0)
  return { total: buildPerf(totalSpend, leads), campaigns }
}

type SortKey = 'spend' | 'leads' | 'vendas' | 'taxa' | 'receita' | 'custoVenda' | 'roas'

const fmtBRL = (v: number | null, digits = 0) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)

export function RetornoTab({ preset, presetLabel }: { preset: string; presetLabel: string }) {
  const { leads, loading: leadsLoading } = useLeadsData()
  const { rows, state, error } = usePerformance(preset)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'receita', dir: 'desc' })

  const periodLeads = useMemo(() => leadsInPeriod(leads, preset), [leads, preset])
  const { total, campaigns } = useMemo(() => buildRetorno(rows, periodLeads), [rows, periodLeads])

  const value = (p: Perf, k: SortKey) => p[k] ?? -1
  const sortNodes = (nodes: RetornoNode[]) =>
    [...nodes].sort((a, b) => (sort.dir === 'desc' ? -1 : 1) * (value(a.perf, sort.key) - value(b.perf, sort.key)) || b.perf.spend - a.perf.spend)

  const bestRoas = Math.max(0, ...campaigns.filter(c => c.perf.vendas > 0).map(c => c.perf.roas ?? 0))

  const lossCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of periodLeads) if (l.status === 'Perdido') counts.set(l.motivo_perda ?? 'Não informado', (counts.get(l.motivo_perda ?? 'Não informado') ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [periodLeads])
  const lossTotal = lossCounts.reduce((s, [, n]) => s + n, 0)

  const kpis = [
    { label: 'Investido',      value: fmtBRL(total.spend) },
    { label: 'Leads',          value: String(total.leads) },
    { label: 'Vendas',         value: String(total.vendas), color: 'var(--green)' },
    { label: 'Receita',        value: fmtBRL(total.receita), color: 'var(--green)' },
    { label: 'Custo por venda', value: fmtBRL(total.custoVenda) },
    { label: 'ROAS real',      value: total.roas ? `${total.roas.toFixed(1).replace('.', ',')}x` : '—' },
  ]

  const cols: { key: SortKey | null; label: string; align?: 'right' }[] = [
    { key: null, label: 'Campanha / anúncio' },
    { key: 'spend', label: 'Investido', align: 'right' },
    { key: 'leads', label: 'Leads', align: 'right' },
    { key: 'vendas', label: 'Vendas', align: 'right' },
    { key: 'taxa', label: 'Lead → venda', align: 'right' },
    { key: 'receita', label: 'Receita', align: 'right' },
    { key: 'custoVenda', label: 'Custo/venda', align: 'right' },
    { key: 'roas', label: 'ROAS', align: 'right' },
  ]

  const cell = (children: React.ReactNode, extra?: React.CSSProperties) => (
    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-soft)', fontVariantNumeric: 'tabular-nums', ...extra }}>{children}</td>
  )

  const renderRow = (n: RetornoNode, level: 0 | 1) => {
    const p = n.perf
    const expandable = level === 0 && n.children.length > 0
    const isOpen = open.has(n.key)
    const best = level === 0 && p.vendas > 0 && p.roas != null && p.roas === bestRoas && campaigns.filter(c => c.perf.vendas > 0).length > 1
    const noSale = p.vendas === 0 && p.leads >= 3
    return (
      <Fragment key={n.key}>
        <tr
          onClick={expandable ? () => setOpen(prev => { const next = new Set(prev); if (next.has(n.key)) next.delete(n.key); else next.add(n.key); return next }) : undefined}
          style={{ cursor: expandable ? 'pointer' : 'default', background: level === 1 ? 'var(--bg-card2)' : undefined, fontSize: level === 1 ? 12 : 14 }}
        >
          <td style={{ padding: `12px 16px 12px ${level === 1 ? 44 : 16}px`, borderBottom: '1px solid var(--border-soft)', maxWidth: 320 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {level === 0 && (
                <ChevronRight size={16} strokeWidth={1.75} color="var(--text-2)"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s', visibility: expandable ? 'visible' : 'hidden', flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: level === 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
              {best && <span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--text-1)' }}>Melhor retorno</span>}
              {noSale && <span className="badge" style={{ background: 'var(--amber-soft)', color: 'var(--text-1)' }}>Leads sem venda</span>}
            </span>
          </td>
          {cell(fmtBRL(p.spend > 0 ? p.spend : null))}
          {cell(p.leads || '—')}
          {cell(p.vendas || '—', { color: p.vendas ? 'var(--green)' : undefined, fontWeight: p.vendas ? 600 : 400 })}
          {cell(p.taxa != null ? `${p.taxa.toFixed(0)}%` : '—')}
          {cell(p.receita ? fmtBRL(p.receita) : '—')}
          {cell(fmtBRL(p.custoVenda))}
          {cell(p.roas ? `${p.roas.toFixed(1).replace('.', ',')}x` : '—')}
        </tr>
        {level === 0 && isOpen && sortNodes(n.children).map(ch => renderRow(ch, 1))}
      </Fragment>
    )
  }

  const loading = state === 'loading' || leadsLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Retorno por campanha e anúncio</h2>
        <p style={{ fontSize: 14, color: 'var(--text-2)' }}>
          Investimento do Meta cruzado com os leads e vendas registrados no app · {presetLabel}
        </p>
      </div>

      <div className="kpi-grid-6 stagger">
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ padding: 16, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, lineHeight: 1.2, whiteSpace: 'nowrap', color: k.color ?? 'var(--text-1)' }}>{loading ? '—' : k.value}</div>
          </div>
        ))}
      </div>

      {state === 'mock' && (
        <div className="card" style={{ padding: 16, fontSize: 14, color: 'var(--text-2)' }}>Conecte a conta do Meta para ver o investimento. Os leads e vendas abaixo já vêm do app.</div>
      )}
      {state === 'error' && (
        <div style={{ padding: 16, background: 'var(--red-soft)', border: '1px solid hsl(0 84% 60% / .3)', borderRadius: 'var(--radius-lg)', color: 'var(--red)', fontSize: 14 }}>
          Não foi possível carregar o investimento do Meta: {error}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860, fontSize: 14 }}>
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c.label} style={{
                    padding: '12px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                    color: 'var(--text-2)', background: 'var(--bg-card2)', textAlign: c.align ?? 'left', whiteSpace: 'nowrap',
                    borderBottom: '1px solid var(--border)', cursor: c.key ? 'pointer' : 'default', userSelect: 'none',
                  }}
                    onClick={c.key ? () => setSort(s => ({ key: c.key!, dir: s.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' })) : undefined}
                    aria-sort={c.key && sort.key === c.key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {c.label}
                      {c.key && sort.key === c.key && (sort.dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortNodes(campaigns).map(c => renderRow(c, 0))}
            </tbody>
          </table>
        </div>
        {!loading && campaigns.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>Sem investimento nem leads neste período.</div>
        )}
        <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-2)', borderTop: '1px solid var(--border-soft)' }}>
          Leads e vendas vêm do app; o cruzamento com o Meta usa o nome da campanha e do anúncio.
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Por que os leads são perdidos</h3>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>Motivos informados nos leads marcados como perdidos · {presetLabel}</p>
        {lossTotal === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Nenhum lead perdido neste período.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lossCounts.map(([reason, n]) => (
              <div key={reason} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr 64px', gap: 12, alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: reason === 'Não informado' ? 'var(--text-2)' : 'var(--text-1)' }}>{reason}</span>
                <div style={{ height: 8, background: 'var(--bg-card2)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ width: `${(n / lossTotal) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 9999 }} />
                </div>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{n} · {Math.round((n / lossTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
