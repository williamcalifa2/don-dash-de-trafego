'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, Building2, Clock, FileBarChart, Image as ImageIcon, KeyRound, Layers, Loader2, Moon, Pencil, Plus, RefreshCw, Settings2, Sun, Target, ToggleRight, Trash2, UserCheck, Users, Wallet, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { fmtDuration } from '@/lib/usage'
import { KIND_LABEL, KINDS, type ActivityKind } from '@/lib/managers'
import { useTheme } from '@/lib/useTheme'
import { MetricTile } from './MetricTile'
import { ProfileMenu } from './ProfileMenu'
import { PulseLoader } from './PulseLoader'
import { StaffShell } from './StaffShell'
import { BarChart, ListCard, PagedRows, PeriodPicker, RankRow, SubTabs, Thumb, plural, type Period } from './UsageUi'
import { ChartCard, DonutChart, KIND_COLOR, MiniBars, paletteAt, topSlices, type Slice } from './Donut'

const KIND_ICON: Record<ActivityKind, React.ReactNode> = {
  status: <ToggleRight size={18} strokeWidth={1.75} />, budget: <Wallet size={18} strokeWidth={1.75} />, audience: <Users size={18} strokeWidth={1.75} />, creative: <ImageIcon size={18} strokeWidth={1.75} />,
  bid: <Target size={18} strokeWidth={1.75} />, structure: <Layers size={18} strokeWidth={1.75} />, lead: <UserCheck size={18} strokeWidth={1.75} />, report: <FileBarChart size={18} strokeWidth={1.75} />,
  config: <Settings2 size={18} strokeWidth={1.75} />, access: <KeyRound size={18} strokeWidth={1.75} />, sync: <RefreshCw size={18} strokeWidth={1.75} />, client: <Building2 size={18} strokeWidth={1.75} />, other: <Activity size={18} strokeWidth={1.75} />,
}

interface ListManager { id: string; name: string; email: string | null; metaActorId: string | null; metaActorName: string | null; clients: Array<{ slug: string; name: string }>; actions: number; optimizations: number; activeSec: number | null; lastAt: string | null; byKind: Array<{ kind: ActivityKind; n: number }>; daily: number[] }
interface RecentRow { at: string; source: string; kind: ActivityKind; summary: string; clientName: string; managerId: string; managerName: string; actorName: string | null; objectName: string | null }
interface ClientOpt { slug: string; name: string; managerId: string | null }
interface ListData { setup: 'ready' | 'tables' | 'error'; managers: ListManager[]; recent: RecentRow[]; clients: ClientOpt[]; unassigned: ClientOpt[]; lastSync: string | null; totals: { actions: number; optimizations: number } }
interface TimelineRow { at: string; source: string; client_slug: string; clientName: string; actor_key: string | null; actor_name: string | null; kind: ActivityKind; summary: string; object_name: string | null; detail: { from?: string | null; to?: string | null; level?: string } | null }
interface Profile {
  setup: 'ready' | 'tables'; manager: { id: string; name: string; email: string | null; metaActorId: string | null; metaActorName: string | null }; hasEmail: boolean; hasActor: boolean
  totals: { actions: number; optimizations: number; byMe: number; activeSec: number | null; idle: number }
  byKind: Array<{ kind: ActivityKind; n: number }>; daily: Array<{ day: string; n: number }>; hours: number[]; bySource: { app: number; meta: number }
  clients: Array<{ slug: string; name: string; actions: number; optimizations: number; lastAt: string | null; timeSec: number; daysIdle: number }>
  idle: Array<{ slug: string; name: string; lastAt: string | null; daysIdle: number | null }>
  otherTime: Array<{ slug: string; name: string; sec: number }>
  timeline: TimelineRow[]
}
interface Actor { id: string; name: string; n: number; manager: string | null }

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayLabel = (iso: string) => {
  const d = new Date(iso), t = new Date()
  if (d.toDateString() === t.toDateString()) return 'hoje'
  if (new Date(t.getTime() - 86_400_000).toDateString() === d.toDateString()) return 'ontem'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}
const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 3600 ? `há ${Math.max(1, Math.floor(s / 60))} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d` }
const none = (t: string) => <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>{t}</p>
/** Ícone do tipo de ação, na cor do tipo (a mesma do donut). */
function KindChip({ kind, size = 40 }: { kind: ActivityKind; size?: number }) {
  const c = KIND_COLOR[kind] ?? KIND_COLOR.other
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>{KIND_ICON[kind] ?? KIND_ICON.other}</span>
}
/** Tempo curto para o centro do donut: 3h50 ou 25 min. */
const shortDur = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${Math.max(1, m)} min` }

const sqlHint = <div className="card" style={{ padding: 24, fontSize: 14 }}>O banco ainda não tem as tabelas dos gestores. Rode o SQL <code>supabase/2026-09-gestores.sql</code> no Supabase e recarregue a página.</div>

/** Página Equipe: gestores de tráfego, a carteira de clientes de cada um e tudo o que é feito nas contas deles. */
export function TeamManagers() {
  const { theme, toggle } = useTheme()
  const router = useRouter()
  const sp = useSearchParams()
  const sel = sp.get('g')
  const [period, setPeriod] = useState<Period>('7')
  const [list, setList] = useState<ListData | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<null | 'new' | { id: string }>(null)
  const [syncing, setSyncing] = useState(false)
  const [tick, setTick] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const flash = (t: string) => { setNotice(t); setTimeout(() => setNotice(null), 5000) }

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/managers?period=${period}`, { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setFailed(true); return }
      setList(await r.json() as ListData); setFailed(false)
    } catch { setFailed(true) }
  }, [period])
  useEffect(() => { void load() }, [load])
  // Com a página aberta, lê o histórico da Meta a cada 5 min (só com a aba visível) e atualiza os números.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return
      apiFetch('/api/admin/managers/sync', { method: 'POST' }).then(() => { void load(); setTick(t => t + 1) }).catch(() => { })
    }, 5 * 60_000)
    return () => clearInterval(t)
  }, [load])

  async function syncNow() {
    setSyncing(true)
    try {
      const r = await apiFetch('/api/admin/managers/sync', { method: 'POST' })
      const j = await r.json().catch(() => ({})) as { events?: number; clients?: number; dryRun?: boolean; errors?: Array<{ slug: string; error: string }>; throttled?: boolean }
      flash(j.dryRun ? 'A leitura da Meta está em modo de teste (DRY_RUN). Nada foi buscado.' : j.throttled ? 'Aguarde um instante antes de atualizar de novo.' : `Histórico da Meta atualizado: ${plural(j.events ?? 0, 'alteração nova', 'alterações novas')} em ${plural(j.clients ?? 0, 'cliente', 'clientes')}${j.errors?.length ? ` (${j.errors.length} com erro. Primeiro: ${j.errors[0].slug}: ${j.errors[0].error})` : ''}.`)
      await load(); setTick(t => t + 1)
    } finally { setSyncing(false) }
  }

  const current = sel ? list?.managers.find(m => m.id === sel) ?? null : null
  const open = (id: string | null) => router.push(id ? `/admin/equipe?g=${id}` : '/admin/equipe')

  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{current ? current.name : 'Equipe'}</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>{current ? `Gestor de tráfego · ${plural(current.clients.length, 'cliente', 'clientes')}` : 'Gestores de tráfego e o que cada um faz nas contas'}</p>
          </div>
          {current && <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(null)}>Todos os gestores</button>}
          <PeriodPicker value={period} onChange={setPeriod} />
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={syncNow} disabled={syncing} aria-label="Atualizar histórico da Meta" title="Atualizar o histórico de alterações da Meta agora">{syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} strokeWidth={1.75} />}</button>
          {current
            ? <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing({ id: current.id })}><Pencil size={14} strokeWidth={1.75} /> Editar</button>
            : <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Plus size={14} strokeWidth={1.75} /> Novo gestor</button>}
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
          <ProfileMenu />
        </header>

        {notice && <div role="status" className="card" style={{ padding: 12, marginBottom: 16, fontSize: 14 }}>{notice}</div>}
        {failed && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar agora. A equipe de gestores é só para administradores.</div>}
        {!list && !failed && <PulseLoader size={44} />}
        {list?.setup === 'tables' && sqlHint}

        {list?.setup === 'ready' && !current && !sel && <Overview list={list} onOpen={open} onNew={() => setEditing('new')} onAssigned={load} />}
        {list?.setup === 'ready' && sel && !current && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Gestor não encontrado.</div>}
        {list?.setup === 'ready' && current && <ProfileView key={current.id} id={current.id} period={period} tick={tick} onEdit={() => setEditing({ id: current.id })} />}
      </main>

      {editing && list?.setup === 'ready' && (
        <ManagerForm manager={editing === 'new' ? null : list.managers.find(m => m.id === editing.id) ?? null} clients={list.clients} managers={list.managers}
          onClose={() => setEditing(null)}
          onSaved={async id => { setEditing(null); await load(); if (editing === 'new') open(id) }}
          onDeleted={async () => { setEditing(null); await load(); open(null) }} />
      )}
    </StaffShell>
  )
}

function Overview({ list, onOpen, onNew, onAssigned }: { list: ListData; onOpen: (id: string) => void; onNew: () => void; onAssigned: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [today] = useState(() => Date.now())
  async function assign(slug: string, managerId: string) {
    if (!managerId) return
    setBusy(slug)
    const m = list.managers.find(x => x.id === managerId)
    if (m) await apiFetch(`/api/admin/managers/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: m.name, email: m.email, metaActorId: m.metaActorId, metaActorName: m.metaActorName, clients: [...m.clients.map(c => c.slug), slug] }) }).catch(() => null)
    setBusy(null); onAssigned()
  }
  const withManager = list.clients.length - list.unassigned.length
  const perManager: Slice[] = list.managers.map((m, i) => ({ key: m.id, label: m.name, value: m.actions, color: paletteAt(i) }))
  const clientsSlices: Slice[] = [...list.managers.map((m, i) => ({ key: m.id, label: m.name, value: m.clients.length, color: paletteAt(i) })), { key: '_sem', label: 'Sem gestor', value: list.unassigned.length, color: 'hsl(220 9% 72%)' }]
  const days = Math.max(0, ...list.managers.map(m => m.daily.length))
  const teamBars = Array.from({ length: days }, (_, i) => {
    const v = list.managers.reduce((n, m) => n + (m.daily[m.daily.length - days + i] ?? 0), 0)
    const d = new Date(today - (days - 1 - i) * 86_400_000)
    const label = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
    return { label, value: v, title: `${label}: ${plural(v, 'ação', 'ações')}` }
  })
  const kindTotals = new Map<ActivityKind, number>()
  for (const m of list.managers) for (const k of m.byKind) kindTotals.set(k.kind, (kindTotals.get(k.kind) ?? 0) + k.n)
  const kindSlices: Slice[] = [...kindTotals.entries()].map(([kind, n]) => ({ key: kind, label: KIND_LABEL[kind], value: n, color: KIND_COLOR[kind] }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="tile-grid stagger">
        <MetricTile label="Gestores" value={String(list.managers.length)} />
        <MetricTile label="Clientes com gestor" value={String(withManager)} />
        <MetricTile label="Clientes sem gestor" value={String(list.unassigned.length)} />
        <MetricTile label="Ações nas contas" value={String(list.totals.actions)} />
      </div>

      {list.managers.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', boxShadow: 'none' }}>
          <Users size={28} strokeWidth={1.5} color="var(--text-3)" />
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '10px 0 4px' }}>Nenhum gestor cadastrado</h3>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px' }}>Cadastre o gestor de tráfego e escolha quais clientes são dele. A partir daí, tudo que for feito nessas contas fica no perfil dele.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onNew}><Plus size={14} strokeWidth={1.75} /> Novo gestor</button>
        </div>
      ) : (
        <>
          <div className="usage-grid">
            <ChartCard title="Ações por gestor" hint="Quem mais mexeu nas contas no período. Clique para abrir o perfil">
              <DonutChart slices={perManager} center={String(list.totals.actions)} sub="ações" onPick={id => onOpen(id)} />
            </ChartCard>
            <ChartCard title="O que a equipe faz" hint="Ações por tipo, de todos os gestores">
              <DonutChart slices={topSlices(kindSlices, 7)} center={String(list.totals.actions)} sub="ações" />
            </ChartCard>
            <ChartCard title="Clientes por gestor" hint="Como a carteira está dividida">
              <DonutChart slices={clientsSlices} center={String(list.clients.length)} sub="clientes" />
            </ChartCard>
            <ChartCard title="Ações por dia" hint="A equipe toda, pelo painel e pela Meta">
              <div style={{ width: '100%' }}><BarChart bars={teamBars} labelEvery={teamBars.length > 10 ? Math.ceil(teamBars.length / 6) : 1} summary="Ações por dia da equipe" /></div>
            </ChartCard>
          </div>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
            {list.managers.map((m, i) => (
              <button key={m.id} type="button" className="card" onClick={() => onOpen(m.id)} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <Thumb name={m.name} />
                    <i aria-hidden="true" style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: '50%', background: paletteAt(i), border: '2px solid var(--bg-card)' }} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{plural(m.clients.length, 'cliente', 'clientes')}{m.lastAt ? ` · última ação ${ago(m.lastAt)}` : ' · sem ações no período'}</span>
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <DonutChart size={92} thickness={20} legend={false} slices={m.byKind.map(k => ({ key: k.kind, label: KIND_LABEL[k.kind], value: k.n, color: KIND_COLOR[k.kind] }))} center={String(m.actions)} />
                  <span style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                    {([['Ações', String(m.actions)], ['Otimizações', String(m.optimizations)], ['No painel', m.activeSec == null ? '—' : fmtDuration(m.activeSec)], ['Clientes', String(m.clients.length)]] as const).map(([l, v]) => (
                      <span key={l} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>{l}</span>
                        <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                      </span>
                    ))}
                  </span>
                </span>
                {m.daily.length > 1 && (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Ações por dia</span>
                    <MiniBars values={m.daily} color={paletteAt(i)} title={(d, v) => `${plural(v, 'ação', 'ações')} · ${m.daily.length - d - 1 === 0 ? 'hoje' : `há ${m.daily.length - d - 1} d`}`} />
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.clients.length ? m.clients.slice(0, 4).map(c => c.name).join(', ') + (m.clients.length > 4 ? ` +${m.clients.length - 4}` : '') : 'Nenhum cliente na carteira'}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="usage-grid">
        {list.managers.length > 0 && (
          <ListCard icon={<Clock size={18} strokeWidth={1.75} />} tone="green" title="Acontecendo agora" hint="As últimas ações nas contas dos gestores">
            <PagedRows size={5} empty={none('Nenhuma ação registrada ainda.')} rows={list.recent.map((r, i) => (
              <RankRow key={`${r.at}-${i}`} wrap lead={<KindChip kind={r.kind} />} title={r.summary}
                sub={<>{r.clientName}{r.objectName ? ` · ${r.objectName}` : ''}<br />{r.managerName} · {dayLabel(r.at)} às {hm(r.at)}{r.actorName && r.actorName !== r.managerName ? ` · por ${r.actorName}` : ''}</>}
                value={<span className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-2)', fontSize: 11 }}>{r.source === 'meta' ? 'Meta' : 'Painel'}</span>} valueTone="plain" onClick={() => onOpen(r.managerId)} />
            ))} />
          </ListCard>
        )}
        {list.unassigned.length > 0 && list.managers.length > 0 && (
          <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Clientes sem gestor" hint="Nada feito nessas contas entra no perfil de ninguém. Escolha o gestor de cada uma">
            <PagedRows size={5} empty={none('Todos os clientes têm gestor.')} rows={list.unassigned.map(c => (
              <RankRow key={c.slug} lead={<Thumb name={c.name} />} title={c.name} valueTone="plain"
                value={<select className="field" aria-label={`Gestor de ${c.name}`} disabled={busy === c.slug} value="" onChange={e => assign(c.slug, e.target.value)} style={{ height: 32, width: 'auto', fontSize: 12 }}>
                  <option value="">Escolher gestor…</option>
                  {list.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>} />
            ))} />
          </ListCard>
        )}
      </div>
    </div>
  )
}

function ProfileView({ id, period, tick, onEdit }: { id: string; period: Period; tick: number; onEdit: () => void }) {
  const [tab, setTab] = useState<'geral' | 'timeline' | 'clientes'>('geral')
  const [scope, setScope] = useState<'accounts' | 'actor'>('accounts')
  const [client, setClient] = useState('')
  const [kind, setKind] = useState('')
  const [data, setData] = useState<Profile | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const q = new URLSearchParams({ period, scope })
    if (client) q.set('client', client)
    if (kind) q.set('kind', kind)
    apiFetch(`/api/admin/managers/${id}?${q.toString()}`, { cache: 'no-store' }).then(r => r.json()).then((j: Profile) => { if (alive) { setData(j); setFailed(false) } }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [id, period, scope, client, kind, tick])

  const dayBars = useMemo(() => (data?.daily ?? []).map(d => { const [, m, dd] = d.day.split('-'); return { label: `${dd}/${m}`, value: d.n, title: `${dd}/${m}: ${plural(d.n, 'ação', 'ações')}` } }), [data])
  if (failed) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar agora. Tente de novo em instantes.</div>
  if (!data) return <PulseLoader size={44} />
  if (data.setup === 'tables') return sqlHint

  const withTime = [...data.clients.filter(c => c.timeSec > 0).map(c => ({ slug: c.slug, name: c.name, sec: c.timeSec, sub: plural(c.actions, 'ação', 'ações') })), ...data.otherTime.map(o => ({ slug: o.slug, name: o.name, sec: o.sec, sub: 'fora da carteira' }))].sort((a, b) => b.sec - a.sec)
  const goClient = (slug: string) => { setClient(slug); setScope('accounts'); setTab('timeline') }
  const kindSlices: Slice[] = data.byKind.map(k => ({ key: k.kind, label: KIND_LABEL[k.kind], value: k.n, color: KIND_COLOR[k.kind] }))
  const clientSlices = topSlices(data.clients.map((c, i) => ({ key: c.slug, label: c.name, value: c.actions, color: paletteAt(i) })), 7)
  const timeSlices = topSlices(withTime.map((t, i) => ({ key: t.slug, label: t.name, value: t.sec, color: paletteAt(i) })), 7)
  const sourceSlices: Slice[] = [{ key: 'meta', label: 'Gerenciador (Meta)', value: data.bySource.meta, color: 'var(--accent)' }, { key: 'app', label: 'Painel do app', value: data.bySource.app, color: 'var(--green)' }]
  const hourBars = data.hours.map((n, h) => ({ label: `${h}h`, value: n, title: `${h}h: ${plural(n, 'ação', 'ações')}` }))

  const timelineRows = data.timeline.map((r, i) => {
    const change = r.detail && (r.detail.from != null || r.detail.to != null) ? `${r.detail.from ?? '—'} → ${r.detail.to ?? '—'}` : null
    const by = r.actor_name && r.actor_name !== data.manager.name ? ` · por ${r.actor_name}` : ''
    return (
      <RankRow key={`${r.at}-${i}`} wrap lead={<KindChip kind={r.kind} />} title={r.summary}
        sub={<>{r.clientName}{r.object_name ? ` · ${r.detail?.level ? `${r.detail.level} ` : ''}${r.object_name}` : ''}{change ? <><br />{change}</> : null}<br />{dayLabel(r.at)} às {hm(r.at)}{by}</>}
        value={<span className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-2)', fontSize: 11 }}>{r.source === 'meta' ? 'Meta' : 'Painel'}</span>} valueTone="plain" />
    )
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {(!data.hasActor || !data.hasEmail) && (
        <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ flex: 1, minWidth: 240, color: 'var(--text-2)' }}>
            {!data.hasActor && 'Ligue o usuário da Meta deste gestor para registrar o que ele faz no Gerenciador de Anúncios (pausas, orçamento, público, criativos). '}
            {!data.hasEmail && 'Informe o e-mail de login dele para registrar o que faz no painel e medir o tempo em cada cliente.'}
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onEdit}>Completar cadastro</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SubTabs value={tab} onChange={setTab} tabs={[{ key: 'geral', label: 'Visão geral' }, { key: 'timeline', label: 'Linha do tempo' }, { key: 'clientes', label: 'Clientes' }]} />
        {client && <button type="button" className="badge" onClick={() => setClient('')} title="Tirar este filtro" style={{ cursor: 'pointer', background: 'var(--accent-soft)', color: 'var(--text-1)', fontSize: 12, gap: 6, marginLeft: 'auto' }}>Cliente: {data.clients.find(c => c.slug === client)?.name ?? client} <X size={12} /></button>}
      </div>

      {tab === 'geral' && (
        <>
          <div className="tile-grid stagger">
            <MetricTile label="Ações nas contas" value={String(data.totals.actions)} />
            <MetricTile label="Otimizações na Meta" value={String(data.totals.optimizations)} />
            <MetricTile label="Feito por ele" value={String(data.totals.byMe)} />
            <MetricTile label="Tempo no painel" value={data.totals.activeSec == null ? '—' : fmtDuration(data.totals.activeSec)} />
          </div>
          <div className="usage-grid">
            <ChartCard title="O que foi feito" hint="Ações por tipo. Clique num tipo para ver na linha do tempo">
              <DonutChart slices={kindSlices} center={String(data.totals.actions)} sub="ações" onPick={k => { setKind(k); setScope('accounts'); setTab('timeline') }} />
            </ChartCard>
            <ChartCard title="Onde foi feito" hint="Ações por cliente da carteira. Clique para ver o que foi feito">
              <DonutChart slices={clientSlices} center={String(data.clients.length)} sub="clientes" onPick={goClient} />
            </ChartCard>
            <ChartCard title="Tempo por cliente" hint={data.hasEmail ? 'Tempo ativo dele em cada painel de cliente' : undefined}>
              {!data.hasEmail ? <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, textAlign: 'center' }}>Informe o e-mail de login do gestor para medir o tempo em cada cliente.</p>
                : <DonutChart slices={timeSlices} center={shortDur(withTime.reduce((n, t) => n + t.sec, 0))} sub="no painel" unit={fmtDuration} onPick={goClient} />}
            </ChartCard>
            <ChartCard title="Onde as ações acontecem" hint="Gerenciador de Anúncios (Meta) ou painel do app">
              <DonutChart slices={sourceSlices} center={String(data.bySource.app + data.bySource.meta)} sub="ações" />
            </ChartCard>
            <ChartCard title="Ações por dia" hint="Tudo que foi feito nas contas dele">
              <div style={{ width: '100%' }}><BarChart bars={dayBars} labelEvery={dayBars.length > 10 ? Math.ceil(dayBars.length / 6) : 1} summary="Ações por dia" /></div>
            </ChartCard>
            <ChartCard title="Horários de trabalho" hint="Ações por hora do dia (horário de Brasília)">
              <div style={{ width: '100%' }}><BarChart bars={hourBars} labelEvery={4} summary="Ações por hora do dia" /></div>
            </ChartCard>
          </div>
          <div className="usage-grid">
            <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Clientes sem movimentação" hint="Sem nenhuma ação há 7 dias ou mais">
              <PagedRows empty={none('Todos os clientes da carteira tiveram movimentação recente.')} rows={data.idle.map(c => (
                <RankRow key={c.slug} lead={<Thumb name={c.name} />} title={c.name} sub={c.daysIdle == null ? 'Nenhuma ação registrada' : `Última ação ${ago(c.lastAt!)}`} value={c.daysIdle == null ? '—' : `${c.daysIdle} d`} valueTone="plain" onClick={() => goClient(c.slug)} chevron />
              ))} />
            </ListCard>
            <ListCard icon={<Activity size={18} strokeWidth={1.75} />} title="Últimas ações" hint="As mais recentes nas contas dele">
              <PagedRows size={4} empty={none('Nenhuma ação neste período.')} rows={timelineRows.slice(0, 12)} />
            </ListCard>
          </div>
        </>
      )}

      {tab === 'timeline' && (
        <section className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <SubTabs value={scope} onChange={s => { setScope(s); setClient('') }} tabs={[{ key: 'accounts', label: 'Nas contas dele' }, { key: 'actor', label: 'Feito por ele' }]} />
            {scope === 'accounts' && (
              <select className="field" aria-label="Cliente" value={client} onChange={e => setClient(e.target.value)} style={{ height: 32, width: 'auto', minWidth: 160, fontSize: 12 }}>
                <option value="">Todos os clientes</option>
                {data.clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            )}
            <select className="field" aria-label="Tipo de ação" value={kind} onChange={e => setKind(e.target.value)} style={{ height: 32, width: 'auto', minWidth: 160, fontSize: 12 }}>
              <option value="">Todos os tipos</option>
              {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <PagedRows size={8} empty={none(scope === 'actor' && !data.hasActor && !data.hasEmail ? 'Sem e-mail de login nem usuário da Meta ligados a este gestor, não há como saber o que ele fez.' : 'Nenhuma ação neste filtro e período.')} rows={timelineRows} />
          </div>
        </section>
      )}

      {tab === 'clientes' && (
        <div className="usage-grid">
          <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Carteira" hint="Ações, otimizações e tempo em cada cliente. Clique para ver o que foi feito">
            <PagedRows size={6} empty={none('Nenhum cliente na carteira deste gestor.')} rows={data.clients.map(c => (
              <RankRow key={c.slug} lead={<Thumb name={c.name} />} title={c.name}
                sub={<>{plural(c.actions, 'ação', 'ações')} · {plural(c.optimizations, 'otimização', 'otimizações')}<br />{c.lastAt ? `última ${ago(c.lastAt)}` : 'sem ações no período'}</>}
                value={data.hasEmail ? fmtDuration(c.timeSec) : undefined} onClick={() => goClient(c.slug)} chevron />
            ))} />
          </ListCard>
        </div>
      )}
    </div>
  )
}

function ManagerForm({ manager, clients, managers, onClose, onSaved, onDeleted }: {
  manager: ListManager | null; clients: ClientOpt[]; managers: ListManager[]
  onClose: () => void; onSaved: (id: string) => void | Promise<void>; onDeleted: () => void | Promise<void>
}) {
  const [name, setName] = useState(manager?.name ?? '')
  const [email, setEmail] = useState(manager?.email ?? '')
  const [actorId, setActorId] = useState(manager?.metaActorId ?? '')
  const [actorName, setActorName] = useState(manager?.metaActorName ?? '')
  const [picked, setPicked] = useState<Set<string>>(new Set(manager?.clients.map(c => c.slug) ?? []))
  const [search, setSearch] = useState('')
  const [actors, setActors] = useState<Actor[]>([])
  const [team, setTeam] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    apiFetch('/api/admin/managers/actors', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: { actors?: Actor[] } | null) => setActors(j?.actors ?? [])).catch(() => { })
    apiFetch('/api/admin/team', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: { members?: Array<{ email: string }> } | null) => setTeam((j?.members ?? []).map(m => m.email))).catch(() => { })
  }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const ownerOf = useMemo(() => { const m = new Map<string, string>(); for (const g of managers) if (g.id !== manager?.id) for (const c of g.clients) m.set(c.slug, g.name); return m }, [managers, manager])
  const shown = clients.filter(c => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
  const toggle = (slug: string) => setPicked(p => { const n = new Set(p); if (n.has(slug)) n.delete(slug); else n.add(slug); return n })

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy(true); setErr(null)
    const r = await apiFetch(manager ? `/api/admin/managers/${manager.id}` : '/api/admin/managers', { method: manager ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, metaActorId: actorId, metaActorName: actorName, clients: [...picked] }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) as { error?: string; manager?: { id: string } } : {}
    setBusy(false)
    if (!r?.ok) return setErr(j.error ?? 'Não foi possível salvar.')
    await onSaved(j.manager?.id ?? manager?.id ?? '')
  }
  async function remove() {
    if (!manager) return
    setBusy(true)
    const r = await apiFetch(`/api/admin/managers/${manager.id}`, { method: 'DELETE' }).catch(() => null)
    setBusy(false)
    if (!r?.ok) return setErr('Não foi possível remover.')
    await onDeleted()
  }

  const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }
  return (
    <div role="dialog" aria-modal="true" aria-label={manager ? 'Editar gestor' : 'Novo gestor'} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={save} className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}><h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, flex: 1 }}>{manager ? 'Editar gestor' : 'Novo gestor'}</h2><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button></div>

        <label style={label}>Nome<input id="mg-name" className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do gestor" maxLength={60} autoFocus={!manager} /></label>
        <label style={label}>E-mail de login no painel (opcional)
          <input id="mg-email" className="field" type="email" list="mg-team" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@empresa.com" autoComplete="off" />
          <datalist id="mg-team">{team.map(t => <option key={t} value={t} />)}</datalist>
          <span style={{ fontWeight: 400 }}>O que ele faz no painel entra no perfil dele, junto com o tempo em cada cliente.</span>
        </label>
        <label style={label}>Usuário na Meta (opcional)
          <select id="mg-actor" className="field" value={actorId} onChange={e => { const a = actors.find(x => x.id === e.target.value); setActorId(e.target.value); setActorName(a?.name ?? '') }}>
            <option value="">Não ligado</option>
            {manager?.metaActorId && !actors.some(a => a.id === manager.metaActorId) && <option value={manager.metaActorId}>{manager.metaActorName ?? manager.metaActorId}</option>}
            {actors.map(a => <option key={a.id} value={a.id} disabled={!!a.manager && a.id !== manager?.metaActorId}>{a.name} · {plural(a.n, 'alteração', 'alterações')}{a.manager && a.id !== manager?.metaActorId ? ` (já é de ${a.manager})` : ''}</option>)}
          </select>
          <span style={{ fontWeight: 400 }}>{actors.length ? 'Pessoas que aparecem alterando as contas no Gerenciador de Anúncios.' : 'Ainda não li o histórico da Meta. Salve o gestor, atualize o histórico na página e volte aqui para ligar o usuário.'}</span>
        </label>

        <div style={label}>
          <span>Clientes deste gestor ({picked.size})</span>
          <input className="field" aria-label="Buscar cliente" placeholder="Buscar cliente…" value={search} onChange={e => setSearch(e.target.value)} style={{ height: 34, fontSize: 12 }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 4, display: 'flex', flexDirection: 'column' }}>
            {shown.length === 0 && <span style={{ padding: 10, fontWeight: 400 }}>Nenhum cliente encontrado.</span>}
            {shown.map(c => (
              <label key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
                <input type="checkbox" checked={picked.has(c.slug)} onChange={() => toggle(c.slug)} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {ownerOf.has(c.slug) && <span style={{ fontSize: 11, fontWeight: 400, color: picked.has(c.slug) ? 'var(--accent)' : 'var(--text-3)' }}>{picked.has(c.slug) ? `passa de ${ownerOf.get(c.slug)}` : `com ${ownerOf.get(c.slug)}`}</span>}
              </label>
            ))}
          </div>
        </div>

        {err && <p role="alert" style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {manager && (confirm
            ? <><button type="button" className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={remove} disabled={busy}>Remover gestor</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Cancelar</button></>
            : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)} style={{ color: 'var(--red)' }}><Trash2 size={14} strokeWidth={1.75} /> Remover</button>)}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
        {manager && confirm && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>O histórico já registrado é mantido, mas os clientes ficam sem gestor.</p>}
      </form>
    </div>
  )
}
