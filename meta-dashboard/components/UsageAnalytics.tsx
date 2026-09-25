'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Clock, LayoutGrid, Monitor, MonitorSmartphone, Moon, Radio, ShieldCheck, Smartphone, Sun, Tablet, TrendingUp, Users, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { fmtDuration, viewLabel, type Breakdown } from '@/lib/usage'
import { useTheme } from '@/lib/useTheme'
import { MetricTile } from './MetricTile'
import { PulseLoader } from './PulseLoader'
import { ProfileMenu } from './ProfileMenu'
import { StaffShell } from './StaffShell'
import { UsageQuality } from './UsageQuality'
import { BarChart, ListCard, PagedRows, PeriodPicker, RankRow, SubTabs, Thumb, plural, type Period } from './UsageUi'

const ROLE: Record<string, string> = { owner: 'Administrador principal', admin: 'Administrador', member: 'Membro', reader: 'Leitor', client: 'Cliente', desconhecido: '—' }
const TEAM = ['owner', 'admin', 'member', 'reader']
const DEVICE_LABEL: Record<string, string> = { desktop: 'Computador', tablet: 'Tablet', mobile: 'Celular' }
const DEVICE_ICON: Record<string, React.ReactNode> = { desktop: <Monitor size={18} strokeWidth={1.75} />, tablet: <Tablet size={18} strokeWidth={1.75} />, mobile: <Smartphone size={18} strokeWidth={1.75} /> }

interface Visit { sid: string; userKey: string; name: string; role: string; startedAt: string; lastSeen: string; seconds: number; topView: string | null; views: Array<{ view: string; sec: number }>; lastClient: string | null; clientName: string; device: string | null; country: string | null; online: boolean }
interface Person { userKey: string; name: string; role: string; sessions: number; activeSec: number; lastSeen: string; topView: string | null; topClientName: string | null }
interface Overview {
  setup: 'ready' | 'tables'
  client: string | null
  kpis: { online: number; sessions: number; activeSec: number; users: number }
  online: Array<{ userKey: string; name: string; role: string; view: string; client: string; clientName: string; since: string; lastSeen: string; device: string | null }>
  people: Person[]
  byClient: Array<{ slug: string; name: string; sec: number; users: number }>
  byView: Array<{ view: string; sec: number; users: number }>
  visits: Visit[]
  logins: Array<{ at: string; user_key: string; name: string; role: string; client_slug: string | null; clientName: string; ok: boolean; country: string | null; city: string | null; device: string | null }>
  breakdown: Breakdown
  idleClients: Array<{ slug: string; name: string }>
}

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayLabel = (iso: string) => {
  const d = new Date(iso), t = new Date()
  const same = d.toDateString() === t.toDateString()
  const y = new Date(t.getTime() - 86_400_000).toDateString() === d.toDateString()
  return same ? 'hoje' : y ? 'ontem' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}
const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `há ${s}s` : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d` }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', padding: '0 12px 10px', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '12px', fontSize: 13, borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' }
const none = (t: string) => <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>{t}</p>

type Entry = { kind: 'visit'; at: string; v: Visit } | { kind: 'failed'; at: string; l: Overview['logins'][number] }
type Tab = 'geral' | 'clientes' | 'equipe' | 'qualidade' | 'auditoria'

/** Página "Uso do app": quem entrou, quem está online, quanto tempo ficou e em quais telas. O mapa de calor fica na página Heatmap. */
export function UsageAnalytics() {
  const { theme, toggle } = useTheme()
  const [period, setPeriod] = useState<Period>('7')
  const [user, setUser] = useState('')
  const [client, setClient] = useState('')
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<'denied' | 'error' | null>(null)
  const [tab, setTab] = useState<Tab>('geral')

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ period })
      if (user) q.set('user', user)
      if (client) q.set('client', client)
      if (tab === 'auditoria') q.set('limit', '200') // o log completo pede mais linhas
      const r = await apiFetch(`/api/admin/usage/overview?${q.toString()}`, { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setError('denied'); return }
      setData(await r.json() as Overview); setError(null)
    } catch { setError('error') }
  }, [period, user, client, tab])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load() }, 20_000)
    return () => clearInterval(t)
  }, [load])

  const people = useMemo(() => data?.people ?? [], [data])
  const team = people.filter(p => TEAM.includes(p.role))
  const externals = people.filter(p => !TEAM.includes(p.role))
  const clientName = data?.byClient.find(c => c.slug === client)?.name ?? client
  const userName = people.find(p => p.userKey === user)?.name ?? user
  const scope = client ? clientName : ''

  const entries = useMemo<Entry[]>(() => {
    if (!data) return []
    const all: Entry[] = [...data.visits.map(v => ({ kind: 'visit' as const, at: v.startedAt, v })), ...data.logins.map(l => ({ kind: 'failed' as const, at: l.at, l }))]
    return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 250)
  }, [data])

  const maxClient = Math.max(1, ...(data?.byClient ?? []).map(c => c.sec))
  const maxView = Math.max(1, ...(data?.byView ?? []).map(v => v.sec))

  /* ── pedaços reaproveitados nas abas ── */
  const personRows = (list: Person[]) => list.map(p => (
    <RankRow key={p.userKey} lead={<Thumb name={p.name} />} title={p.name}
      sub={`${ROLE[p.role] ?? p.role} · ${plural(p.sessions, client ? 'acesso' : 'sessão', client ? 'acessos' : 'sessões')}${!client && p.topClientName ? ` · mais vê ${p.topClientName}` : ''}${p.topView ? ` · ${viewLabel(p.topView)}` : ''} · ${ago(p.lastSeen)}`}
      value={fmtDuration(p.activeSec)} bar={(p.activeSec / Math.max(1, ...list.map(x => x.activeSec))) * 100} active={user === p.userKey} onClick={() => setUser(u => (u === p.userKey ? '' : p.userKey))} chevron />
  ))

  const entryRows = (list: Entry[]) => list.map(e => e.kind === 'failed'
    ? (
      <RankRow key={`f-${e.at}-${e.l.user_key}`} lead={<Thumb name={e.l.name} />} title={e.l.name}
        sub={`Tentativa recusada · ${dayLabel(e.at)} ${hm(e.at)}${e.l.clientName ? ` · painel ${e.l.clientName}` : ''}`}
        value={<span className="badge" style={{ background: 'var(--red-soft)', color: 'var(--red)', fontSize: 11 }}>Recusada</span>} valueTone="plain" />
    ) : (
      <RankRow key={e.v.sid} lead={<Thumb name={e.v.name} />}
        title={<>{e.v.name} <span className="badge" style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, background: 'var(--bg-card2)', color: 'var(--text-2)' }}>{ROLE[e.v.role] ?? e.v.role}</span></>}
        sub={<>{dayLabel(e.v.startedAt)}: entrou às {hm(e.v.startedAt)} · {e.v.online ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>online agora</span> : <>saiu às {hm(e.v.lastSeen)}{dayLabel(e.v.lastSeen) !== dayLabel(e.v.startedAt) ? ` (${dayLabel(e.v.lastSeen)})` : ''}</>}{(scope || e.v.clientName) ? ` · ${scope || e.v.clientName}` : ''}</>}
        value={fmtDuration(e.v.seconds)} valueTone="green"
        extra={e.v.views.length > 0 ? <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{e.v.views.slice(0, 3).map(x => `${viewLabel(x.view)} ${fmtDuration(x.sec)}`).join(' · ')}</span> : undefined} />
    ))

  const viewRows = (data?.byView ?? []).map((v, i) => <RankRow key={v.view} lead={<Thumb name={String(i + 1)} />} title={viewLabel(v.view)} sub={plural(v.users, 'pessoa', 'pessoas')} value={fmtDuration(v.sec)} bar={(v.sec / maxView) * 100} />)
  const clientRows = (data?.byClient ?? []).map(c => (
    <RankRow key={c.slug} lead={<Thumb name={c.name} />} title={c.name} sub={plural(c.users, 'pessoa', 'pessoas')} value={fmtDuration(c.sec)} bar={(c.sec / maxClient) * 100} active={client === c.slug} onClick={() => setClient(cur => (cur === c.slug ? '' : c.slug))} chevron />
  ))

  const b = data?.breakdown
  const dayBars = (b?.daily ?? []).map(d => { const [, m, dd] = d.day.split('-'); return { label: `${dd}/${m}`, value: d.sec, title: `${dd}/${m}: ${fmtDuration(d.sec)} em ${plural(d.sessions, 'sessão', 'sessões')}` } })
  const hourBars = (b?.hours ?? []).map((n, h) => ({ label: `${h}h`, value: n, title: `${h}h: ${plural(n, 'sessão', 'sessões')} iniciada${n === 1 ? '' : 's'}` }))
  const peakHour = b ? b.hours.reduce((m, n, h) => (n > b.hours[m] ? h : m), 0) : 0
  const deviceTotal = b ? b.devices.desktop + b.devices.tablet + b.devices.mobile : 0

  const idleCard = data ? (
    <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Clientes sem acesso da equipe" hint={client || user ? 'Disponível sem filtros' : 'Nenhum tempo da equipe neste período'}>
              {client || user ? none('Limpe os filtros para ver quais clientes ficaram sem acesso.') : (
                <PagedRows empty={none('A equipe acessou todos os clientes neste período.')} rows={data.idleClients.map(c => (
                  <RankRow key={c.slug} lead={<Thumb name={c.name} />} title={c.name} sub="Sem acesso da equipe" onClick={() => { setClient(c.slug); setTab('clientes') }} chevron />
                ))} />
              )}
            </ListCard>
  ) : null

  const dailyCard = (
    <ListCard icon={<TrendingUp size={18} strokeWidth={1.75} />} title="Tempo ativo por dia" hint="Quanto tempo o app ficou em uso em cada dia">
              <BarChart bars={dayBars} labelEvery={dayBars.length > 10 ? Math.ceil(dayBars.length / 6) : 1} summary="Tempo ativo por dia" />
            </ListCard>
  )

  const pageBody = (
    <>
      {tab === 'geral' && data && (
        <>
          <div className="tile-grid stagger">
            <MetricTile label="Online agora" value={String(data.kpis.online)} />
            <MetricTile label="Pessoas" value={String(data.kpis.users)} />
            <MetricTile label={client ? 'Acessos' : 'Sessões'} value={String(data.kpis.sessions)} />
            <MetricTile label={client ? `Tempo em ${clientName}` : 'Tempo ativo'} value={fmtDuration(data.kpis.activeSec)} />
          </div>
          <div className="usage-grid">
            <ListCard icon={<Radio size={18} strokeWidth={1.75} />} tone="green" title={client ? `Online em ${clientName}` : 'Online agora'} hint="Quem está com o app aberto e o que está vendo">
              <PagedRows empty={none(client ? `Ninguém vendo ${clientName} agora.` : 'Ninguém com o app aberto agora.')} rows={data.online.map(o => (
                <RankRow key={o.userKey} lead={<Thumb name={o.name} />} title={o.name}
                  sub={<>vendo {viewLabel(o.view)}{o.clientName ? ` de ${o.clientName}` : ''} · entrou {ago(o.since)}</>}
                  value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{o.device && <MonitorSmartphone size={14} color="var(--text-3)" aria-label={o.device} />}<span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--green)', fontSize: 11, gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />online</span></span>} valueTone="plain" />
              ))} />
            </ListCard>
            <ListCard icon={<Clock size={18} strokeWidth={1.75} />} title="Acessos recentes" hint="Hora que entrou, hora que saiu e onde ficou" right={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab('auditoria')}>Ver log completo</button>}>
              <PagedRows size={3} empty={none('Nenhuma entrada neste período.')} rows={entryRows(entries)} />
            </ListCard>
            {dailyCard}
            <ListCard icon={<Clock size={18} strokeWidth={1.75} />} title="Horários de mais uso" hint={deviceTotal ? `Sessões por hora do dia (horário de Brasília). Pico às ${peakHour}h` : 'Sessões por hora do dia (horário de Brasília)'}>
              <BarChart bars={hourBars} labelEvery={6} summary="Sessões por hora do dia" />
            </ListCard>
            {idleCard}
            <ListCard icon={<MonitorSmartphone size={18} strokeWidth={1.75} />} title="Aparelhos" hint="De onde as pessoas abrem o app">
              {deviceTotal === 0 ? none('Ainda sem sessões neste período.') : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(['desktop', 'mobile', 'tablet'] as const).map(k => (
                    <RankRow key={k} lead={<Thumb icon={DEVICE_ICON[k]} />} title={DEVICE_LABEL[k]} sub={plural(b!.devices[k], 'sessão', 'sessões')} value={`${Math.round((b!.devices[k] / deviceTotal) * 100)}%`} valueTone="accent" bar={(b!.devices[k] / deviceTotal) * 100} />
                  ))}
                </div>
              )}
            </ListCard>
          </div>
        </>
      )}

      {tab === 'clientes' && data && (
        <>
          <div className="usage-grid">
            <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Ranking de clientes" hint={client ? 'Clique no cliente marcado para ver todos de novo' : 'Por tempo de uso. Clique em um cliente para ver quem acessou'}>
              <PagedRows empty={none('Ainda sem tempo registrado em painéis de clientes.')} rows={clientRows} />
            </ListCard>
            <ListCard icon={<LayoutGrid size={18} strokeWidth={1.75} />} title={client ? `Telas mais usadas em ${clientName}` : 'Telas mais usadas'} hint={client ? 'Onde as pessoas passaram mais tempo nesse cliente' : 'Em todos os clientes'}>
              <PagedRows empty={none('Ainda sem tempo registrado.')} rows={viewRows} />
            </ListCard>
            {dailyCard}
            {idleCard}
            {client && (
              <>
                <ListCard icon={<Users size={18} strokeWidth={1.75} />} title={`Quem acessou ${clientName}`} hint="Clique em uma pessoa para filtrar por ela">
                  <PagedRows empty={none(`Ninguém acessou ${clientName} neste período.`)} rows={personRows(people)} />
                </ListCard>
                <ListCard icon={<Clock size={18} strokeWidth={1.75} />} title={`Acessos a ${clientName}`} hint="Quando entrou, quanto tempo ficou e em quais telas">
                  <PagedRows size={4} empty={none('Nenhum acesso neste período.')} rows={entryRows(entries)} />
                </ListCard>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'equipe' && data && (
        <>
          <div className="tile-grid stagger">
            <MetricTile label="Tempo ativo da equipe" value={fmtDuration(team.reduce((n, p) => n + p.activeSec, 0))} />
            <MetricTile label="Membros ativos" value={String(team.length)} />
            <MetricTile label="Sessões" value={String(team.reduce((n, p) => n + p.sessions, 0))} />
            <MetricTile label="Média por membro" value={team.length ? fmtDuration(Math.round(team.reduce((n, p) => n + p.activeSec, 0) / team.length)) : '—'} />
          </div>
          <div className="usage-grid">
            <ListCard icon={<Users size={18} strokeWidth={1.75} />} title="Equipe" hint="Tempo ativo de cada membro. Clique para filtrar por ele">
              <PagedRows empty={none('Ninguém da equipe neste período.')} rows={personRows(team)} />
            </ListCard>
            <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Clientes usando o painel" hint="Pessoas dos clientes que entraram no período">
              <PagedRows empty={none('Nenhum cliente entrou neste período.')} rows={personRows(externals)} />
            </ListCard>
            <ListCard icon={<TrendingUp size={18} strokeWidth={1.75} />} title="Tempo ativo por dia" hint="Da equipe e dos clientes juntos">
              <BarChart bars={dayBars} labelEvery={dayBars.length > 10 ? Math.ceil(dayBars.length / 6) : 1} summary="Tempo ativo por dia" />
            </ListCard>
            <ListCard icon={<LayoutGrid size={18} strokeWidth={1.75} />} title="Telas mais usadas" hint="Onde o tempo foi gasto">
              <PagedRows empty={none('Ainda sem tempo registrado.')} rows={viewRows} />
            </ListCard>
          </div>
        </>
      )}

      {tab === 'qualidade' && <UsageQuality period={period} client={client} user={user} onUser={k => setUser(u => (u === k ? '' : k))} />}

      {tab === 'auditoria' && data && (
        <section className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={18} strokeWidth={1.75} color="var(--accent)" aria-hidden="true" />
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Log de acessos</h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>Todas as entradas do período, com hora que entrou, hora que saiu (último sinal) e as tentativas recusadas</p>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead><tr>{['Data', 'Pessoa', 'Papel', 'Painel', 'Entrou', 'Saiu', 'Tempo', 'Aparelho', 'Resultado'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {entries.map(e => e.kind === 'failed' ? (
                  <tr key={`f-${e.at}-${e.l.user_key}`}>
                    <td style={td}>{dayLabel(e.at)}</td><td style={{ ...td, fontWeight: 600 }}>{e.l.name}</td><td style={td}>{ROLE[e.l.role] ?? e.l.role}</td><td style={td}>{e.l.clientName || 'Administração'}</td>
                    <td style={td}>{hm(e.at)}</td><td style={td}>—</td><td style={td}>—</td><td style={td}>{e.l.device ?? '—'}{e.l.country ? ` · ${e.l.country}` : ''}</td>
                    <td style={td}><span className="badge" style={{ background: 'var(--red-soft)', color: 'var(--red)', fontSize: 11 }}>Recusada</span></td>
                  </tr>
                ) : (
                  <tr key={e.v.sid}>
                    <td style={td}>{dayLabel(e.v.startedAt)}</td><td style={{ ...td, fontWeight: 600 }}>{e.v.name}</td><td style={td}>{ROLE[e.v.role] ?? e.v.role}</td><td style={td}>{e.v.clientName || 'Administração'}</td>
                    <td style={td}>{hm(e.v.startedAt)}</td><td style={td}>{e.v.online ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>online agora</span> : hm(e.v.lastSeen)}</td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(e.v.seconds)}</td><td style={td}>{e.v.device ?? '—'}{e.v.country ? ` · ${e.v.country}` : ''}</td>
                    <td style={td}><span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--green)', fontSize: 11 }}>Entrou</span></td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan={9} style={{ ...td, color: 'var(--text-2)' }}>Nenhum acesso neste período.</td></tr>}
              </tbody>
            </table>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>A hora de saída é o último sinal do app aberto (o app não tem um botão de sair para todos os casos). Mostra até 200 acessos.</p>
        </section>
      )}
    </>
  )

  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Uso do app</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Quem entrou, quem está online, quanto tempo ficou e em quais telas</p>
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
          <ProfileMenu />
        </header>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          <SubTabs value={tab} onChange={setTab} tabs={[{ key: 'geral', label: 'Visão geral' }, { key: 'clientes', label: 'Por cliente' }, { key: 'equipe', label: 'Por equipe' }, { key: 'qualidade', label: 'Qualidade' }, { key: 'auditoria', label: 'Auditoria de acessos' }]} />
          {(client || user) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }} aria-label="Filtros ligados">
              {client && <button type="button" className="badge" onClick={() => setClient('')} title="Tirar este filtro" style={{ cursor: 'pointer', background: 'var(--accent-soft)', color: 'var(--text-1)', fontSize: 12, gap: 6 }}>Cliente: {clientName} <X size={12} /></button>}
              {user && <button type="button" className="badge" onClick={() => setUser('')} title="Tirar este filtro" style={{ cursor: 'pointer', background: 'var(--accent-soft)', color: 'var(--text-1)', fontSize: 12, gap: 6 }}>Pessoa: {userName} <X size={12} /></button>}
            </div>
          )}
        </div>

        {error === 'denied' && <div className="card" style={{ padding: 32, textAlign: 'center' }}>A análise de uso é só para administradores.</div>}
        {!data && !error && <PulseLoader size={44} />}
        {error === 'error' && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar agora. Tente de novo em instantes.</div>}
        {data?.setup === 'tables' && <div className="card" style={{ padding: 24, fontSize: 14 }}>O banco ainda não tem as tabelas da análise de uso. Rode o SQL <code>supabase/2026-09-usage-analytics.sql</code> no Supabase e recarregue a página.</div>}

        {data && data.setup === 'ready' && <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>{pageBody}</div>}
      </main>
    </StaffShell>
  )
}
