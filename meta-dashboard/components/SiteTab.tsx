'use client'

import { useEffect, useState } from 'react'
import { Globe, MapPin, MousePointerClick, Smartphone, Target } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { GaReport, GaRow } from '@/lib/ga4/report'
import { MetricTile } from './MetricTile'
import { PulseLoader } from './PulseLoader'
import { ChartCard, DonutChart, MiniBars, paletteAt } from './Donut'
import { ListCard, PagedRows, RankRow } from './UsageUi'

type State = { kind: 'loading' } | { kind: 'ready'; data: GaReport } | { kind: 'setup'; why: 'off' | 'no_property' } | { kind: 'error'; message: string }

const nf = new Intl.NumberFormat('pt-BR')
const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`)
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function Empty({ text }: { text: string }) {
  return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>{text}</div>
}

/** Lista de linhas com a barra proporcional às sessões e as conversões à direita. */
function RowsCard({ icon, title, rows, empty }: { icon: React.ReactNode; title: string; rows: GaRow[]; empty: string }) {
  const max = Math.max(1, ...rows.map(r => r.sessions))
  return (
    <ListCard icon={icon} title={title} hint="Sessões e conversões">
      <PagedRows size={5} empty={<p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>{empty}</p>}
        rows={rows.map(r => (
          <RankRow key={r.label} title={r.label} valueTone="plain" bar={(r.sessions / max) * 100}
            sub={`${nf.format(r.sessions)} sessões · ${pct(r.engagementRate)} de engajamento`}
            value={<span title="Conversões (eventos-chave)">{nf.format(r.keyEvents)} <span style={{ fontWeight: 400, color: 'var(--text-2)', fontSize: 12 }}>conv.</span></span>} />
        ))} />
    </ListCard>
  )
}

/** Aba Site: resumo do Google Analytics 4 da página do cliente, com comparativo, dia a dia, origem, campanhas, páginas, dispositivos e cidades. Somente leitura. */
export function SiteTab({ preset, presetLabel }: { preset: string; presetLabel: string }) {
  const [st, setSt] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let alive = true
    setSt({ kind: 'loading' })
    apiFetch(`/api/ga4/report?date_preset=${preset}`, { cache: 'no-store' })
      .then(async r => ({ j: await r.json().catch(() => ({})) as { setup?: string; message?: string } & Partial<GaReport> }))
      .then(({ j }) => {
        if (!alive) return
        if (j.setup === 'ready') setSt({ kind: 'ready', data: j as GaReport })
        else if (j.setup === 'off' || j.setup === 'no_property') setSt({ kind: 'setup', why: j.setup })
        else setSt({ kind: 'error', message: j.message ?? 'Não foi possível carregar o Google Analytics agora.' })
      })
      .catch(() => { if (alive) setSt({ kind: 'error', message: 'Não foi possível carregar o Google Analytics agora.' }) })
    return () => { alive = false }
  }, [preset])

  if (st.kind === 'loading') return <PulseLoader size={40} />
  if (st.kind === 'setup') return <Empty text={st.why === 'no_property' ? 'Este cliente ainda não tem o Google Analytics vinculado. Vincule em Clientes → Editar.' : 'A conexão com o Google Analytics ainda não foi configurada neste app.'} />
  if (st.kind === 'error') return <Empty text={st.message} />

  const d = st.data
  const { summary: s, previous: p } = d
  const tiles = [
    { label: 'Sessões', value: nf.format(s.sessions), cur: s.sessions, prev: p.sessions, spark: d.daily.map(x => x.sessions) },
    { label: 'Usuários', value: nf.format(s.users), cur: s.users, prev: p.users, spark: [] as number[] },
    { label: 'Usuários novos', value: nf.format(s.newUsers), cur: s.newUsers, prev: p.newUsers, spark: [] as number[] },
    { label: 'Engajamento', value: pct(s.engagementRate), cur: s.engagementRate, prev: p.engagementRate, spark: [] as number[] },
    { label: 'Tempo médio', value: dur(s.avgSessionSec), cur: s.avgSessionSec, prev: p.avgSessionSec, spark: [] as number[] },
    { label: 'Conversões', value: nf.format(s.keyEvents), cur: s.keyEvents, prev: p.keyEvents, spark: d.daily.map(x => x.keyEvents) },
    { label: 'Taxa de conversão', value: pct(s.conversionRate), cur: s.conversionRate, prev: p.conversionRate, spark: [] as number[] },
  ]
  const deviceSlices = d.devices.map((x, i) => ({ key: x.label, label: x.label, value: x.sessions, color: paletteAt(i) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{presetLabel} · {dm(d.range.since)} a {dm(d.range.until)} · Google Analytics</span>
        {d.live != null && <span className="badge" title="Usuários no site neste momento" style={{ background: 'var(--green-soft)', color: 'var(--text-1)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />{d.live} no site agora</span>}
        {d.source === 'demo' && <span className="badge" style={{ background: 'var(--amber-soft)', color: 'var(--text-1)' }}>dados de exemplo</span>}
      </div>

      <div className="tile-grid">
        {tiles.map(t => <MetricTile key={t.label} label={t.label} value={t.value} sparkData={t.spark} currentRaw={t.cur} prevValue={t.prev} />)}
      </div>

      {d.daily.length > 1 && (
        <ChartCard title="Sessões por dia" hint={`Total ${nf.format(s.sessions)}`}>
          <div style={{ width: '100%' }}><MiniBars values={d.daily.map(x => x.sessions)} height={72} title={(i, v) => `${dm(d.daily[i].date)}: ${nf.format(v)} sessões · ${nf.format(d.daily[i].keyEvents)} conv.`} /></div>
        </ChartCard>
      )}

      <div className="usage-grid">
        <RowsCard icon={<Globe size={18} strokeWidth={1.75} />} title="Origem do tráfego" rows={d.sources} empty="Sem dados de origem neste período." />
        <RowsCard icon={<Target size={18} strokeWidth={1.75} />} title="Campanhas (UTM)" rows={d.campaigns} empty="Nenhuma campanha com UTM neste período. Confira se os links dos anúncios têm utm_campaign." />
        <RowsCard icon={<MousePointerClick size={18} strokeWidth={1.75} />} title="Páginas de entrada" rows={d.pages} empty="Sem dados de páginas neste período." />
        <ChartCard title="Dispositivos">
          <DonutChart slices={deviceSlices} center={nf.format(s.sessions)} sub="sessões" />
        </ChartCard>
        <RowsCard icon={<MapPin size={18} strokeWidth={1.75} />} title="Cidades" rows={d.cities} empty="Sem dados de cidades neste período." />
        <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-2)', fontSize: 13 }}>
          <Smartphone size={18} strokeWidth={1.75} aria-hidden="true" />
          Conversões são os eventos-chave marcados no Google Analytics (formulário enviado, clique no WhatsApp etc.).
        </div>
      </div>
    </div>
  )
}
