'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity, ArrowLeft, ArrowRight, Building2, Clock, FileBarChart, Image as ImageIcon, KeyRound, Layers, Loader2, Moon, Pencil, Plus, RefreshCw, Settings2, Sun, Target, ToggleRight, Trash2, UserCheck, Users, Wallet, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { fmtDuration } from '@/lib/usage'
import { fileToLogoDataUrl } from '@/lib/resizeLogo'
import { KIND_LABEL, KINDS, type ActivityKind } from '@/lib/managers'
import { useTheme } from '@/lib/useTheme'
import { MetricTile } from './MetricTile'
import { Sparkline } from './Sparkline'
import { TaskPanel } from './Tasks'
import { ProfileMenu } from './ProfileMenu'
import { PulseLoader } from './PulseLoader'
import { StaffShell } from './StaffShell'
import { StalledAccounts } from './StalledAccounts'
import { AccessCard } from './AccessCard'
import { JustificationsCard, type JItem } from './JustificationsCard'
import { BarChart, ListCard, PagedRows, PeriodPicker, RankRow, SubTabs, Thumb, plural } from './UsageUi'
import { RANGE_LABEL, RANGE_PERIODS, type RangePeriod } from '@/lib/usage'
import { ChartCard, DonutChart, KIND_COLOR, paletteAt, topSlices, type Slice } from './Donut'

const KIND_ICON: Record<ActivityKind, React.ReactNode> = {
  status: <ToggleRight size={18} strokeWidth={1.75} />, budget: <Wallet size={18} strokeWidth={1.75} />, audience: <Users size={18} strokeWidth={1.75} />, creative: <ImageIcon size={18} strokeWidth={1.75} />,
  bid: <Target size={18} strokeWidth={1.75} />, structure: <Layers size={18} strokeWidth={1.75} />, lead: <UserCheck size={18} strokeWidth={1.75} />, report: <FileBarChart size={18} strokeWidth={1.75} />,
  config: <Settings2 size={18} strokeWidth={1.75} />, access: <KeyRound size={18} strokeWidth={1.75} />, sync: <RefreshCw size={18} strokeWidth={1.75} />, client: <Building2 size={18} strokeWidth={1.75} />, other: <Activity size={18} strokeWidth={1.75} />,
}

interface Score { made: number | null; worked: number; total: number; stalled: number; perDay: number | null; lastOwnAt: string | null }
const PERIOD_OPTIONS = RANGE_PERIODS.map(p => [p, RANGE_LABEL[p]] as [RangePeriod, string])
interface ListManager { score: Score; pending: number; id: string; name: string; email: string | null; avatarUrl: string | null; metaActorId: string | null; metaActorName: string | null; clients: Array<{ slug: string; name: string }>; actions: number; optimizations: number; activeSec: number | null; lastAt: string | null; byKind: Array<{ kind: ActivityKind; n: number }>; daily: number[] }
interface LogView { title: string; object: string | null; change: string | null; level: string | null }
interface RecentRow extends LogView { clientLogo?: string | null; managerAvatar: string | null; at: string; source: string; kind: ActivityKind; summary: string; clientName: string; managerId: string; managerName: string; actorName: string | null; objectName: string | null }
interface ClientOpt { slug: string; name: string; logoUrl?: string | null; managerId: string | null }
interface ListData { justifications?: { answered: JItem[]; pending: JItem[] }; setup: 'ready' | 'tables' | 'error'; managers: ListManager[]; recent: RecentRow[]; unlinkedMembers: string[]; clients: ClientOpt[]; unassigned: ClientOpt[]; lastSync: string | null; totals: { pending: number; actions: number; optimizations: number } }
interface TimelineRow { view: LogView; clientLogo?: string | null; at: string; source: string; client_slug: string; clientName: string; actor_key: string | null; actor_name: string | null; kind: ActivityKind; summary: string; object_name: string | null; detail: { from?: string | null; to?: string | null; level?: string } | null }
interface Profile {
  setup: 'ready' | 'tables'; manager: { id: string; name: string; email: string | null; avatarUrl: string | null; metaActorId: string | null; metaActorName: string | null }; hasEmail: boolean; hasActor: boolean
  totals: { actions: number; optimizations: number; byMe: number; activeSec: number | null; idle: number }
  byKind: Array<{ kind: ActivityKind; n: number }>; daily: Array<{ day: string; n: number }>; hours: number[]; bySource: { app: number; meta: number }
  clients: Array<{ slug: string; name: string; logoUrl?: string | null; actions: number; optimizations: number; lastAt: string | null; timeSec: number; daysIdle: number }>
  idle: Array<{ slug: string; name: string; logoUrl?: string | null; lastAt: string | null; daysIdle: number | null }>
  otherTime: Array<{ slug: string; name: string; sec: number }>
  timeline: TimelineRow[]
}
interface Actor { id: string; name: string; n: number; manager: string | null }

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }
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

/** Página Performance (gestores de tráfego): gestores de tráfego, a carteira de clientes de cada um e tudo o que é feito nas contas deles. */
export function TeamManagers() {
  const { theme, toggle } = useTheme()
  const router = useRouter()
  const sp = useSearchParams()
  const sel = sp.get('g')
  const [period, setPeriod] = useState<RangePeriod>('7')
  const [list, setList] = useState<ListData | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<null | 'new' | { id: string }>(null)
  const [prefill, setPrefill] = useState('')
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
      apiFetch('/api/admin/managers/sync?auto=1', { method: 'POST' }).then(() => { void load(); setTick(t => t + 1) }).catch(() => { })
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
  const open = (id: string | null, tab?: string) => router.push(id ? `/admin/equipe?g=${id}${tab ? `&tab=${tab}` : ''}` : '/admin/equipe')

  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {current && <button type="button" className="btn btn-outline btn-sm" onClick={() => open(null)} aria-label="Voltar para a lista de gestores"><ArrowLeft size={16} strokeWidth={1.75} /> Voltar</button>}
          <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 16 }}>
            {current && <Thumb name={current.name} src={current.avatarUrl} size={64} />}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{current ? current.name : 'Performance'}</h1>
              <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>{current ? `Gestor de tráfego · ${plural(current.clients.length, 'cliente', 'clientes')}${current.email ? ` · ${current.email}` : ''}` : 'Gestores de tráfego e o que cada um faz nas contas'}</p>
            </div>
          </div>
          <PeriodPicker value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={syncNow} disabled={syncing} aria-label="Atualizar histórico da Meta" title="Atualizar o histórico de alterações da Meta agora">{syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} strokeWidth={1.75} />}</button>
          {current
            ? <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing({ id: current.id })}><Pencil size={14} strokeWidth={1.75} /> Editar</button>
            : <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPrefill(''); setEditing('new') }}><Plus size={14} strokeWidth={1.75} /> Novo gestor</button>}
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
          <ProfileMenu />
        </header>

        {notice && <div role="status" className="card" style={{ padding: 12, marginBottom: 16, fontSize: 14 }}>{notice}</div>}
        {failed && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar agora. A equipe de gestores é só para administradores.</div>}
        {!list && !failed && <PulseLoader size={44} />}
        {list?.setup === 'tables' && sqlHint}

        {list?.setup === 'ready' && !current && !sel && <Overview list={list} onOpen={open} onEdit={id => setEditing({ id })} onNew={() => { setPrefill(''); setEditing('new') }} onAssigned={load} />}
        {list?.setup === 'ready' && sel && !current && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Gestor não encontrado.</div>}
        {list?.setup === 'ready' && current && <ProfileView key={current.id} id={current.id} period={period} tick={tick} pending={current.pending} initialTab={sp.get('tab')} onEdit={() => setEditing({ id: current.id })} />}
      </main>

      {editing && list?.setup === 'ready' && (
        <ManagerForm manager={editing === 'new' ? null : list.managers.find(m => m.id === editing.id) ?? null} clients={list.clients} managers={list.managers} prefillEmail={prefill}
          onClose={() => setEditing(null)}
          onSaved={async id => { setEditing(null); await load(); if (editing === 'new') open(id) }}
          onDeleted={async () => { setEditing(null); await load(); open(null) }} />
      )}
    </StaffShell>
  )
}

function Overview({ list, onOpen, onEdit, onNew, onAssigned }: { list: ListData; onOpen: (id: string, tab?: string) => void; onEdit: (id: string) => void; onNew: () => void; onAssigned: () => void }) {
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
      <div className="tile-grid stagger" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <MetricTile label="Gestores" value={String(list.managers.length)} />
        <MetricTile label="Clientes com gestor" value={String(withManager)} />
        <MetricTile label="Clientes sem gestor" value={String(list.unassigned.length)} />
        <MetricTile label="Ações nas contas" value={String(list.totals.actions)} />
        <MetricTile label="Otimizações sem motivo" value={String(list.totals.pending)} />
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Gestores</h2>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>Os números seguem o período escolhido no topo. A última otimização olha os últimos 30 dias</p>
            </div>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {list.managers.map((m, i) => {
              const sc = m.score
              const active = (sc.made ?? 0) > 0
              return (
                <article key={m.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                      <Thumb name={m.name} src={m.avatarUrl} size={40} />
                      <i aria-hidden="true" style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: paletteAt(i), border: '2px solid var(--bg-card)' }} />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 title={m.name} style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</h3>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plural(m.clients.length, 'cliente', 'clientes')}{!m.email && <span title="Sem e-mail de login: esse gestor não entra no painel e não recebe otimizações" style={{ color: 'var(--amber)', fontWeight: 600 }}> · sem login</span>}</div>
                    </div>
                    <span className="badge" title={active ? 'Fez otimizações no período' : 'Nenhuma otimização dele no período'} style={{ background: active ? 'var(--green-soft)' : 'rgba(245, 158, 11, 0.15)', color: 'var(--text-1)', flexShrink: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--amber)' }} />{active ? 'Ativo' : 'Sem otimizações'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px 12px' }}>
                    {([
                      ['Otimizações', sc.made == null ? '—' : String(sc.made), sc.made == null ? 'Sem e-mail nem usuário da Meta ligado: não dá para saber o que ele fez' : 'Otimizações que ele mesmo fez no período (pausar, ativar, criar, orçamento, público, lance, criativo)'],
                      ['Otimizadas', `${sc.worked}/${sc.total}`, 'Contas ativas da carteira que tiveram alguma otimização no período'],
                      ['Média por dia', sc.perDay == null ? '—' : String(sc.perDay).replace('.', ','), 'Média de otimizações dele por dia no período'],
                    ] as const).map(([l, v, tip]) => (
                      <div key={l} title={tip} style={{ minWidth: 0 }}>
                        <div style={{ ...eyebrow, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 0 }}>
                      {sc.made == null ? 'Sem usuário da Meta ligado' : sc.lastOwnAt ? `Última otimização ${ago(sc.lastOwnAt)}` : 'Nenhuma otimização dele nos últimos 30 dias'}
                    </span>
                    <Sparkline data={m.daily} width={112} height={32} color={paletteAt(i)} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onOpen(m.id, m.pending > 0 ? 'otimizacoes' : undefined)}>
                      <ArrowRight size={16} strokeWidth={1.75} /> {m.pending > 0 ? 'Ver otimizações' : 'Ver perfil'}
                    </button>
                    <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => onEdit(m.id)} aria-label={`Editar ${m.name}`} title="Editar gestor"><Pencil size={16} strokeWidth={1.75} /></button>
                  </div>
                </article>
              )
            })}
          </div>
          </div>
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

        </>
      )}

      <div className="usage-grid">
        {list.managers.length > 0 && (
          <ListCard icon={<Clock size={18} strokeWidth={1.75} />} tone="green" title="Acontecendo agora" hint="As últimas otimizações nas contas dos gestores">
            <PagedRows size={5} empty={none('Nenhuma ação registrada ainda.')} rows={list.recent.map((r, i) => (
              <RankRow key={`${r.at}-${i}`} wrap lead={<Thumb name={r.clientName} src={r.clientLogo} />} title={r.title}
                sub={<>{r.clientName}{r.object ? ` · ${r.object}` : ''}{r.change ? <><br />{r.change}</> : null}<br /><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Thumb name={r.managerName} src={r.managerAvatar} size={16} />{r.managerName}</span> · {dayLabel(r.at)} às {hm(r.at)}{r.actorName && r.actorName !== r.managerName ? ` · por ${r.actorName}` : ''}</>}
                value={<span className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-2)', fontSize: 11 }}>{r.source === 'meta' ? 'Meta' : 'Painel'}</span>} valueTone="plain" onClick={() => onOpen(r.managerId)} />
            ))} />
          </ListCard>
        )}
        {list.unassigned.length > 0 && list.managers.length > 0 && (
          <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Clientes sem gestor" hint="Nada feito nessas contas entra no perfil de ninguém. Escolha o gestor de cada uma">
            <PagedRows size={5} empty={none('Todos os clientes têm gestor.')} rows={list.unassigned.map(c => (
              <RankRow key={c.slug} lead={<Thumb name={c.name} src={c.logoUrl} />} title={c.name} valueTone="plain"
                value={<select className="field" aria-label={`Gestor de ${c.name}`} disabled={busy === c.slug} value="" onChange={e => assign(c.slug, e.target.value)} style={{ height: 32, width: 'auto', fontSize: 12 }}>
                  <option value="">Escolher gestor…</option>
                  {list.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>} />
            ))} />
          </ListCard>
        )}
        {list.managers.length > 0 && list.justifications && <JustificationsCard data={list.justifications} onOpen={id => onOpen(id, 'otimizacoes')} />}
        {list.managers.length > 0 && <AccessCard onOpenManager={id => onOpen(id)} />}
        {list.managers.length > 0 && <StalledAccounts onOpenManager={id => onOpen(id)} />}
      </div>
    </div>
  )
}

function ProfileView({ id, period, tick, pending, initialTab, onEdit }: { id: string; period: RangePeriod; tick: number; pending: number; initialTab: string | null; onEdit: () => void }) {
  const [tab, setTab] = useState<'geral' | 'timeline' | 'clientes' | 'otimizacoes'>(initialTab === 'otimizacoes' ? 'otimizacoes' : 'geral')
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
    const by = r.actor_name && r.actor_name !== data.manager.name ? ` · por ${r.actor_name}` : ''
    return (
      <RankRow key={`${r.at}-${i}`} wrap lead={<Thumb name={r.clientName} src={r.clientLogo} />} title={r.view.title}
        sub={<>{r.clientName}{r.view.object ? ` · ${r.view.object}` : ''}{r.view.change ? <><br />{r.view.change}</> : null}<br />{dayLabel(r.at)} às {hm(r.at)}{by}</>}
        value={<span className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-2)', fontSize: 11 }}>{r.source === 'meta' ? 'Meta' : 'Painel'}</span>} valueTone="plain" />
    )
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {(!data.hasActor || !data.hasEmail) && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {!data.hasActor && 'Não achei o usuário da Meta deste gestor pelo nome. As ações nas contas dele já contam normalmente; ligar o usuário em Editar só acrescenta o que ele faz em contas de outros gestores. '}
          {!data.hasEmail && 'Com o e-mail de login dele, o painel também mostra o tempo em cada cliente. '}
          <button type="button" onClick={onEdit} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--text-1)', textDecoration: 'underline', cursor: 'pointer' }}>Editar gestor</button>
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SubTabs value={tab} onChange={setTab} tabs={[{ key: 'geral', label: 'Visão geral' }, { key: 'otimizacoes', label: pending > 0 ? `Otimizações (${pending})` : 'Otimizações' }, { key: 'timeline', label: 'Linha do tempo' }, { key: 'clientes', label: 'Clientes' }]} />
        {client && <button type="button" className="badge" onClick={() => setClient('')} title="Tirar este filtro" style={{ cursor: 'pointer', background: 'var(--accent-soft)', color: 'var(--text-1)', fontSize: 12, gap: 6, marginLeft: 'auto' }}>Cliente: {data.clients.find(c => c.slug === client)?.name ?? client} <X size={12} /></button>}
      </div>

      {tab === 'geral' && (
        <>
          <div className="tile-grid stagger" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <MetricTile label="Ações nas contas" value={String(data.totals.actions)} />
            <MetricTile label="Otimizações nas contas" value={String(data.totals.optimizations)} />
            <MetricTile label="Feito por ele (todas as ações)" value={String(data.totals.byMe)} />
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
                <RankRow key={c.slug} lead={<Thumb name={c.name} src={c.logoUrl} />} title={c.name} sub={c.daysIdle == null ? 'Nenhuma ação registrada' : `Última ação ${ago(c.lastAt!)}`} value={c.daysIdle == null ? '—' : `${c.daysIdle} d`} valueTone="plain" onClick={() => goClient(c.slug)} chevron />
              ))} />
            </ListCard>
            <AccessCard manager={id} />
            <ListCard icon={<Activity size={18} strokeWidth={1.75} />} title="Últimas ações" hint="As mais recentes nas contas dele">
              <PagedRows size={4} empty={none('Nenhuma ação neste período.')} rows={timelineRows.slice(0, 12)} />
            </ListCard>
          </div>
        </>
      )}

      {tab === 'otimizacoes' && <TaskPanel managerId={id} />}

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
              <RankRow key={c.slug} lead={<Thumb name={c.name} src={c.logoUrl} />} title={c.name}
                sub={<>{plural(c.actions, 'ação', 'ações')} · {plural(c.optimizations, 'otimização', 'otimizações')}<br />{c.lastAt ? `última ${ago(c.lastAt)}` : 'sem ações no período'}</>}
                value={data.hasEmail ? fmtDuration(c.timeSec) : undefined} onClick={() => goClient(c.slug)} chevron />
            ))} />
          </ListCard>
        </div>
      )}
    </div>
  )
}

function ManagerForm({ manager, clients, managers, prefillEmail, onClose, onSaved, onDeleted }: {
  manager: ListManager | null; clients: ClientOpt[]; managers: ListManager[]; prefillEmail?: string
  onClose: () => void; onSaved: (id: string) => void | Promise<void>; onDeleted: () => void | Promise<void>
}) {
  const [name, setName] = useState(manager?.name ?? '')
  // '' = ainda não escolheu (novo gestor), 'none' = sem acesso ao painel de propósito, senão o e-mail do acesso.
  const [email, setEmail] = useState(manager ? manager.email ?? 'none' : prefillEmail ?? '')
  const [actorId, setActorId] = useState(manager?.metaActorId ?? '')
  const [actorName, setActorName] = useState(manager?.metaActorName ?? '')
  const [picked, setPicked] = useState<Set<string>>(new Set(manager?.clients.map(c => c.slug) ?? []))
  const [search, setSearch] = useState('')
  const [actors, setActors] = useState<Actor[]>([])
  const [team, setTeam] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(manager?.avatarUrl ?? null)
  const [avatarChanged, setAvatarChanged] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pickPhoto(f: File | undefined) {
    if (!f) return
    setErr(null)
    try { setAvatar(await fileToLogoDataUrl(f)); setAvatarChanged(true) } catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui usar essa foto.') }
  }

  useEffect(() => {
    apiFetch('/api/admin/managers/actors', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: { actors?: Actor[] } | null) => setActors(j?.actors ?? [])).catch(() => { })
    apiFetch('/api/admin/team', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: { members?: Array<{ email: string }>; owner?: string | null } | null) => setTeam([...(j?.owner ? [j.owner] : []), ...(j?.members ?? []).map(m => m.email)])).catch(() => { })
  }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const ownerOf = useMemo(() => { const m = new Map<string, string>(); for (const g of managers) if (g.id !== manager?.id) for (const c of g.clients) m.set(c.slug, g.name); return m }, [managers, manager])
  const shown = clients.filter(c => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
  const toggle = (slug: string) => setPicked(p => { const n = new Set(p); if (n.has(slug)) n.delete(slug); else n.add(slug); return n })

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy(true); setErr(null)
    const r = await apiFetch(manager ? `/api/admin/managers/${manager.id}` : '/api/admin/managers', { method: manager ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email: email === 'none' ? '' : email, metaActorId: actorId, metaActorName: actorName, clients: [...picked], ...(avatarChanged ? { avatar } : {}) }) }).catch(() => null)
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Thumb name={name || '?'} src={avatar} size={72} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>{avatar ? 'Trocar foto' : 'Escolher foto'}</button>
              {avatar && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAvatar(null); setAvatarChanged(true) }}>Remover foto</button>}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>PNG, JPG ou WebP. Aparece no perfil e nos cards do gestor.</span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        </div>

        <label style={label}>Nome<input id="mg-name" className="field" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do gestor" maxLength={60} autoFocus={!manager} /></label>
        <label style={label}>Acesso ao painel
          <select id="mg-email" className="field" value={email} onChange={e => setEmail(e.target.value)} required>
            <option value="" disabled>Selecione o acesso deste gestor…</option>
            {team.map(t => {
              const takenBy = managers.find(g => g.email === t && g.id !== manager?.id)
              return <option key={t} value={t} disabled={!!takenBy}>{t}{takenBy ? ` (já é de ${takenBy.name})` : ''}</option>
            })}
            {manager?.email && !team.includes(manager.email) && <option value={manager.email}>{manager.email}</option>}
            <option value="none">Sem acesso ao painel</option>
          </select>
          <span style={{ fontWeight: 400 }}>É o login (em Equipe) que esta pessoa usa. Com ele, o gestor vê só a própria carteira, recebe as otimizações para informar o motivo e tem o tempo por cliente medido. Sem acesso, ele só aparece como responsável.</span>
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
          <button className="btn btn-primary" disabled={busy || name.trim().length < 2 || !email}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
        {manager && confirm && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>O histórico já registrado é mantido, mas os clientes ficam sem gestor.</p>}
      </form>
    </div>
  )
}
