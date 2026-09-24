'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Film, Image as ImageIcon, ImageOff, TrendingDown, TrendingUp } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'
import { champions, toRenew, type Creative } from '@/lib/creatives'
import { MetricTile } from './MetricTile'
import { PulseLoader } from '@/components/PulseLoader'

const nf = new Intl.NumberFormat('pt-BR')
const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi` : v >= 10_000 ? `${(v / 1_000).toFixed(1).replace('.', ',')} mil` : nf.format(Math.round(v)))
const money = (v: number, currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v)
const pct = (v: number) => `${v.toFixed(2).replace('.', ',')}%`
const MEDAL = ['#D4A017', '#9AA3AF', '#B87333']
const STATUS: Record<string, string> = { ACTIVE: 'Ativo', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Pausado', ADSET_PAUSED: 'Pausado' }

function Trend({ value }: { value: number | null }) {
  if (value == null) return null
  const flat = Math.abs(value) < 5
  const good = value >= 0
  const Icon = good ? TrendingUp : TrendingDown
  return (
    <span title="CTR dos últimos 7 dias contra os 7 anteriores" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 4, fontSize: 11, fontWeight: 700, color: flat ? 'var(--text-3)' : good ? 'var(--green)' : 'var(--red)' }}>
      {!flat && <Icon size={11} strokeWidth={2} />}{value > 0 ? '+' : ''}{value.toFixed(0)}%
    </span>
  )
}

const FormatIcon = ({ format }: { format: string }) => (format === 'Vídeo' ? <Film size={12} strokeWidth={2} /> : <ImageIcon size={12} strokeWidth={2} />)

/** Cartão de anúncio no mesmo desenho dos cartões de publicação do Orgânico: imagem quadrada com etiqueta, legenda e indicadores em grade. */
function CreativeCard({ c, currency, rank, reasons }: { c: Creative; currency: string; rank?: number; reasons?: boolean }) {
  const stat = (label: string, value: React.ReactNode) => (
    <div key={label} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <a href={`/api/meta/ad/${c.id}/preview`} target="_blank" rel="noreferrer" title="Ver o anúncio" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--bg-card2)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {c.thumb ? <img src={c.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={28} strokeWidth={1.5} color="var(--text-3)" />}
          <span className="badge" style={{ position: 'absolute', top: 8, left: 8, background: 'var(--bg-card)', color: 'var(--text-1)', display: 'inline-flex', gap: 6, alignItems: 'center' }}><FormatIcon format={c.format} />{c.format}</span>
          {rank != null && <span aria-label={`${rank}º lugar`} style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, background: MEDAL[rank - 1] ?? 'var(--text-3)', color: '#fff', fontSize: 13, fontWeight: 800, display: 'grid', placeItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }}>{rank}</span>}
        </div>
      </a>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <p title={c.name} style={{ fontSize: 13, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36, fontWeight: 600 }}>{c.name}</p>
        {reasons && c.flags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.flags.map(f => <span key={f} className="badge" style={{ background: f === 'Fadiga alta' || f === 'Sem resultado' ? 'var(--red-soft)' : 'var(--amber-soft)', color: f === 'Fadiga alta' || f === 'Sem resultado' ? 'var(--red)' : 'var(--text-1)', fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>{f}</span>)}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 12px' }}>
          {[
            stat('Investido', money(c.spend, currency)),
            stat('Resultados', c.results > 0 ? nf.format(c.results) : '—'),
            stat('Custo cada', c.costPerResult != null ? money(c.costPerResult, currency) : '—'),
            stat('CTR', <>{pct(c.ctr)}<Trend value={c.ctrTrend} /></>),
            stat('Frequência', `${c.frequency.toFixed(1).replace('.', ',')}x`),
            stat('Impressões', compact(c.impressions)),
          ]}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 'auto', fontSize: 12, color: 'var(--text-2)' }}>
          <span title={c.campaign} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{STATUS[c.status] ? `${STATUS[c.status]} · ` : ''}{c.campaign}</span>
          <a href={`/api/meta/ad/${c.id}/preview`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>Ver <ExternalLink size={12} strokeWidth={1.75} /></a>
        </div>
      </div>
    </article>
  )
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }
const h3: React.CSSProperties = { fontSize: 16, fontWeight: 600, margin: '0 0 12px' }

export function CreativesSection({ preset, kind, currency }: { preset: string; kind: ResultKind; currency: string }) {
  const L = KIND_LABELS[kind] ?? KIND_LABELS.misto
  const [list, setList] = useState<Creative[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'pending' | 'error'>('loading')
  const [hasTrend, setHasTrend] = useState(true)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let alive = true
    setState('loading')
    apiFetch(`/api/meta/creatives?date_preset=${preset}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((j: { creatives?: Creative[]; reason?: string; hasTrend?: boolean }) => {
        if (!alive) return
        if (j.creatives && j.reason !== 'pending') { setList(j.creatives); setHasTrend(j.hasTrend !== false); setState('ok') } else setState('pending')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [preset])

  const top = useMemo(() => champions(list ?? []), [list])
  const attention = useMemo(() => toRenew(list ?? []), [list])
  const ranked = useMemo(() => [...(list ?? [])].sort((a, b) => b.spend - a.spend), [list])

  if (state === 'loading') return <PulseLoader size={36} />
  if (state === 'error') return <div className="card" style={{ padding: 24, color: 'var(--text-2)', fontSize: 14 }}>Não foi possível carregar os criativos agora. Tente de novo em instantes.</div>
  if (state === 'pending' || !list) return <div className="card" style={{ padding: 24, color: 'var(--text-2)', fontSize: 14 }}>Os criativos deste cliente ainda estão sendo sincronizados. Volte em alguns minutos.</div>
  if (!list.length) return <div className="card" style={{ padding: 24, color: 'var(--text-2)', fontSize: 14 }}>Nenhum anúncio com investimento neste período.</div>

  const totalImpr = list.reduce((s, c) => s + c.impressions, 0)
  const totalClicks = list.reduce((s, c) => s + c.clicks, 0)
  const avgCtr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : null
  const avgFreq = list.length ? list.reduce((s, c) => s + c.frequency, 0) / list.length : null

  const shown = all ? ranked : ranked.slice(0, 10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="tile-grid stagger">
        <MetricTile label="Anúncios com investimento" value={String(list.length)} />
        <MetricTile label="CTR médio" value={avgCtr != null ? pct(avgCtr) : '—'} note="cliques ÷ impressões" />
        <MetricTile label="Frequência média" value={avgFreq != null ? `${avgFreq.toFixed(1).replace('.', ',')}x` : '—'} note="vezes que cada pessoa viu" />
        <MetricTile label="Criativos em atenção" value={String(attention.length)} note={attention.length ? 'veja abaixo' : 'tudo em ordem'} />
      </div>

      {top.length > 0 && (
        <section>
          <h3 style={h3}>Criativos campeões</h3>
          <div style={grid}>{top.map((c, i) => <CreativeCard key={c.id} c={c} currency={currency} rank={i + 1} />)}</div>
        </section>
      )}

      <section>
        <h3 style={h3}>Criativos em atenção <span style={{ fontWeight: 400, color: 'var(--text-2)', fontSize: 13 }}>· {attention.length}</span></h3>
        {attention.length === 0 ? (
          <div className="card" style={{ padding: 20, fontSize: 14, color: 'var(--text-2)' }}>Nenhum criativo em atenção agora: frequência e CTR dos anúncios ativos estão saudáveis.</div>
        ) : (
          <div style={grid}>{attention.map(c => <CreativeCard key={c.id} c={c} currency={currency} reasons />)}</div>
        )}
        {!hasTrend && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 0' }}>A tendência do CTR aparece depois que os períodos de 7 e 14 dias forem sincronizados.</p>}
      </section>

      <section>
        <h3 style={h3}>Todos os anúncios <span style={{ fontWeight: 400, color: 'var(--text-2)', fontSize: 13 }}>· {ranked.length}</span></h3>
        <div style={grid}>{shown.map(c => <CreativeCard key={c.id} c={c} currency={currency} />)}</div>
        {ranked.length > 10 && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn btn-outline btn-sm" onClick={() => setAll(v => !v)}>{all ? 'Ver menos' : `Ver todos (${ranked.length})`}</button></div>}
      </section>
    </div>
  )
}
