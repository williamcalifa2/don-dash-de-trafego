'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CircleCheck, Clock, ListChecks, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { REASONS, REASON_LABEL, type Task } from '@/lib/managers'
import { DonutChart } from './Donut'
import { ModalShell } from './ModalShell'
import { PulseLoader } from './PulseLoader'
import { SubTabs, Thumb } from './UsageUi'

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
function TaskItem({ t, onSaved, boxed, showClient }: { t: TaskView; onSaved: () => void; boxed?: boolean; showClient?: boolean }) {
  const answered = !!(t.reason || t.reasonKinds.length)
  const [open, setOpen] = useState(false)
  const [justifying, setJustifying] = useState(false)

  const box: React.CSSProperties = boxed
    ? { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
    : { padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }
  const inner = (
    <>
      <button type="button" onClick={() => setJustifying(true)} aria-label={answered ? `Editar justificativa: ${t.short || t.headline}` : `Justificar: ${t.short || t.headline}`} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', background: 'none', border: 0, padding: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', border: `2px solid ${answered ? 'var(--green)' : 'var(--border-input)'}`, background: answered ? 'var(--green)' : 'transparent' }}>
          {answered && <Check size={13} strokeWidth={3} color="var(--primary-fg)" />}
        </span>
        {showClient && <Thumb name={t.clientName} src={t.clientLogo} size={36} />}
        <div style={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere', minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', whiteSpace: 'pre-line', fontWeight: 600 }}>{t.short || t.headline}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{showClient ? `${t.clientName} · ` : ''}{when(t.at)}{t.actorName ? ` · ${t.actorName}` : ''}</span>
        </div>
        {!answered && <span className="badge" style={{ background: 'var(--amber)', color: '#000', flexShrink: 0, fontWeight: 700 }}>Justificar</span>}
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

/** Peça de estatística no topo, no molde dos tiles "Total de Tarefas / Concluídas / Pendentes" da Pautta. */
function StatTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: color ?? 'var(--text-2)' }}>
        {icon}
        <span style={eyebrow}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.5, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

type Filter = 'pendentes' | 'respondidas' | 'todos'

/** Início do gestor, no molde da Pautta: cabeçalho com quem é, números do período e a lista (não mais cards por cliente) — clica numa linha pra justificar. */
export function TaskPanel({ managerId, onCount }: { managerId: string | null; onCount?: (pending: number) => void }) {
  const [data, setData] = useState<TasksData | null>(null)
  const [me, setMe] = useState<{ name: string; avatar: string | null; role: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('pendentes')

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/tasks${managerId ? `?manager=${encodeURIComponent(managerId)}` : ''}`, { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setFailed(true); return }
      const j = await r.json() as TasksData
      setData(j); setFailed(false); onCount?.(j.counts?.pending ?? 0)
    } catch { setFailed(true) }
  }, [managerId, onCount])
  useEffect(() => { void load() }, [load])
  useEffect(() => { apiFetch('/api/admin/profile', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: { name?: string; avatar?: string | null; role?: string } | null) => { if (j) setMe({ name: j.name ?? '', avatar: j.avatar ?? null, role: j.role ?? '' }) }).catch(() => {}) }, [])

  // Mais antigas primeiro entre as sem motivo (são as "atrasadas"); mais recentes primeiro entre as com motivo.
  const all = useMemo(() => {
    const pend = [...(data?.pending ?? [])].sort((a, b) => a.at.localeCompare(b.at))
    const ans = [...(data?.answered ?? [])].sort((a, b) => b.at.localeCompare(a.at))
    return { pend, ans, todos: [...pend, ...ans] }
  }, [data])
  const shown = filter === 'pendentes' ? all.pend : filter === 'respondidas' ? all.ans : all.todos

  if (failed) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar as otimizações agora.</div>
  if (!data) return <PulseLoader size={44} />
  if (data.setup === 'columns' || data.setup === 'tables') return sqlHint

  const total = data.counts.pending + data.counts.answered
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Cabeçalho no mesmo visual fixo (sempre escuro) da tela Início da Pautta, pra ficar idêntico independente do tema do resto do app. */}
      <section style={{ borderRadius: 20, padding: '28px 32px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', background: '#0c0e1c' }}>
        <Thumb name={me?.name || data.manager?.name || '?'} src={me?.avatar ?? null} size={72} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me?.name || data.manager?.name || 'Gestor'}</h2>
          <div style={{ fontSize: 15, color: '#9aa0c3', marginTop: 4 }}>Gestor de Tráfego</div>
        </div>
        <div style={{ color: '#fff', ['--bg-card2' as string]: '#1b1e33' } as React.CSSProperties}>
          <DonutChart legend={false} size={112} thickness={12} slices={[{ key: 'ok', label: 'Justificadas', value: data.counts.answered, color: '#7c86ff' }, { key: 'rest', label: 'Pra justificar', value: data.counts.pending, color: '#1b1e33' }]} center={data.counts.rate == null ? '—' : `${data.counts.rate}%`} />
        </div>
      </section>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <StatTile icon={<ListChecks size={15} strokeWidth={1.75} />} label="Total" value={total} />
        <StatTile icon={<CircleCheck size={15} strokeWidth={1.75} />} label="Justificadas" value={data.counts.answered} color="var(--green)" />
        <StatTile icon={<Clock size={15} strokeWidth={1.75} />} label="Pra justificar" value={data.counts.pending} color={data.counts.pending ? 'var(--amber)' : undefined} />
      </div>

      <div className="card" style={{ padding: 6, display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-card2)' }}>
        <SubTabs value={filter} onChange={setFilter} tabs={[{ key: 'pendentes', label: `Pra justificar (${all.pend.length})` }, { key: 'respondidas', label: `Justificadas (${all.ans.length})` }, { key: 'todos', label: `Todos (${all.todos.length})` }]} />
      </div>

      {shown.length === 0
        ? <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{total === 0 ? 'Nenhuma alteração registrada ainda. Elas aparecem aqui quando alguém mexer nas contas.' : 'Nada por aqui neste filtro.'}</div>
        : <div className="card" style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>{shown.map((t, i) => <div key={t.key} style={{ borderTop: i ? '1px solid var(--border-soft)' : 'none' }}><TaskItem t={t} onSaved={load} showClient /></div>)}</div>}
    </div>
  )
}
