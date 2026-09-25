'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { STALLED_DAYS, type StalledBy, type StalledRow } from '@/lib/stalled'
import { Thumb } from './UsageUi'

interface Data { setup: 'ready' | 'tables'; rows: StalledRow[]; byManager: Array<{ id: string; name: string; n: number }>; lookbackDays: number }

const BY: Array<[StalledBy, string]> = [['any', 'Sem ação e sem abrir'], ['action', 'Sem ação'], ['access', 'Sem abrir no painel']]
const th: React.CSSProperties = { padding: '10px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-2)', textAlign: 'left', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' }
const dias = (d: number | null, never: string) => (d == null ? never : d === 0 ? 'hoje' : d === 1 ? '1 dia' : `${d} dias`)

/** Contas sem movimento: gestor, conta, última ação, último acesso no painel e dias parada, com o limite de dias escolhido. */
export function StalledAccounts({ onOpenManager }: { onOpenManager: (id: string) => void }) {
  const [days, setDays] = useState<number>(3)
  const [by, setBy] = useState<StalledBy>('any')
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    apiFetch(`/api/admin/managers/stalled?days=${days}&by=${by}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject())).then((j: Data) => { if (alive) { setData(j); setFailed(false) } })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [days, by])

  if (failed && !data) return null
  if (!data || data.setup !== 'ready') return null
  const n = data.rows.length
  const alertTone = n > 0

  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap', borderBottom: n ? '1px solid var(--border)' : undefined }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0, background: alertTone ? 'var(--amber-soft)' : 'var(--green-soft)', color: alertTone ? 'var(--amber)' : 'var(--green)' }}>
          {alertTone ? <AlertTriangle size={18} strokeWidth={1.75} /> : <CheckCircle2 size={18} strokeWidth={1.75} />}
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Contas sem movimento</h2>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>
            {n === 0 ? `Nenhuma conta parada há ${days} dias ou mais.` : `${n} ${n === 1 ? 'conta' : 'contas'} ${by === 'access' ? 'sem abrir no painel' : by === 'action' ? 'sem ação' : 'sem ação e sem abrir no painel'} há ${days} dias ou mais`}
            {data.byManager.length > 0 && ` · ${data.byManager.map(m => `${m.name} (${m.n})`).join(', ')}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Critério">
          {BY.map(([k, l]) => <button key={k} type="button" className="pill-btn" aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Dias parada">
          {STALLED_DAYS.map(d => <button key={d} type="button" className="pill-btn" aria-pressed={days === d} onClick={() => setDays(d)}>{d}+ dias</button>)}
        </div>
      </div>
      {n > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr>
              <th style={th}>Gestor</th><th style={th}>Conta</th><th style={th}>Última ação</th><th style={th}>Último acesso no app</th><th style={{ ...th, textAlign: 'right' }}>Dias parada</th>
            </tr></thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={`${r.managerId}|${r.slug}`} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={td}>
                    <button type="button" onClick={() => onOpenManager(r.managerId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--text-1)', font: 'inherit' }}>
                      <Thumb name={r.managerName} src={r.managerAvatar} size={28} />{r.managerName}
                    </button>
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}><a href={`/dashboard/${r.slug}`} style={{ color: 'var(--text-1)' }}>{r.clientName}</a></td>
                  <td style={td}>{r.lastAction ? <>{dias(r.daysAction, '')}<span style={{ color: 'var(--text-2)' }}> · {new Date(r.lastAction).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span></> : <span style={{ color: 'var(--text-2)' }}>nenhuma em {data.lookbackDays} dias</span>}</td>
                  <td style={td}>{r.accessUnknown ? <span style={{ color: 'var(--text-2)' }} title="Gestor sem e-mail de login ligado">não dá para saber</span> : r.lastAccess ? <>{dias(r.daysAccess, '')}<span style={{ color: 'var(--text-2)' }}> · {new Date(r.lastAccess).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span></> : <span style={{ color: 'var(--text-2)' }}>nenhum em {data.lookbackDays} dias</span>}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: (r.daysIdle ?? 99) >= 7 ? 'var(--red)' : 'var(--amber)' }}>{r.daysIdle == null ? '—' : `${r.daysIdle} d`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, padding: '10px 16px', borderTop: '1px solid var(--border-soft)' }}>
        A ação vem das alterações feitas na conta (histórico da Meta e do painel). O acesso vem do uso do painel; quem só olhou no Gerenciador de Anúncios da Meta, sem mudar nada, não aparece.
      </p>
    </section>
  )
}
