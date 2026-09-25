'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, Image as ImageIcon, Layers, Loader2, Target, ToggleRight, Users, Wallet } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { REASONS, REASON_LABEL, type Task } from '@/lib/managers'
import { DonutChart, KIND_COLOR } from './Donut'
import { PulseLoader } from './PulseLoader'
import { plural } from './UsageUi'

export type TaskView = Task & { clientName: string }
interface TasksData {
  setup: 'ready' | 'tables' | 'columns' | 'error'
  manager: { id: string; name: string } | null
  pending: TaskView[]; answered: TaskView[]
  counts: { pending: number; answered: number; rate: number | null }
}

const pad = (n: number) => String(n).padStart(2, '0')
const when = (iso: string) => {
  const d = new Date(iso), t = new Date()
  const day = d.toDateString() === t.toDateString() ? 'hoje' : new Date(t.getTime() - 86_400_000).toDateString() === d.toDateString() ? 'ontem' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
  return `${day} às ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const KIND_ICON_SMALL: Record<string, React.ReactNode> = { status: <ToggleRight size={16} strokeWidth={1.75} />, budget: <Wallet size={16} strokeWidth={1.75} />, audience: <Users size={16} strokeWidth={1.75} />, creative: <ImageIcon size={16} strokeWidth={1.75} />, bid: <Target size={16} strokeWidth={1.75} />, structure: <Layers size={16} strokeWidth={1.75} /> }
const sqlHint = <div className="card" style={{ padding: 24, fontSize: 14 }}>Falta liberar as otimizações no banco. Rode o SQL <code>supabase/2026-09-gestores-3.sql</code> no Supabase e recarregue a página.</div>

/** Uma tarefa: o que foi feito numa frase, com os detalhes recolhidos, e o campo do motivo numa linha só. */
function TaskCard({ t, onSaved, editing }: { t: TaskView; onSaved: () => void; editing?: boolean }) {
  const [kind, setKind] = useState<string | null>(t.reasonKind)
  const [text, setText] = useState(t.reason ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const c = KIND_COLOR[t.kind] ?? KIND_COLOR.other

  async function save() {
    setBusy(true); setErr(null)
    const r = await apiFetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: t.ids, reasonKind: kind, reason: text }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) as { error?: string } : {}
    setBusy(false)
    if (!r?.ok) return setErr(j.error ?? 'Não foi possível salvar.')
    onSaved()
  }

  return (
    <article className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c, display: 'grid', placeItems: 'center' }}>{KIND_ICON_SMALL[t.kind] ?? <Layers size={16} strokeWidth={1.75} />}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.clientName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{when(t.at)}{t.actorName ? ` · ${t.actorName}` : ''}</div>
        </div>
        {!editing && <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--text-1)', flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />Pendente</span>}
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        {t.headline}
        {t.items.length > 0 && <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ marginLeft: 8, background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, color: 'var(--text-2)', textDecoration: 'underline', cursor: 'pointer' }}>{open ? 'ocultar detalhes' : 'ver detalhes'}</button>}
      </div>
      {open && (
        <ul style={{ margin: 0, padding: '10px 12px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-card2)', borderRadius: 10 }}>
          {t.items.map((it, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}><span style={{ color: 'var(--text-1)' }}>{it.objectName ?? it.text}</span>{it.change ? ` · ${it.change}` : ''}{!it.objectName ? '' : ` · ${it.text}`}</li>)}
        </ul>
      )}

      <div role="group" aria-label="Motivo" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {REASONS.map(([k, l]) => <button key={k} type="button" className="pill-btn" aria-pressed={kind === k} onClick={() => setKind(cur => (cur === k ? null : k))}>{l}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="field" aria-label="Explique em uma frase" placeholder="Explique em uma frase (opcional)" value={text} onChange={e => setText(e.target.value)} maxLength={500} style={{ height: 34, fontSize: 13, flex: 1, minWidth: 0 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || (!kind && text.trim().length < 3)} style={{ flexShrink: 0 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} strokeWidth={1.75} />} {editing ? 'Atualizar' : 'Salvar'}
        </button>
      </div>
      {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{err}</p>}
    </article>
  )
}

/** Justificativas de um gestor: o que ainda precisa explicar, o que já explicou e quanto está em dia. */
export function TaskPanel({ managerId, onCount }: { managerId: string | null; onCount?: (pending: number) => void }) {
  const [data, setData] = useState<TasksData | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/tasks${managerId ? `?manager=${encodeURIComponent(managerId)}` : ''}`, { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setFailed(true); return }
      const j = await r.json() as TasksData
      setData(j); setFailed(false); onCount?.(j.counts?.pending ?? 0)
    } catch { setFailed(true) }
  }, [managerId, onCount])
  useEffect(() => { void load() }, [load])

  if (failed) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar as otimizações agora.</div>
  if (!data) return <PulseLoader size={44} />
  if (data.setup === 'columns' || data.setup === 'tables') return sqlHint

  const total = data.counts.pending + data.counts.answered
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <DonutChart legend={false} size={84} thickness={18} slices={[{ key: 'ok', label: 'Justificadas', value: data.counts.answered, color: 'var(--green)' }, { key: 'pend', label: 'Pendentes', value: data.counts.pending, color: 'var(--amber)' }]} center={data.counts.rate == null ? '—' : `${data.counts.rate}%`} />
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {([['A justificar', data.counts.pending, 'var(--amber)'], ['Justificadas', data.counts.answered, 'var(--green)']] as const).map(([l, v, col]) => (
            <div key={l}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>{l}</div>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: col }}>{v}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, flex: '1 1 260px', maxWidth: 520 }}>Tudo que foi feito numa conta em uma sessão vira uma tarefa. Escolha o motivo e, se quiser, escreva uma frase. Últimos 30 dias.</p>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} strokeWidth={1.75} color="var(--amber)" aria-hidden="true" />
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>A justificar ({data.counts.pending})</h2>
        </div>
        {data.pending.length === 0
          ? <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{total === 0 ? 'Nenhuma alteração registrada ainda. Elas aparecem aqui quando alguém mexer nas contas.' : 'Tudo justificado. Nada pendente.'}</div>
          : <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))' }}>{data.pending.map(t => <TaskCard key={t.key} t={t} onSaved={load} />)}</div>}
      </section>

      {data.answered.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} strokeWidth={1.75} color="var(--green)" aria-hidden="true" />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Justificadas ({data.counts.answered})</h2>
          </div>
          <div className="card" style={{ padding: 4, display: 'flex', flexDirection: 'column' }}>
            {data.answered.map((t, i) => editing === t.key
              ? <div key={t.key} style={{ padding: 8 }}><TaskCard t={t} editing onSaved={() => { setEditing(null); void load() }} /></div>
              : (
                <div key={t.key} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) minmax(0, 1.1fr) auto', gap: 16, alignItems: 'center', padding: '12px 16px', borderTop: i ? '1px solid var(--border-soft)' : 'none', fontSize: 13 }} className="task-row">
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{when(t.at)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.clientName}</span>
                    <span style={{ display: 'block', color: 'var(--text-2)', overflowWrap: 'anywhere' }}>{t.headline}</span>
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    {t.reasonKind && <span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--text-1)' }}>{REASON_LABEL[t.reasonKind] ?? t.reasonKind}</span>}
                    {t.reason && <span style={{ overflowWrap: 'anywhere' }}>{t.reason}</span>}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(t.key)}>Editar</button>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
