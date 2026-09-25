'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, CheckCircle2, ChevronDown, Clock, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { useAnchoredPopover } from '@/lib/useAnchoredPopover'
import { REASONS, REASON_LABEL, type Task } from '@/lib/managers'
import { DonutChart } from './Donut'
import { PulseLoader } from './PulseLoader'
import { Thumb, plural } from './UsageUi'

export type TaskView = Task & { clientName: string; clientLogo: string | null }
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

/** Uma otimização (sessão de alterações): o que foi feito numa frase e, na linha de baixo, motivo, texto e salvar. */
function TaskRow({ t, onSaved, first, editing }: { t: TaskView; onSaved: () => void; first?: boolean; editing?: boolean }) {
  const [kinds, setKinds] = useState<string[]>(t.reasonKinds)
  const [text, setText] = useState(t.reason ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    const r = await apiFetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: t.ids, reasonKinds: kinds, reason: text }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) as { error?: string } : {}
    setBusy(false)
    if (!r?.ok) return setErr(j.error ?? 'Não foi possível salvar.')
    onSaved()
  }

  return (
    <div style={{ padding: '14px 0', borderTop: first ? 'none' : '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{when(t.at)}{t.actorName ? ` · ${t.actorName}` : ''}</span>
        {t.headline}
        {t.items.length > 0 && <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ marginLeft: 8, background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, color: 'var(--text-2)', textDecoration: 'underline', cursor: 'pointer' }}>{open ? 'ocultar detalhes' : 'ver detalhes'}</button>}
      </div>
      {open && (
        <ul style={{ margin: 0, padding: '10px 12px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-card2)', borderRadius: 10 }}>
          {t.items.map((it, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}><span style={{ color: 'var(--text-1)' }}>{it.objectName ?? it.text}</span>{it.change ? ` · ${it.change}` : ''}{it.objectName ? ` · ${it.text}` : ''}</li>)}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ReasonSelect value={kinds} onChange={setKinds} />
        <input className="field" aria-label="Explique em uma frase" placeholder="Explique em uma frase (opcional)" value={text} onChange={e => setText(e.target.value)} maxLength={500} style={{ height: 34, fontSize: 13, flex: '1 1 180px', minWidth: 0, borderRadius: 9999, padding: '0 14px' }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || (!kinds.length && text.trim().length < 3)} style={{ borderRadius: 9999, flexShrink: 0 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} strokeWidth={1.75} />} {editing ? 'Atualizar' : 'Salvar'}
        </button>
      </div>
      {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{err}</p>}
    </div>
  )
}

/** Justificativas de um gestor, por cliente: o que ainda precisa explicar, o que já explicou e quanto está em dia. */
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

  // Um card por cliente, com as otimizações dele dentro. O cliente com a alteração mais recente vem primeiro.
  const byClient = useMemo(() => {
    const m = new Map<string, { slug: string; name: string; logo: string | null; tasks: TaskView[] }>()
    for (const t of data?.pending ?? []) {
      const e = m.get(t.clientSlug) ?? { slug: t.clientSlug, name: t.clientName, logo: t.clientLogo, tasks: [] }
      e.tasks.push(t); m.set(t.clientSlug, e)
    }
    return [...m.values()]
  }, [data])

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
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, flex: '1 1 260px', maxWidth: 520 }}>Tudo que foi feito numa conta em uma sessão vira uma otimização. Escolha um ou mais motivos e, se quiser, escreva uma frase. Últimos 30 dias.</p>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} strokeWidth={1.75} color="var(--amber)" aria-hidden="true" />
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>A justificar ({data.counts.pending})</h2>
        </div>
        {byClient.length === 0
          ? <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{total === 0 ? 'Nenhuma alteração registrada ainda. Elas aparecem aqui quando alguém mexer nas contas.' : 'Tudo justificado. Nada pendente.'}</div>
          : (
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', alignItems: 'start' }}>
              {byClient.map(c => (
                <article key={c.slug} className="card" style={{ padding: '16px 20px 4px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-soft)' }}>
                    <Thumb name={c.name} src={c.logo} size={40} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h3>
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{plural(c.tasks.length, 'otimização a justificar', 'otimizações a justificar')}</div>
                    </div>
                    <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--text-1)', flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />Pendente</span>
                  </div>
                  {c.tasks.map((t, i) => <TaskRow key={t.key} t={t} first={i === 0} onSaved={load} />)}
                </article>
              ))}
            </div>
          )}
      </section>

      {data.answered.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} strokeWidth={1.75} color="var(--green)" aria-hidden="true" />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Justificadas ({data.counts.answered})</h2>
          </div>
          <div className="card" style={{ padding: '4px 20px', display: 'flex', flexDirection: 'column' }}>
            {data.answered.map((t, i) => editing === t.key
              ? <div key={t.key} style={{ borderTop: i ? '1px solid var(--border-soft)' : 'none' }}><TaskRow t={t} first editing onSaved={() => { setEditing(null); void load() }} /></div>
              : (
                <div key={t.key} className="task-row" style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1.2fr) minmax(0, 1fr) auto', gap: 16, alignItems: 'center', padding: '12px 0', borderTop: i ? '1px solid var(--border-soft)' : 'none', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{when(t.at)}</span>
                  <span style={{ minWidth: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Thumb name={t.clientName} src={t.clientLogo} size={28} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.clientName}</span>
                      <span style={{ display: 'block', color: 'var(--text-2)', overflowWrap: 'anywhere' }}>{t.headline}</span>
                    </span>
                  </span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    {t.reasonKinds.length > 0 && <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{t.reasonKinds.map(k => <span key={k} className="badge" style={{ background: 'var(--green-soft)', color: 'var(--text-1)' }}>{REASON_LABEL[k] ?? k}</span>)}</span>}
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
