'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { ExternalLink, ImageOff } from 'lucide-react'
import { MetricTile } from './MetricTile'
import { useOrganic } from '@/lib/useOrganic'
import type { Kpi, OrganicPost, OrganicView, Platform } from '@/lib/meta/organicRead'
import { timeAgo } from '@/lib/leadUtils'

const nf = new Intl.NumberFormat('pt-BR')
const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi` : v >= 10_000 ? `${(v / 1_000).toFixed(1).replace('.', ',')} mil` : nf.format(Math.round(v)))
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const IG = '#e1306c', FB = '#1877f2'

function IgMark({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={IG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Instagram" role="img"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill={IG} stroke="none" /></svg>
}
function FbMark({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Facebook" role="img"><circle cx="12" cy="12" r="11" fill={FB} /><path d="M13.4 20v-6.6h2.2l.4-2.7h-2.6V9c0-.8.3-1.3 1.4-1.3H16V5.3c-.3 0-1.1-.1-2-.1-2.1 0-3.500 1.300-3.500 3.600v1.900H8.300v2.700h2.200V20z" fill="#fff" /></svg>
}

const Empty = ({ title, text }: { title: string; text: string }) => (
  <div className="card" style={{ padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h3>
    <p style={{ fontSize: 14, color: 'var(--text-2)', maxWidth: 460 }}>{text}</p>
  </div>
)

/** Linhas por dia (uma por série), com eixo de datas nas pontas. Sem bibliotecas. */
function Lines({ dates, series, height = 140 }: { dates: string[]; series: Array<{ label: string; color: string; values: number[] }>; height?: number }) {
  const W = 640, H = height, P = { l: 8, r: 8, t: 10, b: 22 }
  const max = Math.max(1, ...series.flatMap(s => s.values))
  const x = (i: number) => P.l + (dates.length <= 1 ? 0 : (i / (dates.length - 1)) * (W - P.l - P.r))
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  const fmtD = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-2)', marginBottom: 6, flexWrap: 'wrap' }}>
        {series.map(s => <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />{s.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Alcance por dia" style={{ display: 'block' }}>
        {[0, 0.5, 1].map(f => <line key={f} x1={P.l} x2={W - P.r} y1={P.t + f * (H - P.t - P.b)} y2={P.t + f * (H - P.t - P.b)} stroke="var(--border-soft)" strokeWidth="1" />)}
        {series.map(s => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {s.values.length > 0 && <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r="3" fill={s.color} />}
          </g>
        ))}
        {dates.length > 0 && <text x={P.l} y={H - 6} fontSize="11" fill="var(--text-3)">{fmtD(dates[0])}</text>}
        {dates.length > 1 && <text x={W - P.r} y={H - 6} fontSize="11" fill="var(--text-3)" textAnchor="end">{fmtD(dates[dates.length - 1])}</text>}
        <text x={W - P.r} y={P.t + 8} fontSize="11" fill="var(--text-3)" textAnchor="end">{compact(max)}</text>
      </svg>
    </div>
  )
}

function Bars({ items, color = 'var(--accent)', total }: { items: Array<{ label: string; value: number }>; color?: string; total?: number }) {
  const max = Math.max(1, ...items.map(i => i.value))
  const sum = total ?? items.reduce((s, i) => s + i.value, 0)
  if (!items.length) return <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Sem dados suficientes.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(i => (
        <div key={i.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(60px, 120px) 1fr 44px', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.label}>{i.label}</span>
          <span style={{ height: 8, borderRadius: 4, background: 'var(--bg-card2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(i.value / max) * 100}%`, background: color, borderRadius: 4 }} /></span>
          <span style={{ textAlign: 'right', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{sum ? `${Math.round((i.value / sum) * 100)}%` : ''}</span>
        </div>
      ))}
    </div>
  )
}

const GENDER: Record<string, string> = { F: 'Feminino', M: 'Masculino', U: 'Não informado' }

function PostCard({ p }: { p: OrganicPost }) {
  const stat = (label: string, v: number | null) => v == null ? null : (
    <div key={label} style={{ minWidth: 0 }}><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div><div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{compact(v)}</div></div>
  )
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--bg-card2)', display: 'grid', placeItems: 'center' }}>
        {p.thumb ? (
          <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : <ImageOff size={28} strokeWidth={1.5} color="var(--text-3)" />}
        <span className="badge" style={{ position: 'absolute', top: 8, left: 8, background: 'var(--bg-card)', color: 'var(--text-1)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {p.platform === 'ig' ? <IgMark size={12} /> : <FbMark size={12} />}{p.type}
        </span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <p style={{ fontSize: 13, lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 36, color: p.caption ? 'var(--text-1)' : 'var(--text-3)' }}>{p.caption || 'Sem legenda'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[stat('Alcance', p.reach), stat('Visualiz.', p.views), stat('Curtidas', p.likes), stat('Coment.', p.comments), stat('Compart.', p.shares), stat('Salvos', p.saves)].filter(Boolean)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', fontSize: 12, color: 'var(--text-2)' }}>
          <span>{p.at ? new Date(p.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</span>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', textDecoration: 'none' }}>Abrir <ExternalLink size={12} strokeWidth={1.75} /></a>}
        </div>
      </div>
    </article>
  )
}

const SORTS = [
  { v: 'recent', label: 'Mais recentes' },
  { v: 'reach', label: 'Maior alcance' },
  { v: 'interactions', label: 'Mais interações' },
] as const

function kpiTile(k: Kpi) {
  const hasPrev = k.prev != null && k.value != null
  return <MetricTile key={k.key} label={k.label} value={k.value == null ? '—' : compact(k.value)} currentRaw={k.value ?? undefined} prevValue={hasPrev ? k.prev : undefined} note={k.note} />
}

/** Escolher a Página do Facebook do cliente quando o sistema não achou sozinho. Só administrador. */
function LinkPage({ slug, onDone }: { slug: string; onDone: () => Promise<void> }) {
  const [pages, setPages] = useState<Array<{ id: string; name: string; suggested: boolean }> | null>(null)
  const [pageId, setPageId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    apiFetch(`/api/admin/pages?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(r => r.json()).then((j: { pages?: Array<{ id: string; name: string; suggested: boolean }>; error?: string }) => {
        if (!alive) return
        setPages(j.pages ?? []); if (j.error) setErr(j.error)
        const first = j.pages?.find(p => p.suggested); if (first) setPageId(first.id)
      }).catch(() => { if (alive) setErr('Não consegui listar as Páginas agora.') })
    return () => { alive = false }
  }, [slug])

  async function link() {
    if (!pageId || busy) return
    setBusy(true); setErr(null)
    const r = await apiFetch(`/api/admin/clients/${slug}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId }) })
    if (!r.ok) { setBusy(false); return setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Não foi possível vincular.') }
    await onDone()
    setBusy(false)
  }

  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <label htmlFor="link-page" style={{ fontSize: 13, fontWeight: 600 }}>Página do Facebook</label>
      <select id="link-page" className="field" style={{ flex: '1 1 260px', minWidth: 0 }} value={pageId} onChange={e => setPageId(e.target.value)} disabled={!pages || busy}>
        <option value="">{pages === null ? 'Carregando…' : pages.length ? 'Selecione a Página…' : 'Nenhuma Página encontrada'}</option>
        {pages?.map(p => <option key={p.id} value={p.id}>{p.name}{p.suggested ? ' · sugerida' : ''}</option>)}
      </select>
      <button className="btn btn-primary" onClick={link} disabled={!pageId || busy}>{busy ? 'Vinculando…' : 'Vincular e coletar'}</button>
      {err && <p role="alert" style={{ flexBasis: '100%', fontSize: 12, color: 'var(--red)', margin: 0 }}>{err}</p>}
    </div>
  )
}

export function OrganicTab({ preset, presetLabel, canLink = false, slug }: { preset: string; presetLabel: string; canLink?: boolean; slug?: string }) {
  const { view, error, refresh, reload } = useOrganic(preset)
  const [platform, setPlatform] = useState<Platform>('all')
  const [sort, setSort] = useState<(typeof SORTS)[number]['v']>('recent')
  const [more, setMore] = useState(false)

  const plat: Platform = view?.hasIg && view?.hasFb ? platform : view?.hasIg ? 'ig' : view?.hasFb ? 'fb' : 'all'
  const posts = useMemo(() => {
    const list = (view?.posts ?? []).filter(p => plat === 'all' || p.platform === plat)
    return [...list].sort((a, b) => sort === 'recent' ? b.at.localeCompare(a.at) : sort === 'reach' ? (b.reach ?? -1) - (a.reach ?? -1) : b.interactions - a.interactions)
  }, [view, plat, sort])

  if (error && !view) return <Empty title="Não foi possível carregar o orgânico" text={error} />
  if (!view) return <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 40 }}>Carregando…</div>
  if (view.status === 'pending') return <Empty title="Estamos coletando o orgânico" text="Os dados da Página e do Instagram deste cliente chegam nos próximos minutos e passam a se atualizar sozinhos. Volte daqui a pouco." />
  if (view.status === 'no_token') return <Empty title="O orgânico ainda não foi ativado" text="A agência precisa liberar o acesso à Página e ao Instagram para mostrar estes números." />
  if (view.status === 'no_page') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Empty title="Não encontramos a Página deste cliente" text={canLink ? 'A conta de anúncios não aponta para uma Página única. Escolha abaixo a Página do cliente para liberar o orgânico.' : 'Ainda não há uma Página do Facebook ligada a este cliente. A agência pode vincular a Página para liberar o orgânico.'} />
      {canLink && slug && <LinkPage slug={slug} onDone={async () => { await refresh(); await reload() }} />}
    </div>
  )

  const v: OrganicView = view
  const kpis = v.kpis[plat].filter(k => k.key !== 'gained' && k.key !== 'visits') // esses dois são do relatório mensal
  const showIg = plat !== 'fb' && v.hasIg, showFb = plat !== 'ig' && v.hasFb
  const reachSeries = [
    ...(showIg ? [{ label: 'Instagram', color: IG, values: v.series.reachIg }] : []),
    ...(showFb ? [{ label: 'Facebook', color: FB, values: v.series.reachFb }] : []),
  ]
  const wdMax = Math.max(1, ...v.weekdays.map(w => w.avg))
  const bestDay = v.weekdays.filter(w => w.posts > 0).sort((a, b) => b.avg - a.avg)[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Cabeçalho: perfis e plataforma */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {v.hasIg && v.hasFb && (
            <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Plataforma">
              {([['all', 'Todas'], ['ig', 'Instagram'], ['fb', 'Facebook']] as const).map(([k, l]) => <button key={k} className="pill-btn" aria-pressed={plat === k} onClick={() => setPlatform(k)}>{l}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13, color: 'var(--text-2)', flexWrap: 'wrap' }}>
            {v.profile?.ig && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IgMark /> @{v.profile.ig.username}</span>}
            {v.profile?.fb && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FbMark /> {v.profile.fb.name}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-2)' }}>
          {v.at && <span>Atualizado {timeAgo(new Date(v.at).toISOString())}</span>}
        </div>
      </div>
      {v.note && <p role="status" style={{ fontSize: 13, color: 'var(--text-2)', margin: '-12px 0 0' }}>{v.note} <span style={{ opacity: .7 }}>· {presetLabel}</span></p>}

      {/* Números */}
      <div className="tile-grid stagger">{kpis.map(kpiTile)}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right', marginTop: -16 }}>↑↓ vs período anterior equivalente, quando há histórico · dados fechados até ontem</div>

      {/* Alcance por dia + seguidores */}
      <div className="report-cols">
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Alcance por dia</h3>
          {v.series.dates.length > 1 ? <Lines dates={v.series.dates} series={reachSeries} /> : <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Ainda não há dias fechados neste período.</p>}
        </section>
        {showIg && (
          <section className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Novos seguidores por dia (Instagram)</h3>
            {v.series.dates.length > 1 && v.series.gained.some(x => x !== 0) ? <Lines dates={v.series.dates} series={[{ label: 'Saldo de seguidores', color: 'var(--green)', values: v.series.gained.map(x => Math.max(0, x)) }]} /> : <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Sem dados de seguidores neste período. O Instagram só informa isso para contas com 100 seguidores ou mais.</p>}
          </section>
        )}
      </div>

      {/* Publicações */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Publicações do período <span style={{ fontWeight: 400, color: 'var(--text-2)', fontSize: 13 }}>· {posts.length}</span></h3>
          <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Ordenar
            <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{ height: 32, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: 13 }}>
              {SORTS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </label>
        </div>
        {posts.length === 0 ? <Empty title="Nenhuma publicação neste período" text="Escolha um período maior no topo para ver mais publicações." /> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {(more ? posts : posts.slice(0, 8)).map(p => <PostCard key={p.key} p={p} />)}
            </div>
            {posts.length > 8 && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn btn-outline btn-sm" onClick={() => setMore(m => !m)}>{more ? 'Ver menos' : `Ver todas (${posts.length})`}</button></div>}
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Alcance, visualizações e salvos aparecem para as publicações mais recentes de cada plataforma.</p>
          </>
        )}
      </section>

      {/* Stories */}
      {showIg && v.stories.length > 0 && (
        <section className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Stories no ar agora <span style={{ fontWeight: 400, color: 'var(--text-2)', fontSize: 13 }}>· {v.stories.length}</span></h3>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {v.stories.map(s => (
              <a key={s.id} href={s.url ?? undefined} target="_blank" rel="noreferrer" style={{ flexShrink: 0, width: 72, height: 112, borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card2)', display: 'grid', placeItems: 'center' }}>
                {s.thumb ? <img src={s.thumb} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={20} color="var(--text-3)" />}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Melhores dias */}
      <section className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Melhores dias para publicar</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>{bestDay ? `Média de interações por publicação. Até agora, ${DAYS[bestDay.day]} lidera.` : 'Precisa de publicações para calcular.'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'end', height: 120 }}>
          {v.weekdays.map(w => (
            <div key={w.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{w.posts ? compact(w.avg) : ''}</span>
              <span style={{ width: '100%', maxWidth: 36, height: `${Math.max(w.posts ? 6 : 2, (w.avg / wdMax) * 78)}px`, borderRadius: 6, background: w === bestDay ? 'var(--accent)' : 'var(--accent-soft)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{DAYS[w.day]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Público */}
      {showIg && v.audience && (v.audience.age.length > 0 || v.audience.gender.length > 0 || v.audience.city.length > 0) && (
        <div className="report-cols">
          <section className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Quem segue (idade e gênero)</h3>
            <Bars items={[...v.audience.age].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }))} />
            <div style={{ height: 14 }} />
            <Bars items={v.audience.gender.map(g => ({ label: GENDER[g.label] ?? g.label, value: g.value }))} color="var(--green)" />
          </section>
          <section className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>De onde vêm os seguidores</h3>
            <Bars items={v.audience.city} />
            {v.audience.country.length > 0 && <><div style={{ height: 14 }} /><Bars items={v.audience.country} color="var(--green)" /></>}
          </section>
        </div>
      )}

      {v.unavailable.length > 0 && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Algumas métricas não estão disponíveis para esta conta agora, então podem aparecer como “—”.</p>}
    </div>
  )
}
