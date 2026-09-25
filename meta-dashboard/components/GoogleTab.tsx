'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { CHANNEL_LABEL, type GCampaign, type GDay, type GSummary } from '@/lib/googleAds/gaql'
import { MetricTile } from './MetricTile'
import { PulseLoader } from './PulseLoader'
import { ChartCard, MiniBars } from './Donut'

interface Data { currency: string; accountName: string | null; range: { since: string; until: string }; summary: GSummary; previous: GSummary; daily: GDay[]; campaigns: GCampaign[]; source: 'live' | 'demo' }
type State = { kind: 'loading' } | { kind: 'ready'; data: Data } | { kind: 'setup'; why: 'off' | 'no_account' } | { kind: 'error'; message: string }

const nf = new Intl.NumberFormat('pt-BR')
const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi` : v >= 10_000 ? `${(v / 1000).toFixed(1).replace('.', ',')} mil` : nf.format(Math.round(v)))
const money = (v: number, cur: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v)
const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const STATUS: Record<string, { text: string; color: string }> = { ENABLED: { text: 'Ativa', color: 'var(--green)' }, PAUSED: { text: 'Pausada', color: 'var(--amber)' } }

function Empty({ text }: { text: string }) {
  return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>{text}</div>
}

/** Aba Google Ads: resumo do período (com comparativo), gasto por dia e campanhas. Somente leitura. */
export function GoogleTab({ preset, presetLabel }: { preset: string; presetLabel: string }) {
  const [st, setSt] = useState<State>({ kind: 'loading' })
  const [filter, setFilter] = useState<'ALL' | 'ENABLED' | 'PAUSED'>('ALL')

  useEffect(() => {
    let alive = true
    setSt({ kind: 'loading' })
    apiFetch(`/api/google/metrics?date_preset=${preset}`, { cache: 'no-store' })
      .then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) as { setup?: string; message?: string } & Partial<Data> }))
      .then(({ j }) => {
        if (!alive) return
        if (j.setup === 'ready') setSt({ kind: 'ready', data: j as Data })
        else if (j.setup === 'off' || j.setup === 'no_account') setSt({ kind: 'setup', why: j.setup })
        else setSt({ kind: 'error', message: j.message ?? 'Não foi possível carregar o Google Ads agora.' })
      })
      .catch(() => { if (alive) setSt({ kind: 'error', message: 'Não foi possível carregar o Google Ads agora.' }) })
    return () => { alive = false }
  }, [preset])

  const data = st.kind === 'ready' ? st.data : null
  const campaigns = useMemo(() => (data?.campaigns ?? []).filter(c => filter === 'ALL' || c.status === filter), [data, filter])

  if (st.kind === 'loading') return <PulseLoader size={40} />
  if (st.kind === 'setup') return <Empty text={st.why === 'no_account' ? 'Este cliente ainda não tem conta do Google Ads vinculada. Vincule em Clientes → Editar.' : 'A conexão com o Google Ads ainda não foi configurada neste app.'} />
  if (st.kind === 'error') return <Empty text={st.message} />
  if (!data) return null

  const { summary: s, previous: p, currency: cur, daily } = data
  const tiles: Array<{ label: string; value: string; cur: number; prev: number; spark: number[]; low?: boolean }> = [
    { label: 'Investimento', value: money(s.spend, cur), cur: s.spend, prev: p.spend, spark: daily.map(d => d.spend) },
    { label: 'Impressões', value: compact(s.impressions), cur: s.impressions, prev: p.impressions, spark: daily.map(d => d.impressions) },
    { label: 'Cliques', value: compact(s.clicks), cur: s.clicks, prev: p.clicks, spark: daily.map(d => d.clicks) },
    { label: 'CTR', value: pct(s.ctr), cur: s.ctr, prev: p.ctr, spark: [] },
    { label: 'CPC médio', value: money(s.cpc, cur), cur: s.cpc, prev: p.cpc, spark: [], low: true },
    { label: 'Conversões', value: nf.format(Math.round(s.conversions * 10) / 10), cur: s.conversions, prev: p.conversions, spark: daily.map(d => d.conversions) },
    { label: 'Custo por conversão', value: s.conversions ? money(s.cpa, cur) : '—', cur: s.cpa, prev: p.cpa, spark: [], low: true },
    ...(s.conversionValue > 0 ? [{ label: 'ROAS', value: `${s.roas.toFixed(2).replace('.', ',')}x`, cur: s.roas, prev: p.roas, spark: [] as number[] }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
        {presetLabel} · {dm(data.range.since)} a {dm(data.range.until)}{data.accountName ? ` · ${data.accountName}` : ''}
        {data.source === 'demo' && <span className="badge" style={{ marginLeft: 8, background: 'var(--amber-soft)', color: 'var(--text-1)' }}>dados de exemplo</span>}
      </div>

      <div className="tile-grid">
        {tiles.map(t => <MetricTile key={t.label} label={t.label} value={t.value} sparkData={t.spark} currentRaw={t.cur} prevValue={t.prev} lowerIsBetter={t.low} />)}
      </div>

      {daily.length > 1 && (
        <ChartCard title="Investimento por dia" hint={`Total ${money(s.spend, cur)}`}>
          <MiniBars values={daily.map(d => d.spend)} height={64} title={(i, v) => `${dm(daily[i].date)}: ${money(v, cur)}`} />
        </ChartCard>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Campanhas</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{campaigns.length} {campaigns.length === 1 ? 'campanha' : 'campanhas'}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([['ALL', 'Todas'], ['ENABLED', 'Ativas'], ['PAUSED', 'Pausadas']] as const).map(([k, l]) => (
              <button key={k} type="button" className="pill-btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        {campaigns.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>Nenhuma campanha com esse filtro no período.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr style={{ textAlign: 'right', color: 'var(--text-2)', fontSize: 12 }}>
                  {['Campanha', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Conv.', 'Custo/conv.'].map((h, i) => <th key={h} style={{ padding: '10px 16px', fontWeight: 500, textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const stt = STATUS[c.status] ?? { text: c.status, color: 'var(--text-3)' }
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: '12px 16px', minWidth: 220 }}>
                        <div title={c.name} style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{c.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, fontSize: 12, color: 'var(--text-2)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: stt.color }} />{stt.text}</span>
                          {CHANNEL_LABEL[c.channel] && <span>{CHANNEL_LABEL[c.channel]}</span>}
                          {c.dailyBudget != null && <span>{money(c.dailyBudget, cur)}/dia</span>}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{money(c.spend, cur)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{compact(c.impressions)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{compact(c.clicks)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{pct(c.ctr)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{money(c.cpc, cur)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{nf.format(Math.round(c.conversions * 10) / 10)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{c.conversions ? money(c.cpa, cur) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
