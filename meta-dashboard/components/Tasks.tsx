'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, LayoutGrid, List, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { useAnchoredPopover } from '@/lib/useAnchoredPopover'
import { REASONS, REASON_LABEL, type Task } from '@/lib/managers'
import { DonutChart } from './Donut'
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

/** Botão redondo "Motivo" que abre uma lista com caixinhas: dá para marcar mais de um. */
function ReasonSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { pos, close, toggle, menuRef } = useAnchoredPopover(6)
  const has = (k: string) => value.includes(k)
  const flip = (k: string) => onChange(has(k) ? value.filter(x => x !== k) : [...value, k])
  const first = value[0] ? REASON_LABEL[value[0]] : null
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" aria-haspopup="listbox" aria-expanded={!!pos} onClick={toggle}
        style={{ borderRadius: 9999, gap: 6, flexShrink: 0, borderColor: value.length ? 'var(--accent)' : undefined, maxWidth: 220 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first ? `${first}${value.length > 1 ? ` +${value.length - 1}` : ''}` : 'Motivo'}</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={close} />
          <div ref={menuRef} className="popover" role="listbox" aria-multiselectable="true" aria-label="Motivo" style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 230 }}>
            {REASONS.map(([k, l]) => (
              <div key={k} role="option" aria-selected={has(k)} tabIndex={0} className="popover-item" onClick={() => flip(k)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(k) } }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${has(k) ? 'var(--accent)' : 'var(--border-input)'}`, background: has(k) ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {has(k) && <Check size={11} strokeWidth={3} color="#fff" />}
                </span>
                <span style={{ flex: 1 }}>{l}</span>
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }

/** Uma otimização (sessão de alterações): o que foi feito numa frase; pendente mostra o formulário, com motivo mostra o motivo e o botão Editar. */
function TaskItem({ t, onSaved, boxed }: { t: TaskView; onSaved: () => void; boxed?: boolean }) {
  const answered = !!(t.reason || t.reasonKinds.length)
  const [edit, setEdit] = useState(false)
  const [kinds, setKinds] = useState<string[]>(t.reasonKinds)
  const [text, setText] = useState(t.reason ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const showForm = !answered || edit

  async function save() {
    setBusy(true); setErr(null)
    const r = await apiFetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: t.ids, reasonKinds: kinds, reason: text }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) as { error?: string } : {}
    setBusy(false)
    if (!r?.ok) return setErr(j.error ?? 'Não foi possível salvar.')
    setEdit(false); onSaved()
  }

  const box: React.CSSProperties = boxed
    ? { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
    : { padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }
  const inner = (
    <>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{when(t.at)}{t.actorName ? ` · ${t.actorName}` : ''}</span>
          {t.headline}
          {t.items.length > 0 && <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ marginLeft: 8, background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, color: 'var(--text-2)', textDecoration: 'underline', cursor: 'pointer' }}>{open ? 'ocultar detalhes' : 'ver detalhes'}</button>}
        </div>
        <span className="badge" style={{ background: answered ? 'var(--green-soft)' : 'rgba(245, 158, 11, 0.15)', color: 'var(--text-1)', flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: answered ? 'var(--green)' : 'var(--amber)' }} />{answered ? 'Com motivo' : 'Sem motivo'}</span>
      </div>
      {open && (
        <ul style={{ margin: 0, padding: '10px 12px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-card2)', borderRadius: 10 }}>
          {t.items.map((it, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}><span style={{ color: 'var(--text-1)' }}>{it.objectName ?? it.text}</span>{it.change ? ` · ${it.change}` : ''}{it.objectName ? ` · ${it.text}` : ''}</li>)}
        </ul>
      )}
      {showForm ? (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ReasonSelect value={kinds} onChange={setKinds} />
            <input className="field" aria-label="Explique em uma frase" placeholder="Explique em uma frase (opcional)" value={text} onChange={e => setText(e.target.value)} maxLength={500} style={{ height: 34, fontSize: 13, flex: '1 1 180px', minWidth: 0, borderRadius: 9999, padding: '0 14px' }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || (!kinds.length && text.trim().length < 3)} style={{ borderRadius: 9999, flexShrink: 0 }}>
              {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} strokeWidth={1.75} />} {answered ? 'Atualizar' : 'Salvar'}
            </button>
            {edit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEdit(false); setKinds(t.reasonKinds); setText(t.reason ?? '') }}>Cancelar</button>}
          </div>
          {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{err}</p>}
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          {t.reasonKinds.map(k => <span key={k} className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-1)' }}>{REASON_LABEL[k] ?? k}</span>)}
          {t.reason && <span style={{ overflowWrap: 'anywhere', flex: '1 1 160px' }}>{t.reason}</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(true)} style={{ marginLeft: 'auto' }}>Editar</button>
        </div>
      )}
    </>
  )
  return boxed ? <article className="card" style={box}>{inner}</article> : <div style={box}>{inner}</div>
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
      <div style={{ fontSize: 12, color: 'var(--text-2)', height: 36, lineHeight: '18px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.headline}</div>
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
