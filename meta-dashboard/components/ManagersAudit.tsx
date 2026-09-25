'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, ShieldCheck, XCircle } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { Finding, Severity } from '@/lib/managersAudit'

interface Data { setup: 'ready' | 'tables'; days: number; findings: Finding[]; fixableRows: number }

const TONE: Record<Severity, { color: string; soft: string; icon: React.ReactNode }> = {
  error: { color: 'var(--red)', soft: 'var(--red-soft)', icon: <XCircle size={16} strokeWidth={1.75} /> },
  warn: { color: 'var(--amber)', soft: 'var(--amber-soft)', icon: <AlertTriangle size={16} strokeWidth={1.75} /> },
  info: { color: 'var(--text-2)', soft: 'var(--bg-card2)', icon: <Info size={16} strokeWidth={1.75} /> },
  ok: { color: 'var(--green)', soft: 'var(--green-soft)', icon: <CheckCircle2 size={16} strokeWidth={1.75} /> },
}

/** Conferência dos dados dos gestores: aponta carteira quebrada, conta repetida, e-mail sem gestor, histórico sem dono. Fechada por padrão. */
export function ManagersAudit({ onFixed }: { onFixed: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => apiFetch('/api/admin/managers/audit', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: Data | null) => { if (j) setData(j) }).catch(() => { }), [])
  useEffect(() => { void load() }, [load])

  async function fix() {
    setBusy(true); setMsg(null)
    try {
      const r = await apiFetch('/api/admin/managers/audit', { method: 'POST' })
      const j = await r.json().catch(() => ({})) as { fixed?: number }
      setMsg(r.ok ? `${j.fixed ?? 0} ações passaram para o gestor da conta.` : 'Não foi possível corrigir agora.')
      await load(); onFixed()
    } finally { setBusy(false) }
  }

  if (!data || data.setup !== 'ready') return null
  const problems = data.findings.filter(f => f.severity === 'error' || f.severity === 'warn')
  const worst: Severity = data.findings[0]?.severity ?? 'ok'
  const tone = TONE[worst === 'info' ? 'ok' : worst]

  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0, background: tone.soft, color: tone.color }}><ShieldCheck size={18} strokeWidth={1.75} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 600 }}>Conferência dos dados</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{problems.length ? `${problems.length} ${problems.length === 1 ? 'ponto pede' : 'pontos pedem'} atenção · últimos ${data.days} dias` : 'Carteira, e-mails e histórico consistentes'}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--text-3)' }} />
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msg && <div role="status" style={{ fontSize: 13 }}>{msg}</div>}
          {data.findings.map(f => (
            <div key={f.id} style={{ display: 'flex', gap: 12 }}>
              <span aria-hidden="true" style={{ color: TONE[f.severity].color, flexShrink: 0, marginTop: 2 }}>{TONE[f.severity].icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{f.detail}</div>
                {f.items && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-1)', display: 'flex', flexDirection: 'column', gap: 2 }}>{f.items.map(x => <li key={x}>{x}</li>)}</ul>}
                {f.id === 'log-null' && <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={fix} disabled={busy}>{busy && <Loader2 size={14} className="spin" />} Corrigir histórico</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
