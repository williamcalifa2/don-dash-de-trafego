'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { Billing as B, Severity } from '@/lib/billing'
import { StaffShell } from './StaffShell'
import { PulseLoader } from './PulseLoader'
import { Thumb } from './UsageUi'
import { PlatformBadges } from './PlatformBadges'
import type { PlatformKey } from '@/lib/platforms'

interface Item { platforms: PlatformKey[]; managerId: string | null; slug: string; name: string; logoUrl: string | null; active: boolean; accountId: string; billing: B | null; error: string | null; severity: Severity }
interface Data { pending?: number; oldest?: number | null; managers: Array<{ id: string; name: string }>; items: Item[]; totals: Record<Severity, number>; at: number }

const money = (v: number, cur: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(v)
const SEV: Record<Severity, { color: string; soft: string; label: string; icon: React.ReactNode }> = {
  critical: { color: 'var(--red)', soft: 'var(--red-soft)', label: 'Precisa de ação', icon: <XCircle size={14} strokeWidth={1.75} /> },
  attention: { color: 'var(--amber)', soft: 'var(--amber-soft)', label: 'Atenção', icon: <AlertTriangle size={14} strokeWidth={1.75} /> },
  ok: { color: 'var(--green)', soft: 'var(--green-soft)', label: 'Em dia', icon: <CheckCircle2 size={14} strokeWidth={1.75} /> },
}
const th: React.CSSProperties = { padding: '10px 16px', fontWeight: 500, fontSize: 12, color: 'var(--text-2)', textAlign: 'left', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' }

function Pill({ s, text }: { s: Severity; text: string }) {
  const v = SEV[s]
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: v.color, background: v.soft, whiteSpace: 'nowrap' }}>{v.icon}{text}</span>
}

/** Faturamento: situação financeira de cada conta de anúncios (status, forma de pagamento, saldo/valor a pagar, gasto e limite), com as que pedem ação primeiro. */
export function Billing() {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const [mgr, setMgr] = useState('')
  const [now, setNow] = useState<number | null>(null)

  const load = useCallback(async (refresh = false) => {
    setBusy(true)
    try {
      const r = await apiFetch(`/api/admin/billing${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' })
      if (!r.ok) throw new Error()
      setData(await r.json() as Data); setFailed(null); setNow(Date.now())
    } catch { setFailed('Não foi possível carregar o faturamento agora.') } finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  // Contas ainda sem leitura entram aos poucos: volta a buscar até completar (no máximo 8 vezes).
  const tries = useRef(0)
  useEffect(() => {
    if (!data?.pending || tries.current >= 8) return
    const t = setTimeout(() => { tries.current++; void load() }, 15_000)
    return () => clearTimeout(t)
  }, [data, load])

  const items = useMemo(() => (data?.items ?? []).filter(i => (filter === 'all' || i.severity === filter) && (!mgr || (mgr === '_none' ? !i.managerId : i.managerId === mgr))), [data, filter, mgr])

  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Faturamento</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Situação financeira das contas de anúncios{data ? (data.pending ? ` · ${data.pending} aguardando leitura` : (data.oldest && now) ? ` · lido há ${Math.max(1, Math.round((now - data.oldest) / 60_000))} min` : '') : ''}</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { tries.current = 0; void load(true) }} disabled={busy}><RefreshCw size={14} strokeWidth={1.75} style={{ animation: busy ? 'spin 1s linear infinite' : undefined }} /> Atualizar</button>
        </header>

        {!data && !failed && <PulseLoader size={44} />}
        {failed && !data && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>{failed}</div>}
        {data && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {([['all', `Todas (${data.items.length})`], ['critical', `Precisa de ação (${data.totals.critical})`], ['attention', `Atenção (${data.totals.attention})`], ['ok', `Em dia (${data.totals.ok})`]] as const).map(([k, l]) => (
                <button key={k} type="button" className="pill-btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
              {data.managers.length > 0 && (
                <select className="field" aria-label="Filtrar por gestor" value={mgr} onChange={e => setMgr(e.target.value)} style={{ width: 'auto', height: 32, marginLeft: 'auto' }}>
                  <option value="">Todos os gestores</option>
                  {data.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  <option value="_none">Sem gestor</option>
                </select>
              )}
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {items.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>{data.items.length ? 'Nenhuma conta neste filtro.' : 'Nenhum cliente com conta de anúncios vinculada.'}</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={th}>Conta</th><th style={th}>Status</th><th style={th}>Como paga</th>
                      <th style={{ ...th, textAlign: 'right' }}>Saldo / a pagar</th><th style={{ ...th, textAlign: 'right' }}>Gasto total</th><th style={{ ...th, textAlign: 'right' }}>Limite</th>
                    </tr></thead>
                    <tbody>
                      {items.map(i => {
                        const b = i.billing
                        return (
                          <tr key={i.slug} style={{ borderTop: '1px solid var(--border-soft)' }}>
                            <td style={{ ...td, minWidth: 240 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Thumb name={i.name} src={i.logoUrl} size={36} />
                                <div style={{ minWidth: 0 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><a href={`/dashboard/${i.slug}`} style={{ fontWeight: 600, color: 'var(--text-1)' }}>{i.name}</a><PlatformBadges platforms={i.platforms} height={10} /></span>
                                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.accountId.replace('act_', '')}{!i.active ? ' · cliente pausado' : ''}</div>
                                </div>
                              </div>
                            </td>
                            {!b ? <td style={td} colSpan={5}><Pill s="attention" text="Sem leitura" /> <span style={{ color: 'var(--text-2)', marginLeft: 8 }}>{i.error}</span></td> : (
                              <>
                                <td style={td}>
                                  <Pill s={b.status.severity} text={b.status.label} />
                                  {b.alerts.length > 0 && <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: SEV[b.severity].color }}>{b.alerts.filter(a => a.text !== b.status.label).map(a => <span key={a.text}>{a.text}</span>)}</div>}
                                </td>
                                <td style={{ ...td, maxWidth: 240 }}><span title={b.pay.label} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pay.kind === 'prepaid' ? 'Saldo pré-pago' : b.pay.label}</span></td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                                  {b.pay.kind === 'prepaid'
                                    ? (b.available != null ? <span style={{ color: b.available <= 0 ? 'var(--red)' : undefined }}>{money(b.available, b.currency)}</span> : '—')
                                    : (b.owed != null ? money(b.owed, b.currency) : '—')}
                                  <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-2)' }}>{b.pay.kind === 'prepaid' ? 'disponível' : 'a pagar'}</div>
                                </td>
                                <td style={{ ...td, textAlign: 'right' }}>{money(b.spent, b.currency)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{b.spendCap != null ? <>{money(b.spendCap, b.currency)}<div style={{ fontSize: 11, color: 'var(--text-2)' }}>restam {b.capLeftPct}%</div></> : <span style={{ color: 'var(--text-2)' }}>sem limite</span>}</td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </StaffShell>
  )
}
