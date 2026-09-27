'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Flame, Moon, MousePointerClick, Sun } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { viewLabel, type Device, type TopElement } from '@/lib/usage'
import { useTheme } from '@/lib/useTheme'
import { PulseLoader } from './PulseLoader'
import { ProfileMenu } from './ProfileMenu'
import { StaffShell } from './StaffShell'
import { FilterField, FilterPicker, ListCard, PeriodPicker, RankRow, SubTabs, Thumb, plural, type Period } from './UsageUi'

const DEVICES: Array<[Device, string, number]> = [['desktop', 'Computador', 1280], ['tablet', 'Tablet', 820], ['mobile', 'Celular', 390]]
const ROLE: Record<string, string> = { owner: 'Administrador principal', admin: 'Administrador', member: 'Membro', reader: 'Leitor', client: 'Cliente' }
type Mode = 'clicks' | 'rage' | 'dead' | 'scroll'
const MODES: Array<{ key: Mode; label: string }> = [{ key: 'clicks', label: 'Cliques' }, { key: 'rage', label: 'Cliques de raiva' }, { key: 'dead', label: 'Cliques mortos' }, { key: 'scroll', label: 'Rolagem' }]
/** Como cada modo se chama na tela: título da lista, unidade, legenda do calor e o que dizer quando não há dados. */
const MODE_INFO: Record<Mode, { list: string; hint: string; one: string; many: string; low: string; high: string; empty: string; top: string; topSub: string }> = {
  clicks: { list: 'Telas com cliques', hint: 'Escolha uma tela para ver o calor', one: 'clique', many: 'cliques', low: 'menos cliques', high: 'mais cliques', empty: 'Nenhuma tela com cliques neste filtro', top: 'Elementos mais clicados', topSub: 'Cliques' },
  rage: { list: 'Telas com cliques de raiva', hint: 'Cliques repetidos no mesmo ponto: a pessoa esperava uma resposta', one: 'clique de raiva', many: 'cliques de raiva', low: 'menos raiva', high: 'mais raiva', empty: 'Nenhum clique de raiva neste filtro', top: 'Onde mais clicaram com raiva', topSub: 'Cliques de raiva' },
  dead: { list: 'Telas com cliques mortos', hint: 'Cliques em algo que parece botão e não fez nada', one: 'clique morto', many: 'cliques mortos', low: 'menos cliques mortos', high: 'mais cliques mortos', empty: 'Nenhum clique morto neste filtro', top: 'Onde mais clicaram sem resposta', topSub: 'Cliques mortos' },
  scroll: { list: 'Telas com rolagem', hint: 'Só telas mais compridas que a janela entram aqui', one: 'visita', many: 'visitas', low: 'poucos chegam', high: 'todos chegam', empty: 'Nenhuma rolagem neste filtro', top: 'Até onde as pessoas descem', topSub: 'Visitas' },
}
const DASHBOARD_TABS = ['metrics', 'campaigns', 'organic', 'audience', 'funnel', 'leads', 'ecommerce', 'reports', 'integracoes']
interface ScreenRow { view: string; clicks: number; users: number; topClient: string | null }
interface Options { byClient: Array<{ slug: string; name: string }>; people: Array<{ userKey: string; name: string; role: string }> }
interface Stats { total: number; users: number; missing: number }

/** Como a tela abre dentro do visualizador. Devolve o endereço, ou o motivo de não abrir. */
function target(view: string, renderClient: string): { path: string; sub?: string } | { reason: string } {
  const [base, sub, ...more] = view.split('/')
  if (view === 'admin' || view === 'admin/reports' || view === 'admin/uso' || view === 'admin/equipe') return { path: `/${view}` }
  if (DASHBOARD_TABS.includes(base)) {
    if (sub && !more.length && base === 'ecommerce' && (sub === 'live' || sub === 'carrinhos')) return renderClient ? { path: `/dashboard/${renderClient}`, sub } : { reason: 'client' }
    if (!sub) return renderClient ? { path: `/dashboard/${renderClient}` } : { reason: 'client' }
    return { reason: 'layer' }
  }
  if (view === 'admin/apresentar') return { reason: 'presentation' }
  return { reason: 'layer' }
}

const REASONS: Record<string, string> = {
  client: 'Escolha um cliente no filtro (ou em "Mostrar no cliente") para ver esta tela.',
  layer: 'Esta é uma janela ou painel que abre por cima de outra tela quando alguém clica, então não dá para mostrá-la sozinha. Veja abaixo os elementos mais clicados nela.',
  presentation: 'A apresentação só existe com um relatório aberto, então não dá para abri-la aqui. Veja abaixo os elementos mais clicados nela.',
}

/** Página Heatmap: lista as telas que tiveram cliques e mostra cada uma com o calor por cima, para navegar entre elas. */
export function HeatmapViewer() {
  const { theme, toggle } = useTheme()
  const [period, setPeriod] = useState<Period>('7')
  const [client, setClient] = useState('')
  const [user, setUser] = useState('')
  const [device, setDevice] = useState<Device>('desktop')
  const [mode, setMode] = useState<Mode>('clicks')
  const [bands, setBands] = useState<number[] | null>(null)
  const [renderClient, setRenderClient] = useState('')
  const [opts, setOpts] = useState<Options>({ byClient: [], people: [] })
  const [screens, setScreens] = useState<ScreenRow[] | null>(null)
  const [setup, setSetup] = useState<string | null>(null)
  const [selected, setSelected] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [top, setTop] = useState<TopElement[] | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  const [boxW, setBoxW] = useState(900)
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let alive = true
    // Pessoas: só quem realmente usou o app no período. Clientes: todos, mesmo os sem cliques ainda, senão não dá pra escolher um cliente novo.
    Promise.all([
      apiFetch(`/api/admin/usage/overview?period=${period}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)) as Promise<{ people?: Array<{ userKey: string; name: string; role: string }> } | null>,
      apiFetch('/api/admin/clients/names', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)) as Promise<{ clients?: Array<{ slug: string; name: string }> } | null>,
    ]).then(([usage, names]) => {
      if (!alive) return
      setOpts({ byClient: [...(names?.clients ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), people: usage?.people ?? [] })
    }).catch(() => { })
    return () => { alive = false }
  }, [period])

  const filters = useCallback(() => {
    const q = new URLSearchParams({ period, device, mode })
    if (client) q.set('client', client)
    if (user) q.set('user', user)
    return q
  }, [period, device, client, user, mode])

  useEffect(() => {
    let alive = true
    setScreens(null)
    apiFetch(`/api/admin/usage/heatmap?${filters().toString()}`, { cache: 'no-store' }).then(r => r.json()).then((j: { setup?: string; views?: ScreenRow[] }) => {
      if (!alive) return
      setSetup(j.setup ?? null)
      const list = j.views ?? []
      setScreens(list)
      setSelected(cur => (list.some(v => v.view === cur) ? cur : list[0]?.view ?? ''))
    }).catch(() => { if (alive) { setSetup('error'); setScreens([]) } })
    return () => { alive = false }
  }, [filters])

  // Elementos mais clicados da tela escolhida (funciona para qualquer tela, inclusive as que não abrem aqui).
  useEffect(() => {
    if (!selected) { setTop(null); setBands(null); return }
    let alive = true
    setTop(null); setBands(null)
    const q = filters(); q.set('view', selected)
    if (mode !== 'scroll') q.set('top', '1')
    apiFetch(`/api/admin/usage/heatmap?${q.toString()}`, { cache: 'no-store' }).then(r => r.json()).then((j: { top?: TopElement[]; bands?: number[] }) => { if (alive) { setTop(j.top ?? []); setBands(j.bands ?? []) } }).catch(() => { if (alive) { setTop([]); setBands([]) } })
    return () => { alive = false }
  }, [selected, filters, mode])

  const current = useMemo(() => (screens ?? []).find(v => v.view === selected) ?? null, [screens, selected])
  useEffect(() => { setRenderClient(client || current?.topClient || opts.byClient[0]?.slug || '') }, [client, current, opts.byClient])

  const width = DEVICES.find(d => d[0] === device)?.[2] ?? 1280
  const tgt = current ? target(current.view, renderClient) : null
  const src = useMemo(() => {
    if (!current || !tgt || !('path' in tgt)) return null
    const q = new URLSearchParams({ hm: '1', hm_embed: '1', hm_period: period, hm_mode: mode, hm_view: current.view })
    if (client) q.set('hm_client', client)
    if (user) q.set('hm_user', user)
    if (tgt.path.startsWith('/dashboard/')) q.set('tab', current.view.split('/')[0])
    if (tgt.sub) q.set('sub', tgt.sub)
    return `${tgt.path}?${q.toString()}`
  }, [current, tgt, period, client, user, mode])

  useEffect(() => { setFrameReady(false); setStats(null) }, [src, width])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth))
    ro.observe(el); setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [src])

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      const d = e.data as { type?: string; total?: number; users?: number; missing?: number }
      if (d?.type === 'hm-data') setStats(s => ({ total: d.total ?? 0, users: d.users ?? 0, missing: s?.missing ?? 0 }))
      if (d?.type === 'hm-stats') setStats(s => ({ total: s?.total ?? 0, users: s?.users ?? 0, missing: d.missing ?? 0 }))
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])

  const go = useCallback((delta: number) => {
    const list = screens ?? []
    const i = list.findIndex(v => v.view === selected)
    const next = list[(i + delta + list.length) % list.length]
    if (next) setSelected(next.view)
  }, [screens, selected])

  const scale = Math.min(1, boxW / width)
  const frameH = 820
  const active = (client ? 1 : 0) + (user ? 1 : 0) + (device !== 'desktop' ? 1 : 0)
  const maxClicks = Math.max(1, ...(screens ?? []).map(v => v.clicks))
  const maxTop = Math.max(1, ...(top ?? []).map(t => t.n))
  const openPath = tgt && 'path' in tgt ? tgt.path : null
  const info = MODE_INFO[mode]

  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Heatmap</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Onde as pessoas clicam em cada tela do app</p>
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
          <FilterPicker active={active} onClear={() => { setClient(''); setUser(''); setDevice('desktop') }}>
            <FilterField label="Aparelho">
              <select className="field" value={device} onChange={e => setDevice(e.target.value as Device)}>
                {DEVICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </FilterField>
            <FilterField label="Cliente">
              <select className="field" value={client} onChange={e => setClient(e.target.value)}>
                <option value="">Todos os clientes</option>
                {opts.byClient.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Pessoa">
              <select className="field" value={user} onChange={e => setUser(e.target.value)}>
                <option value="">Todas as pessoas</option>
                {opts.people.map(p => <option key={p.userKey} value={p.userKey}>{p.name} · {ROLE[p.role] ?? p.role}</option>)}
              </select>
            </FilterField>
          </FilterPicker>
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
          <ProfileMenu />
        </header>

        <div style={{ marginBottom: 24 }}><SubTabs value={mode} onChange={setMode} tabs={MODES} /></div>

        {screens === null && <PulseLoader size={44} />}
        {setup === 'events' && <div className="card" style={{ padding: 24, fontSize: 14 }}>O banco ainda não tem a tabela de sinais de qualidade. Rode o SQL <code>supabase/2026-09-usage-analytics-3.sql</code> no Supabase.</div>}
        {setup === 'tables' && <div className="card" style={{ padding: 24, fontSize: 14 }}>O banco ainda não tem as tabelas da análise de uso. Rode o SQL <code>supabase/2026-09-usage-analytics.sql</code> no Supabase.</div>}

        {screens && setup !== 'tables' && setup !== 'events' && screens.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', boxShadow: 'none' }}>
            <MousePointerClick size={28} strokeWidth={1.5} color="var(--text-3)" />
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '10px 0 4px' }}>{info.empty}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{mode === 'clicks' ? 'Os cliques passam a ser coletados conforme as pessoas usam o app. Tente outro período ou aparelho, ou volte depois de algumas horas de uso.' : 'Isso só aparece quando acontece. Tente outro período ou aparelho, ou volte depois de mais uso do app.'}</p>
          </div>
        )}

        {screens && setup !== 'tables' && setup !== 'events' && screens.length > 0 && (
          <div className="hm-layout">
            <ListCard icon={<Flame size={18} strokeWidth={1.75} />} title={info.list} hint={info.hint}>
              {screens.map((v, i) => (
                <RankRow key={v.view} wrap lead={<Thumb name={String(i + 1)} />} title={viewLabel(v.view)} sub={`${v.clicks === 1 ? info.one : info.many} · ${plural(v.users, 'pessoa', 'pessoas')}`}
                  value={v.clicks} valueTone="accent" bar={(v.clicks / maxClicks) * 100} active={v.view === selected} onClick={() => setSelected(v.view)} />
              ))}
            </ListCard>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
              <section className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => go(-1)} aria-label="Tela anterior" title="Tela anterior"><ChevronLeft size={16} /></button>
                  <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => go(1)} aria-label="Próxima tela" title="Próxima tela"><ChevronRight size={16} /></button>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{current ? viewLabel(current.view) : ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {src ? (stats ? (stats.total === 0 ? 'Nada registrado neste aparelho e período' : `${plural(stats.total, info.one, info.many)} de ${plural(stats.users, 'pessoa', 'pessoas')}${stats.missing > 0 ? ` · ${stats.missing} em elementos que não aparecem agora` : ''}`) : 'Carregando o mapa…')
                        : current ? `${plural(current.clicks, info.one, info.many)} de ${plural(current.users, 'pessoa', 'pessoas')}` : ''}
                    </div>
                  </div>
                  {openPath?.startsWith('/dashboard/') && !client && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>Mostrar no cliente
                      <select className="field" style={{ height: 32, width: 'auto', minWidth: 160 }} value={renderClient} onChange={e => setRenderClient(e.target.value)}>
                        {opts.byClient.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                      </select>
                    </label>
                  )}
                  {openPath && <a className="btn btn-ghost btn-sm" href={openPath} target="_blank" rel="noopener noreferrer" title="Abrir a tela de verdade em outra aba"><ExternalLink size={14} strokeWidth={1.75} /> Abrir a tela</a>}
                </div>

                {!src ? (
                  <div style={{ padding: '28px 24px', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.6, border: '1px dashed var(--border)', borderRadius: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <MousePointerClick size={18} color="var(--text-3)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                    <span>{tgt && 'reason' in tgt ? REASONS[tgt.reason] : ''}</span>
                  </div>
                ) : (
                  <div ref={box} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ position: 'relative', width: width * scale, height: frameH * scale, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      {!frameReady && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 2, background: 'var(--bg)' }}><PulseLoader size={40} /></div>}
                      <iframe key={`${src}|${width}`} ref={frame} src={src} title={`Mapa de calor: ${current ? viewLabel(current.view) : ''}`} onLoad={() => setFrameReady(true)}
                        style={{ width, height: frameH, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block' }} />
                    </div>
                  </div>
                )}
                {src && (
                  <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-3)' }}>
                    <span>{info.low}</span>
                    <span style={{ flex: 1, maxWidth: 220, height: 8, borderRadius: 9999, background: 'linear-gradient(90deg, rgb(40,80,255), rgb(0,220,255), rgb(60,230,90), rgb(255,230,40), rgb(255,40,30))' }} />
                    <span>{info.high}</span>
                  </div>
                )}
              </section>

              {mode === 'scroll' ? (
                <ListCard icon={<MousePointerClick size={18} strokeWidth={1.75} />} title={info.top} hint={current ? `Em ${viewLabel(current.view)}` : undefined}>
                  {bands === null ? <PulseLoader size={28} inline /> : bands.length === 0
                    ? <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Sem rolagem neste filtro.</p>
                    : ([25, 50, 75, 95] as const).map(p => {
                      const share = Math.round((bands[Math.min(bands.length - 1, Math.floor((p / 100) * bands.length))] ?? 0) * 100)
                      return <RankRow key={p} lead={<Thumb name={`${p}%`} />} title={`Chegam a ${p === 95 ? 'o fim' : `${p}%`} da página`} sub={p === 95 ? 'Viram o final da tela' : `Descem até ${p}% da altura`} value={`${share}%`} valueTone="accent" bar={share} />
                    })}
                </ListCard>
              ) : (
                <ListCard icon={<MousePointerClick size={18} strokeWidth={1.75} />} title={info.top} hint={current ? `Em ${viewLabel(current.view)}` : undefined}>
                  {top === null ? <PulseLoader size={28} inline /> : top.length === 0
                    ? <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Nada registrado neste filtro.</p>
                    : top.map((t, i) => (
                      <RankRow key={`${t.sel}-${i}`} lead={<Thumb name={String(i + 1)} />} title={t.label ?? (t.sel === 'body' ? 'Área da página (fora de botões)' : 'Elemento sem nome (célula, linha ou campo)')}
                        sub={t.label ? 'Botão, aba ou link' : t.sel === 'body' ? 'Cliques em espaços vazios ou cartões grandes' : 'Nomes de pessoas não são guardados'}
                        value={plural(t.n, info.one, info.many)} valueTone="accent" bar={(t.n / maxTop) * 100} />
                    ))}
                </ListCard>
              )}
            </div>
          </div>
        )}
      </main>
    </StaffShell>
  )
}
