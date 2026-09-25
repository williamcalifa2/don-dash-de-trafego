'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { KIND_LABEL, REASONS, REASON_LABEL, type ActivityKind, type Task } from '@/lib/managers'
import { ChartCard, DonutChart, KIND_COLOR } from './Donut'
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
const sqlHint = <div className="card" style={{ padding: 24, fontSize: 14 }}>Falta liberar as justificativas no banco. Rode o SQL <code>supabase/2026-09-gestores-3.sql</code> no Supabase e recarregue a página.</div>

/** Uma alteração (ou várias seguidas do mesmo tipo no mesmo cliente) esperando o "porquê". */
function TaskCard({ t, onSaved, editing }: { t: TaskView; onSaved: () => void; editing?: boolean }) {
  const [kind, setKind] = useState<string | null>(t.reasonKind)
  const [text, setText] = useState(t.reason ?? '')
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
    <article className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{t.count}×</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{KIND_LABEL[t.kind as ActivityKind] ?? t.kind} · {t.clientName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{when(t.at)}{t.actorName ? ` · por ${t.actorName}` : ''}{t.count > 1 ? ` · ${plural(t.count, 'alteração', 'alterações')}` : ''}</div>
        </div>
        {!editing && <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--text-1)', flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />Pendente</span>}
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text-2)' }}>
        {t.items.map((it, i) => (
          <li key={i} style={{ overflowWrap: 'anywhere' }}>
            <span style={{ color: 'var(--text-1)' }}>{it.summary}</span>{it.objectName ? ` · ${it.level ? `${it.level} ` : ''}${it.objectName}` : ''}{it.change ? <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}> · {it.change}</strong> : null}
          </li>
        ))}
        {t.count > t.items.length && <li>e mais {t.count - t.items.length}</li>}
      </ul>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Por que você fez isso?</span>
        <div role="group" aria-label="Motivo" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {REASONS.map(([k, l]) => <button key={k} type="button" className="pill-btn" aria-pressed={kind === k} onClick={() => setKind(cur => (cur === k ? null : k))}>{l}</button>)}
        </div>
        <textarea className="field" aria-label="Explique em uma frase" placeholder="Explique em uma frase (opcional se escolher um motivo)" value={text} onChange={e => setText(e.target.value)} maxLength={500}
          style={{ height: 72, padding: 10, resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} />
        {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || (!kind && text.trim().length < 3)}>
            {busy ? <><Loader2 size={14} className="spin" /> Salvando…</> : <><CheckCircle2 size={14} strokeWidth={1.75} /> {editing ? 'Atualizar justificativa' : 'Salvar justificativa'}</>}
          </button>
        </div>
      </div>
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

  if (failed) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar as justificativas agora.</div>
  if (!data) return <PulseLoader size={44} />
  if (data.setup === 'columns' || data.setup === 'tables') return sqlHint

  const total = data.counts.pending + data.counts.answered
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="usage-grid">
        <ChartCard title="Justificativas em dia" hint="Quantas alterações já têm o motivo explicado (últimos 30 dias)">
          <DonutChart slices={[{ key: 'ok', label: 'Justificadas', value: data.counts.answered, color: 'var(--green)' }, { key: 'pend', label: 'Pendentes', value: data.counts.pending, color: 'var(--amber)' }]} center={data.counts.rate == null ? '—' : `${data.counts.rate}%`} sub="em dia" />
        </ChartCard>
        <section className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Como funciona</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>Cada alteração de otimização feita numa conta (pausar, mudar orçamento, público, criativo, lance) gera uma tarefa aqui, para quem fez. Alterações seguidas do mesmo tipo no mesmo cliente entram juntas. Escolha o motivo e, se quiser, escreva uma frase.</p>
        </section>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} strokeWidth={1.75} color="var(--amber)" aria-hidden="true" />
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Para justificar ({data.counts.pending})</h2>
        </div>
        {data.pending.length === 0
          ? <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{total === 0 ? 'Nenhuma alteração registrada ainda. Elas aparecem aqui quando alguém mexer nas contas.' : 'Tudo justificado. Nada pendente.'}</div>
          : <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))' }}>{data.pending.map(t => <TaskCard key={t.key} t={t} onSaved={load} />)}</div>}
      </section>

      {data.answered.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} strokeWidth={1.75} color="var(--green)" aria-hidden="true" />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Já justificadas ({data.counts.answered})</h2>
          </div>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))' }}>
            {data.answered.map(t => editing === t.key
              ? <TaskCard key={t.key} t={t} editing onSaved={() => { setEditing(null); void load() }} />
              : (
                <article key={t.key} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{KIND_LABEL[t.kind as ActivityKind] ?? t.kind} · {t.clientName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }}>{when(t.at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.items[0]?.summary}{t.count > 1 ? ` e mais ${t.count - 1}` : ''}{t.items[0]?.objectName ? ` · ${t.items[0].objectName}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {t.reasonKind && <span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--text-1)' }}>{REASON_LABEL[t.reasonKind] ?? t.reasonKind}</span>}
                    {t.reason && <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{t.reason}</span>}
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(t.key)}>Editar justificativa</button>
                </article>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
