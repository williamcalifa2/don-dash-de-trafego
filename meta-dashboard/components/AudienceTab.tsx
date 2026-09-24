'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from '@/components/PulseLoader'
import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'
import type { Audience, Slice } from '@/lib/audience'

interface Props { preset: string; presetLabel: string; kind: ResultKind; currency?: string }

const IMP = 'var(--green)'
const REACH = 'var(--accent)'
const PALETTE = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--text-3)', 'var(--red)']

const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : String(Math.round(v)))
const brl = (v: number, d = 2) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const pct = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1).replace('.', ',')}%`

const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginBottom: 12 }

type Metric = 'impressions' | 'reach' | 'results'
const METRIC = {
  impressions: { color: IMP, label: 'Impressões' },
  reach: { color: REACH, label: 'Alcance' },
  results: { color: 'var(--amber)', label: 'Resultados' },
} as const

function Legend({ series }: { series: Metric[] }) {
  return (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
      {series.map(m => <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 999, background: METRIC[m].color }} />{METRIC[m].label}</span>)}
    </div>
  )
}

/** Séries que realmente têm dado (a Meta não devolve alcance por hora, por exemplo). */
const activeSeries = (data: Slice[], wanted: Metric[]) => wanted.filter(m => data.some(d => d[m] > 0))

/** Barras agrupadas por categoria: hora, idade, gênero. Uma barra por métrica pedida. */
function Bars({ data, series, height = 140, dense = false, labels = false }: { data: Slice[]; series: Metric[]; height?: number; dense?: boolean; labels?: boolean }) {
  const max = Math.max(1, ...data.flatMap(d => series.map(m => d[m])))
  const W = 520, PL = 36, PB = 22, PT = labels ? 16 : 8
  const ch = height - PB - PT
  const slot = (W - PL) / data.length
  const bw = Math.min(dense ? 9 : 26, (slot * 0.7) / series.length)
  const groupW = bw * series.length + (series.length - 1) * 2
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={series.map(m => METRIC[m].label).join(' e ')} style={{ display: 'block' }}>
      {[0, 0.5, 1].map(t => (
        <g key={t}>
          <line x1={PL} x2={W} y1={PT + ch * (1 - t)} y2={PT + ch * (1 - t)} stroke="var(--border-soft)" />
          <text x={PL - 6} y={PT + ch * (1 - t) + 3} textAnchor="end" fontSize={9} fill="var(--text-3)">{compact(max * t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = PL + slot * i + slot / 2
        const x0 = cx - groupW / 2
        return (
          <g key={d.key}>
            <title>{`${d.label}: ${series.map(m => `${d[m].toLocaleString('pt-BR')} ${METRIC[m].label.toLowerCase()}`).join(' · ')}${d.results > 0 && d.spend > 0 ? ` · ${brl(d.spend / d.results)} por resultado` : ''}`}</title>
            {series.map((m, k) => {
              const h = (d[m] / max) * ch
              const x = x0 + k * (bw + 2)
              return (
                <g key={m}>
                  <rect x={x} y={PT + ch - h} width={bw} height={Math.max(h, 0)} rx={2} fill={METRIC[m].color} />
                  {labels && d[m] > 0 && <text x={x + bw / 2} y={PT + ch - h - 3} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--text-1)">{d[m]}</text>}
                </g>
              )
            })}
            {(!dense || i % 2 === 0) && <text x={cx} y={height - 6} textAnchor="middle" fontSize={dense ? 8 : 9.5} fill="var(--text-2)">{d.label}</text>}
          </g>
        )
      })}
    </svg>
  )
}

/** Pizza com a participação de cada item no alcance. */
function Donut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.reach, 0)
  const R = 62, C = 2 * Math.PI * R
  let acc = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 160 160" width={150} height={150} role="img" aria-label="Alcance por plataforma">
        <circle cx={80} cy={80} r={R} fill="none" stroke="var(--bg-card2)" strokeWidth={26} />
        {total > 0 && data.map((d, i) => {
          const len = (d.reach / total) * C
          const el = <circle key={d.key} cx={80} cy={80} r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={26} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)"><title>{`${d.label}: ${pct((d.reach / total) * 100)}`}</title></circle>
          acc += len
          return el
        })}
      </svg>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        {data.map((d, i) => (
          <li key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i style={{ width: 8, height: 8, borderRadius: 999, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{d.label}</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? pct((d.reach / total) * 100) : '—'}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Custo por resultado de cada faixa, em uma linha discreta abaixo do gráfico. */
function CostLine({ data, one }: { data: Slice[]; one: string }) {
  const items = data.filter(d => d.results > 0 && d.spend > 0)
  if (!items.length) return null
  return (
    <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginTop: 8 }}>
      Custo por {one}: {items.map(d => `${d.label} ${brl(d.spend / d.results)}`).join(' · ')}
    </p>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>{text}</div>
}

/** Público e origem dos resultados: de qual plataforma vieram, quem alcançamos, quando e onde. */
export function AudienceTab({ preset, presetLabel, kind }: Props) {
  const [a, setA] = useState<Audience | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'pending' | 'today' | 'error'>('loading')
  const [at, setAt] = useState<number | null>(null)
  const L = KIND_LABELS[kind]

  useEffect(() => {
    let alive = true
    setState('loading')
    apiFetch(`/api/meta/audience?date_preset=${preset}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((j: { audience?: Audience | null; reason?: string; at?: number }) => {
        if (!alive) return
        if (j.audience) { setA(j.audience); setAt(j.at ?? null); setState('ok') }
        else setState(j.reason === 'today' ? 'today' : 'pending')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [preset])

  const platformResults = useMemo(() => (a?.platform ?? []).filter(p => p.results > 0 || p.spend > 0), [a])
  const totalResults = platformResults.reduce((s, p) => s + p.results, 0)
  const topReach = Math.max(1, ...(a?.regions ?? []).map(r => r.reach))
  const hourSeries = a ? activeSeries(a.hours, ['impressions', 'reach']) : (['impressions'] as Metric[])
  const hasResults = !!a && (a.age.some(x => x.results > 0) || a.gender.some(x => x.results > 0))

  if (state === 'loading') return <PulseLoader size={40} />
  if (state === 'today') return <Empty text="O público é calculado para períodos de 7, 14 ou 30 dias. Escolha um deles no topo. Escolha um deles no topo." />
  if (state === 'error') return <Empty text="Não foi possível carregar o público agora. Tente de novo em instantes." />
  if (!a) return <Empty text="Os dados de público deste cliente ainda estão sendo sincronizados. Volte em alguns minutos." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
        {presetLabel}{at ? ` · atualizado ${new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
      </div>

      {platformResults.length > 0 && (
        <section className="card" style={{ padding: 24 }}>
          <h3 style={cardTitle}>De onde vieram os resultados</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {platformResults.map((p, i) => {
              const share = totalResults > 0 ? (p.results / totalResults) * 100 : 0
              return (
                <div key={p.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{p.label}</span>
                    <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.results} {p.results === 1 ? L.one : L.many.toLowerCase()} · {brl(p.spend, 0)} investidos{p.results > 0 ? ` · ${brl(p.spend / p.results)} por ${L.one}` : ''}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-card2)', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${share}%`, height: '100%', background: PALETTE[i % PALETTE.length], borderRadius: 999 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <section className="card" style={{ padding: 24 }}>
          <h3 style={cardTitle}>Alcance por plataforma</h3>
          {a.platform.length ? <Donut data={a.platform} /> : <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Sem dados.</p>}
        </section>
        <section className="card" style={{ padding: 24 }}>
          <h3 style={cardTitle}>Alcance por dispositivo</h3>
          {a.device.length ? <Donut data={a.device} /> : <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Sem dados.</p>}
        </section>

        <section className="card" style={{ padding: 24 }}>
          <h3 style={cardTitle}>{hourSeries.length > 1 ? 'Impressões e alcance por hora' : 'Impressões por hora'}</h3>
          <Legend series={hourSeries} />
          <Bars data={a.hours} series={hourSeries} height={120} dense />
        </section>
        {a.regions.length > 0 && (
          <section className="card" style={{ padding: 24 }}>
            <h3 style={cardTitle}>Regiões com maior alcance</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {a.regions.slice(0, 6).map(r => (
                <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 150px) 1fr auto', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-card2)', overflow: 'hidden' }}><div style={{ width: `${(r.reach / topReach) * 100}%`, height: '100%', background: REACH, borderRadius: 999 }} /></div>
                  <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{compact(r.reach)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card" style={{ padding: 24 }}>
          <h3 style={cardTitle}>Impressões e alcance por idade</h3>
          <Legend series={['impressions', 'reach']} />
          <Bars data={a.age} series={['impressions', 'reach']} />
        </section>
        <section className="card" style={{ padding: 24 }}>
          <h3 style={cardTitle}>Impressões e alcance por gênero</h3>
          <Legend series={['impressions', 'reach']} />
          <Bars data={a.gender} series={['impressions', 'reach']} />
        </section>

        {hasResults && (
          <>
            <section className="card" style={{ padding: 24 }}>
              <h3 style={cardTitle}>{L.many} por idade</h3>
              <Bars data={a.age} series={['results']} labels />
              <CostLine data={a.age} one={L.one} />
            </section>
            <section className="card" style={{ padding: 24 }}>
              <h3 style={cardTitle}>{L.many} por gênero</h3>
              <Bars data={a.gender} series={['results']} labels />
              <CostLine data={a.gender} one={L.one} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
