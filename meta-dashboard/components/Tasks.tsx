'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronRight, LayoutGrid, List, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { REASONS, REASON_LABEL, type Task } from '@/lib/managers'
import { DonutChart } from './Donut'
import { ModalShell } from './ModalShell'
import { PulseLoader } from './PulseLoader'
import { SubTabs, Thumb, plural } from './UsageUi'

export type TaskView = Task & { clientName: string; clientLogo: string | null }
interface ClientSummary { slug: string; name: string; logo: string | null; pending: number; answered: number; lastAt: string; headline: string; accountManager?: string | null }
interface TasksData {
  setup: 'ready' | 'tables' | 'columns' | 'error'
  manager: { id: string; name: string } | null
  pending: TaskView[]; answered: TaskView[]; clients: ClientSummary[]
  counts: { pending: number; answered: number; rate: number | null }
}

const pad = (n: number) => String(n).padStart(2, '0')
const when = (iso: string) => {
  const d = new Date(iso), t = new Date()
  const day = d.toDateString() === t.toDateString() ? 'hoje' : new Date(t.getTime() - 86_400_000).toDateString() === d.toDateString() ? 'ontem' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
  return `${day} às ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const sqlHint = <div className="card" style={{ padding: 24, fontSize: 14 }}>Falta liberar as otimizações no banco. Rode o SQL <code>supabase/2026-09-gestores-3.sql</code> no Supabase e recarregue a página.</div>

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }

/** Popup pra justificar uma otimização: motivo (pode marcar mais de um) e um comentário. No molde do "comprovante de tarefa" da Pautta. */
function JustifyModal({ t, onClose, onSaved }: { t: TaskView; onClose: () => void; onSaved: () => void }) {
  const [kinds, setKinds] = useState<string[]>(t.reasonKinds)
  const [text, setText] = useState(t.reason ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const has = (k: string) => kinds.includes(k)
  const flip = (k: string) => setKinds(v => (has(k) ? v.filter(x => x !== k) : [...v, k]))

  async function save() {
    setBusy(true); setErr(null)
    const r = await apiFetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: t.ids, reasonKinds: kinds, reason: text }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) as { error?: string } : {}
    setBusy(false)
    if (!r?.ok) return setErr(j.error ?? 'Não foi possível salvar.')
    onSaved(); onClose()
  }

  return (
    <ModalShell title="Justificar otimização" onClose={onClose} maxWidth={520}>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
        Conte por que fez <strong style={{ color: 'var(--text-1)' }}>&ldquo;{t.short || t.headline}&rdquo;</strong>, em {t.clientName} ({when(t.at)}).
      </p>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>Motivo</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {REASONS.map(([k, l]) => (
            <button key={k} type="button" className="pill-btn" aria-pressed={has(k)} onClick={() => flip(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {has(k) && <Check size={12} strokeWidth={3} />} {l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="task-comment" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>Comentário {kinds.length ? '(opcional)' : ''}</label>
        <textarea id="task-comment" className="field" rows={3} placeholder="Alguma observação sobre essa otimização?" value={text} onChange={e => setText(e.target.value)} maxLength={500} style={{ height: 'auto', paddingTop: 10, paddingBottom: 10, resize: 'vertical' }} />
      </div>
      {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || (!kinds.length && text.trim().length < 3)}>
          {busy && <Loader2 size={14} className="spin" />} Confirmar
        </button>
      </div>
    </ModalShell>
  )
}

/** Uma otimização (sessão de alterações): o que foi feito numa frase, numa linha só; clica pra abrir o popup e justificar. */
function TaskItem({ t, onSaved, boxed }: { t: TaskView; onSaved: () => void; boxed?: boolean }) {
  const answered = !!(t.reason || t.reasonKinds.length)
  const [open, setOpen] = useState(false)
  const [justifying, setJustifying] = useState(false)

  const box: React.CSSProperties = boxed
    ? { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
    : { padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }
  const inner = (
    <>
      <button type="button" onClick={() => setJustifying(true)} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', background: 'none', border: 0, padding: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
        <div style={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{when(t.at)}{t.actorName ? ` · ${t.actorName}` : ''}</span>
          <span style={{ display: 'block', whiteSpace: 'pre-line', fontWeight: 600 }}>{t.short || t.headline}</span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span className="badge" style={{ background: answered ? 'var(--green-soft)' : 'rgba(245, 158, 11, 0.15)', color: 'var(--text-1)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: answered ? 'var(--green)' : 'var(--amber)' }} />{answered ? 'Com motivo' : 'Sem motivo'}</span>
          <ChevronRight size={16} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
        </span>
      </button>
      {t.items.length > 0 && (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, color: 'var(--text-2)', textDecoration: 'underline', cursor: 'pointer' }}>{open ? 'ocultar detalhes' : 'ver detalhes'}</button>
      )}
      {open && (
        <ul style={{ margin: 0, padding: '10px 12px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-card2)', borderRadius: 10 }}>
          {t.items.map((it, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}><span style={{ color: 'var(--text-1)' }}>{it.objectName ?? it.text}</span>{it.change ? ` · ${it.change}` : ''}{it.objectName ? ` · ${it.text}` : ''}</li>)}
        </ul>
      )}
      {answered && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          {t.reasonKinds.map(k => <span key={k} className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-1)' }}>{REASON_LABEL[k] ?? k}</span>)}
          {t.reason && <span style={{ overflowWrap: 'anywhere', flex: '1 1 160px', color: 'var(--text-2)' }}>&ldquo;{t.reason}&rdquo;</span>}
        </div>
      )}
    </>
  )
  return (
    <>
      {boxed ? <article className="card" style={box}>{inner}</article> : <div style={box}>{inner}</div>}
      {justifying && <JustifyModal t={t} onClose={() => setJustifying(false)} onSaved={onSaved} />}
    </>
  )
}

/** Card do cliente, no mesmo molde dos cards de clientes e de gestores. */
function ClientCard({ c, onOpen }: { c: ClientSummary; onOpen: () => void }) {
  const done = c.pending === 0
  return (
    <article className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Thumb name={c.name} src={c.logo} size={40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 title={c.name} style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h3>
          {c.accountManager && <div title={`Essa conta é da carteira de ${c.accountManager}. As alterações foram feitas por quem está nesta lista, então o motivo fica com ele informar.`} style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Conta de {c.accountManager}</div>}
        </div>
        <span className="badge" style={{ background: done ? 'var(--green-soft)' : 'rgba(245, 158, 11, 0.15)', color: 'var(--text-1)', flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: done ? 'var(--green)' : 'var(--amber)' }} />{done ? 'Em dia' : 'Pendente'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px 12px' }}>
        {([['Sem motivo', String(c.pending), done ? undefined : 'var(--amber)'], ['Com motivo', String(c.answered), undefined], ['Última', when(c.lastAt).replace(' às ', ' ').replace('hoje', 'hoje'), undefined]] as const).map(([l, v, col]) => (
          <div key={l} style={{ minWidth: 0 }}>
            <div style={{ ...eyebrow, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
            <div style={{ fontSize: l === 'Última' ? 15 : 20, fontWeight: 700, lineHeight: 1.6, color: col, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', height: 54, lineHeight: '18px', whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.headline}</div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onOpen}><ArrowRight size={16} strokeWidth={1.75} /> {done ? 'Ver otimizações' : 'Informar motivo'}</button>
    </article>
  )
}

type Filter = 'todos' | 'pendentes' | 'em-dia'

/** Otimizações de um gestor: cards por cliente; ao abrir um cliente, a lista das otimizações dele (em lista ou em cards). */
export function TaskPanel({ managerId, onCount }: { managerId: string | null; onCount?: (pending: number) => void }) {
  const [data, setData] = useState<TasksData | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'cards'>('list')
  const [filter, setFilter] = useState<Filter>('todos')

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/tasks${managerId ? `?manager=${encodeURIComponent(managerId)}` : ''}`, { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setFailed(true); return }
      const j = await r.json() as TasksData
      setData(j); setFailed(false); onCount?.(j.counts?.pending ?? 0)
    } catch { setFailed(true) }
  }, [managerId, onCount])
  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => (data?.clients ?? []).filter(c => filter === 'todos' || (filter === 'pendentes' ? c.pending > 0 : c.pending === 0)), [data, filter])
  const client = data?.clients.find(c => c.slug === selected) ?? null
  const clientTasks = useMemo(() => [...(data?.pending ?? []), ...(data?.answered ?? [])].filter(t => t.clientSlug === selected).sort((a, b) => Number(!!(a.reason || a.reasonKinds.length)) - Number(!!(b.reason || b.reasonKinds.length)) || b.at.localeCompare(a.at)), [data, selected])

  if (failed) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar as otimizações agora.</div>
  if (!data) return <PulseLoader size={44} />
  if (data.setup === 'columns' || data.setup === 'tables') return sqlHint

  // Tela do cliente: as otimizações dele.
  if (selected && client) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelected(null)}><ArrowLeft size={16} strokeWidth={1.75} /> Voltar</button>
          <Thumb name={client.name} src={client.logo} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{plural(client.pending, 'otimização sem motivo', 'otimizações sem motivo')} · {plural(client.answered, 'com motivo', 'com motivo')}</div>
          </div>
          <div role="group" aria-label="Modo de exibição" style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="pill-btn" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} strokeWidth={1.75} style={{ marginRight: 4, verticalAlign: -2 }} />Lista</button>
            <button type="button" className="pill-btn" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><LayoutGrid size={14} strokeWidth={1.75} style={{ marginRight: 4, verticalAlign: -2 }} />Cards</button>
          </div>
        </div>
        {clientTasks.length === 0
          ? <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>Nenhuma otimização neste cliente.</div>
          : view === 'list'
            ? <div className="card" style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>{clientTasks.map((t, i) => <div key={t.key} style={{ borderTop: i ? '1px solid var(--border-soft)' : 'none' }}><TaskItem t={t} onSaved={load} /></div>)}</div>
            : <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', alignItems: 'start' }}>{clientTasks.map(t => <TaskItem key={t.key} t={t} onSaved={load} boxed />)}</div>}
      </div>
    )
  }

  const total = data.counts.pending + data.counts.answered
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <DonutChart legend={false} size={84} thickness={18} slices={[{ key: 'ok', label: 'Com motivo', value: data.counts.answered, color: 'var(--green)' }, { key: 'pend', label: 'Pendentes', value: data.counts.pending, color: 'var(--amber)' }]} center={data.counts.rate == null ? '—' : `${data.counts.rate}%`} />
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {([['Sem motivo', data.counts.pending, 'var(--amber)'], ['Com motivo', data.counts.answered, 'var(--green)']] as const).map(([l, v, col]) => (
            <div key={l}>
              <div style={eyebrow}>{l}</div>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: col }}>{v}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', flex: '1 1 260px' }}>Informe o motivo de cada otimização. Últimos 30 dias.</p>
      </section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SubTabs value={filter} onChange={setFilter} tabs={[{ key: 'todos', label: 'Todos' }, { key: 'pendentes', label: 'Sem motivo' }, { key: 'em-dia', label: 'Em dia' }]} />
      </div>

      {shown.length === 0
        ? <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{total === 0 ? 'Nenhuma alteração registrada ainda. Elas aparecem aqui quando alguém mexer nas contas.' : 'Nenhum cliente neste filtro.'}</div>
        : <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>{shown.map(c => <ClientCard key={c.slug} c={c} onOpen={() => setSelected(c.slug)} />)}</div>}
    </div>
  )
}
