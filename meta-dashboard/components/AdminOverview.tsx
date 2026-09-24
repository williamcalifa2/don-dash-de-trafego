'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { MetricTile } from './MetricTile'
import { PulseLoader } from '@/components/PulseLoader'
import { DailyChart } from './DailyChart'
import type { Overview } from '@/lib/adminOverview'
import type { AdminPeriod } from '@/lib/periods'

const brl = (v: number, d = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : String(Math.round(v)))
const pct = (v: number) => `${v.toFixed(2)}%`
const div = (a: number, b: number) => (b > 0 ? a / b : null)

/** Métricas de todos os clientes somadas, no mesmo estilo do painel de cada cliente. */
export default function AdminOverview({ days, refreshKey = 0, clients = [], actions }: { days: AdminPeriod; refreshKey?: number; clients?: Array<{ slug: string; name: string }>; /** botões no fim da linha (período e atualizar tudo) */ actions?: React.ReactNode }) {
  const [client, setClient] = useState('')
  const [open, setOpen] = useState(true)
  const [o, setO] = useState<Overview | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => { try { setOpen(localStorage.getItem('adminOverviewOpen') !== '0') } catch {} }, [])
  const toggle = () => setOpen(v => { try { localStorage.setItem('adminOverviewOpen', v ? '0' : '1') } catch {} return !v })

  useEffect(() => {
    if (!open) return
    let alive = true
    setError(false)
    fetch(`/api/admin/overview?period=${days}${client ? `&client=${encodeURIComponent(client)}` : ''}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((j: Overview) => { if (alive) setO(j) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [days, open, client, refreshKey])

  const t = o?.totals, p = o?.prev
  const cost = t ? div(t.spend, t.results) : null
  const costPrev = p ? div(p.spend, p.results) : null
  const ctr = t ? div(t.clicks * 100, t.impressions) : null
  const cpm = t ? div(t.spend * 1000, t.impressions) : null
  const perDay = (num: number[], den: number[], k = 1) => num.map((n, i) => (den[i] > 0 ? (n * k) / den[i] : 0))

  const tiles = o && t ? [
    { label: 'Investimento', value: brl(t.spend), spark: o.spend, cur: t.spend, prev: p?.spend },
    { label: 'Resultados', value: compact(t.results), spark: o.results, cur: t.results, prev: p?.results },
    { label: 'Custo/Resultado', value: cost != null ? brl(cost, 2) : '—', spark: perDay(o.spend, o.results), cur: cost, prev: costPrev, lower: true },
    { label: 'Cliques', value: compact(t.clicks), spark: o.clicks, cur: t.clicks, prev: p?.clicks },
    { label: 'Impressões', value: compact(t.impressions), spark: o.impressions, cur: t.impressions, prev: p?.impressions },
    { label: 'CTR', value: ctr != null ? pct(ctr) : '—', spark: perDay(o.clicks, o.impressions, 100), cur: ctr, prev: p ? div(p.clicks * 100, p.impressions) : null },
    { label: 'CPM', value: cpm != null ? brl(cpm, 2) : '—', spark: perDay(o.spend, o.impressions, 1000), cur: cpm, prev: p ? div(p.spend * 1000, p.impressions) : null, lower: true },
    client
      ? { label: 'CPC', value: t.clicks > 0 ? brl(t.spend / t.clicks, 2) : '—', spark: perDay(o.spend, o.clicks), cur: div(t.spend, t.clicks), prev: p ? div(p.spend, p.clicks) : null, lower: true }
      : { label: 'Clientes com dados', value: `${o.clientsWithData} de ${o.clientsTotal}`, spark: undefined, cur: undefined, prev: undefined },
  ] : []

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: open ? 16 : 0 }}>
        <button type="button" onClick={toggle} aria-expanded={open} className="btn btn-ghost btn-sm" style={{ padding: 0, gap: 6, fontSize: 16, fontWeight: 600 }}>
          Visão geral {open ? <ChevronUp size={16} strokeWidth={1.75} /> : <ChevronDown size={16} strokeWidth={1.75} />}
        </button>
        {open && clients.length > 1 && (
          <select value={client} onChange={e => { setO(null); setClient(e.target.value) }} aria-label="Filtrar por cliente"
            style={{ height: 32, padding: '0 10px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: 13, maxWidth: 220 }}>
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        )}
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>{actions}</div>}
      </div>

      {open && (
        <>
          {error && <p role="alert" style={{ fontSize: 13, color: 'var(--text-2)' }}>Não foi possível carregar a visão geral agora. Tente de novo em instantes.</p>}
          {!o && !error && <PulseLoader size={36} />}
          {o && o.clientsWithData === 0 && !error && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Ainda sem dados. Eles aparecem aqui assim que a sincronização com a Meta guardar as métricas dos clientes.</p>}
          {o && o.clientsWithData > 0 && (
            <>
              <div className="tile-grid stagger" style={{ marginBottom: 4 }}>
                {tiles.map(x => (
                  <MetricTile key={x.label} label={x.label} value={x.value} sparkData={x.spark} currentRaw={x.cur ?? undefined} prevValue={x.prev ?? undefined} lowerIsBetter={x.lower} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right', margin: '8px 0 16px' }}>
                {p ? '↑↓ vs período anterior equivalente · ' : ''}{days === 'today' ? 'dados de hoje, até agora' : days === 'month' ? 'do dia 1 até hoje' : 'dados até ontem'}
                {o.partial && typeof days === 'number' ? ` · histórico disponível menor que ${o.days} dias` : ''}
                {!client && o.clientsWithData < o.clientsTotal ? ` · ${o.clientsTotal - o.clientsWithData} cliente(s) ainda sem dados` : ''}
              </div>
              {o.dates.length > 1 && <div className="card" style={{ padding: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Evolução diária · {client ? (clients.find(c => c.slug === client)?.name ?? 'cliente') : 'todos os clientes'}</div>
                <DailyChart
                  kind="misto"
                  currency="BRL"
                  daily={{ dates: o.dates, spend: o.spend, leads: o.results, cpl: [], impressions: o.impressions, ctr: [] }}
                />
              </div>}
            </>
          )}
        </>
      )}
    </section>
  )
}
