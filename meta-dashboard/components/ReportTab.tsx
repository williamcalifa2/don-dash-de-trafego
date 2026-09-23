'use client'

import { useEffect, useMemo, useRef } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useLeadsData } from '@/lib/leadsContext'
import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'
import { buildPerf, isStale, leadsInPeriod, timeAgo, STALE_HOURS, type Perf } from '@/lib/leadUtils'
import { usePerformance } from '@/lib/usePerformance'
import { buildRetorno } from './RetornoTab'
import type { MetricsResponse } from '@/lib/meta'

interface Props {
  data: MetricsResponse
  preset: string
  presetLabel: string
  clientName: string
  kind?: ResultKind
  showCrm?: boolean
  /** chamado quando os dados do relatório terminaram de carregar (para imprimir/baixar) */
  onReady?: () => void
}

const brl = (v: number | null | undefined, d = 0) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const num = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v))
const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`)

function Delta({ cur, prev, lowerIsBetter, neutral }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean; neutral?: boolean }) {
  if (cur == null || prev == null || prev === 0) return <span style={{ fontSize: 12, color: 'var(--text-2)' }}>sem comparação</span>
  const d = ((cur - prev) / Math.abs(prev)) * 100
  const good = lowerIsBetter ? d <= 0 : d >= 0
  const up = d >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: neutral ? 'var(--text-1)' : good ? 'var(--green)' : 'var(--red)' }}>
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      <span>{Math.abs(d).toFixed(1).replace('.', ',')}%</span> <span style={{ fontWeight: 400, color: 'var(--text-2)', marginLeft: 2 }}>vs anterior</span>
    </span>
  )
}

export function ReportTab({ data, preset, presetLabel, clientName, kind = 'form', showCrm = true, onReady }: Props) {
  const L = KIND_LABELS[kind]
  const { leads } = useLeadsData()
  const { rows, state } = usePerformance(preset)
  const ready = useRef(false)
  useEffect(() => { if (state !== 'loading' && !ready.current) { ready.current = true; onReady?.() } }, [state, onReady])

  const cur = useMemo(() => leadsInPeriod(leads, preset), [leads, preset])
  const prev = useMemo(() => leadsInPeriod(leads, preset, 1), [leads, preset])
  const s = data.summary
  const p = data.summary_prev

  const perf: Perf = buildPerf(s.spend, cur)
  const perfPrev: Perf = buildPerf(p?.spend ?? 0, prev)
  const { campaigns } = useMemo(() => buildRetorno(rows, cur), [rows, cur])
  const ads = campaigns.flatMap(c => c.children.map(a => ({ ...a, campaign: c.name })))

  const best = ads.filter(a => a.perf.vendas > 0).sort((a, b) => (b.perf.roas ?? 0) - (a.perf.roas ?? 0) || b.perf.receita - a.perf.receita).slice(0, 3)
  const attention = ads.filter(a => a.perf.vendas === 0 && a.perf.spend > 0 && a.perf.leads >= 2).sort((a, b) => b.perf.spend - a.perf.spend).slice(0, 3)
  const stale = leads.filter(l => isStale(l))
  const lost = new Map<string, number>()
  cur.filter(l => l.status === 'Perdido').forEach(l => lost.set(l.motivo_perda ?? 'Não informado', (lost.get(l.motivo_perda ?? 'Não informado') ?? 0) + 1))
  const lostList = [...lost.entries()].sort((a, b) => b[1] - a[1])

  const statusCount = (st: string) => cur.filter(l => l.status === st).length
  const generated = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Resultado real da conta: leads de formulário, leads do site, conversas iniciadas (ou a soma, se for misto).
  const res = kind === 'form' ? s.leads : s.results
  const resPrev = kind === 'form' ? p?.leads : p?.results
  const cost = kind === 'form' ? s.cpl : s.cost_per_result
  const costPrev = kind === 'form' ? p?.cpl : p?.cost_per_result
  const topCampaigns = [...data.campaigns].filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 5)

  const summaryLines: string[] = [
    `Foram investidos ${brl(s.spend)} (${presetLabel.toLowerCase()}), gerando ${num(res)} ${res === 1 ? L.one : L.many.toLowerCase()}${cost ? ` a um ${L.costFull.toLowerCase()} de ${brl(cost, 2)}` : ''}.`,
    ...(!showCrm ? [] : [perf.vendas > 0
      ? `${perf.vendas} venda${perf.vendas === 1 ? '' : 's'} registrada${perf.vendas === 1 ? '' : 's'} no app, somando ${brl(perf.receita)}${perf.custoVenda ? ` — custo por venda de ${brl(perf.custoVenda)}` : ''}${perf.roas ? ` e ROAS de ${perf.roas.toFixed(1).replace('.', ',')}x` : ''}.`
      : 'Nenhuma venda foi registrada no app neste período.']),
  ]
  if (resPrev && resPrev > 0) {
    const dl = ((res - resPrev) / resPrev) * 100
    summaryLines.push(`O volume de ${L.many.toLowerCase()} ${dl >= 0 ? 'subiu' : 'caiu'} ${Math.abs(dl).toFixed(0)}% em relação ao período anterior.`)
  }
  if (best[0]) summaryLines.push(`Melhor retorno: “${best[0].name}” (${best[0].perf.vendas} venda${best[0].perf.vendas === 1 ? '' : 's'}, ${brl(best[0].perf.receita)}).`)
  if (attention[0]) summaryLines.push(`Atenção: “${attention[0].name}” investiu ${brl(attention[0].perf.spend)} e gerou ${attention[0].perf.leads} leads sem nenhuma venda.`)
  if (stale.length > 0) summaryLines.push(`${stale.length} lead${stale.length === 1 ? '' : 's'} sem contato há mais de ${STALE_HOURS}h precisam de retorno.`)

  const kpis = !showCrm ? [
    { label: 'Investimento', value: brl(s.spend), delta: <Delta cur={s.spend} prev={p?.spend ?? null} neutral /> },
    { label: L.many, value: num(res), delta: <Delta cur={res} prev={resPrev ?? null} /> },
    { label: L.costFull, value: brl(cost, 2), delta: <Delta cur={cost} prev={costPrev ?? null} lowerIsBetter /> },
    { label: 'Impressões', value: num(s.impressions), delta: <Delta cur={s.impressions} prev={p?.impressions ?? null} neutral /> },
    { label: 'Cliques', value: num(s.clicks), delta: <Delta cur={s.clicks} prev={p?.clicks ?? null} neutral /> },
    { label: 'CTR', value: pct(s.ctr), delta: <Delta cur={s.ctr} prev={p?.ctr ?? null} /> },
    { label: 'CPM', value: brl(s.cpm, 2), delta: <Delta cur={s.cpm} prev={p?.cpm ?? null} lowerIsBetter /> },
    { label: 'Frequência', value: s.frequency.toFixed(1).replace('.', ','), delta: <span style={{ fontSize: 12, color: 'var(--text-2)' }}>vezes por pessoa</span> },
  ] : [
    { label: 'Investimento', value: brl(s.spend), delta: <Delta cur={s.spend} prev={p?.spend ?? null} neutral /> },
    { label: kind === 'form' ? 'Leads (Meta)' : L.many, value: num(res), delta: <Delta cur={res} prev={resPrev ?? null} /> },
    { label: kind === 'form' ? 'CPL' : L.cost, value: brl(cost, 2), delta: <Delta cur={cost} prev={costPrev ?? null} lowerIsBetter /> },
    { label: 'Vendas (app)', value: String(perf.vendas), delta: <Delta cur={perf.vendas} prev={perfPrev.vendas} /> },
    { label: 'Receita', value: brl(perf.receita), delta: <Delta cur={perf.receita} prev={perfPrev.receita} /> },
    { label: 'Custo por venda', value: brl(perf.custoVenda), delta: <span style={{ fontSize: 12, color: 'var(--text-2)' }}>investimento ÷ vendas</span> },
    { label: 'ROAS real', value: perf.roas ? `${perf.roas.toFixed(1).replace('.', ',')}x` : '—', delta: <span style={{ fontSize: 12, color: 'var(--text-2)' }}>receita ÷ investimento</span> },
    { label: 'Lead → venda', value: pct(perf.taxa), delta: <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{cur.length} leads no app</span> },
  ]

  const funnel = [
    { label: 'Impressões', value: s.impressions },
    { label: 'Cliques', value: s.clicks },
    { label: L.many, value: res },
    ...(showCrm ? [{ label: 'Vendas', value: perf.vendas }] : []),
  ]

  const h3: React.CSSProperties = { fontSize: 16, fontWeight: 600, marginBottom: 12 }
  const adLine = (a: typeof ads[number]) => (
    <li key={a.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 14, padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <strong style={{ fontWeight: 600 }}>{a.name}</strong>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{a.campaign}</span>
      </span>
      <span style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {a.perf.vendas > 0 ? `${a.perf.vendas} venda${a.perf.vendas === 1 ? '' : 's'} · ${brl(a.perf.receita)}` : `${brl(a.perf.spend)} · ${a.perf.leads} leads`}
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{a.perf.roas ? `ROAS ${a.perf.roas.toFixed(1).replace('.', ',')}x` : 'sem venda'}</span>
      </span>
    </li>
  )

  return (
    <div className="report" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Relatório de desempenho</p>
          <h2 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{clientName}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 2 }}>{presetLabel} · gerado em {generated}</p>
        </div>
      </div>

      <section className="card" style={{ padding: 24 }}>
        <h3 style={h3}>Resumo</h3>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, lineHeight: 1.6 }}>
          {summaryLines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </section>

      <div className="kpi-grid-4">
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ padding: 16, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '6px 0 4px', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{k.value}</div>
            {k.delta}
          </div>
        ))}
      </div>

      <section className="card" style={{ padding: 24 }}>
        <h3 style={h3}>Funil do período</h3>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${funnel.length}, 1fr)`, gap: 12 }}>
          {funnel.map((f, i) => (
            <div key={f.label}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>{f.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{num(f.value)}</div>
              {i > 0 && funnel[i - 1].value > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{pct((f.value / funnel[i - 1].value) * 100)} da etapa anterior</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {!showCrm && (
        <section className="card" style={{ padding: 24 }}>
          <h3 style={h3}>Campanhas do período</h3>
          {topCampaigns.length === 0 ? <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Nenhuma campanha com investimento no período.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {topCampaigns.map(c => (
                <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 14, padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{c.name}</span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {brl(c.spend)} · {num(kind === 'form' ? c.leads : c.results)} {(kind === 'form' ? c.leads : c.results) === 1 ? L.one : L.many.toLowerCase()}
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{(kind === 'form' ? c.cpl : c.cost_per_result) ? `${L.cost} ${brl(kind === 'form' ? c.cpl : c.cost_per_result, 2)}` : 'sem resultado'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showCrm && <div className="report-cols">
        <section className="card" style={{ padding: 24 }}>
          <h3 style={h3}>Anúncios com melhor retorno</h3>
          {best.length === 0 ? <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Nenhum anúncio com venda registrada no período.</p> : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{best.map(adLine)}</ul>}
        </section>
        <section className="card" style={{ padding: 24 }}>
          <h3 style={h3}>Pedem atenção</h3>
          {attention.length === 0 ? <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Nenhum anúncio gastando sem gerar venda.</p> : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{attention.map(adLine)}</ul>}
        </section>
      </div>}

      {showCrm && <div className="report-cols">
        <section className="card" style={{ padding: 24 }}>
          <h3 style={h3}>Leads do período</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 14 }}>
            {(['Novo', 'Em andamento', 'Convertido', 'Perdido'] as const).map(st => (
              <div key={st} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ color: 'var(--text-2)' }}>{st}</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{statusCount(st)}</strong>
              </div>
            ))}
          </div>
          {stale.length > 0 && (
            <>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>Sem contato há mais de {STALE_HOURS}h ({stale.length})</h4>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14 }}>
                {stale.slice(0, 5).map(l => (
                  <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
                    <span>{l.nome ?? 'Sem nome'}</span><span style={{ color: 'var(--text-2)' }}>{timeAgo(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="card" style={{ padding: 24 }}>
          <h3 style={h3}>Motivos de perda</h3>
          {lostList.length === 0 ? <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Nenhum lead perdido no período.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14 }}>
              {lostList.map(([r, n]) => (
                <li key={r} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ color: r === 'Não informado' ? 'var(--text-2)' : undefined }}>{r}</span><strong>{n}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>}
    </div>
  )
}
