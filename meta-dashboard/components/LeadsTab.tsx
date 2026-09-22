'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, RefreshCw, Search, Users, TrendingUp, DollarSign, StickyNote, Clock, LayoutGrid, Table as TableIcon, MessageSquare } from 'lucide-react'
import { useLeadsData as useLeads } from '@/lib/leadsContext'
import type { Lead, LeadStatus } from '@/lib/leadTypes'
import { LeadDrawer } from './LeadDrawer'
import { NewLeadModal } from './NewLeadModal'
import { LeadsKanban } from './LeadsKanban'
import { isStale, timeAgo, STALE_HOURS, waLink, fmtPhone } from '@/lib/leadUtils'

export const STATUS_META: Record<LeadStatus, { dot: string; bg: string }> = {
  'Novo': { dot: 'var(--accent)', bg: 'var(--accent-soft)' },
  'Em andamento': { dot: 'var(--amber)', bg: 'var(--amber-soft)' },
  'Convertido': { dot: 'var(--green)', bg: 'var(--green-soft)' },
  'Perdido': { dot: 'var(--red)', bg: 'var(--red-soft)' },
}
const ALL_STATUSES: LeadStatus[] = ['Novo', 'Em andamento', 'Convertido', 'Perdido']

function fmtBRL(v: number | null | undefined) {
  if (!v && v !== 0) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* ─── Editable valor cell ─── */
function ValorCell({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.select() }, [editing])

  function commit() {
    setEditing(false)
    const n = parseFloat(draft.replace(',', '.'))
    onSave(isNaN(n) ? null : n)
  }

  if (editing) return (
    <input
      ref={ref}
      type="number"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      style={{
        width: '100%', height: '100%', padding: '0 8px',
        background: 'var(--accent-soft)', border: '2px solid var(--accent)',
        outline: 'none', color: 'var(--text-1)', fontSize: 12,
        textAlign: 'right', boxSizing: 'border-box',
      }}
    />
  )

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        width: '100%', height: '100%', padding: '0 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        cursor: 'cell', fontSize: 12,
        color: value != null ? 'var(--text-1)' : 'var(--text-3)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value != null ? fmtBRL(value) : '—'}
    </div>
  )
}

/* ─── Status dropdown (fixed-position to escape overflow:hidden) ─── */
function StatusCell({ status, onChange }: { status: LeadStatus; onChange: (s: LeadStatus) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const m = STATUS_META[status]

  function handleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen(v => !v)
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="badge"
        style={{ background: m.bg, color: 'var(--text-1)', border: 'none', cursor: 'pointer', padding: '1px 10px', lineHeight: 1.6 }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
        {status}
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div className="popover" role="listbox" style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000, minWidth: 176 }}>
            {ALL_STATUSES.map(st => (
              <div key={st} role="option" aria-selected={st === status} className="popover-item"
                onClick={() => { onChange(st); setOpen(false) }}
                style={{ fontWeight: st === status ? 600 : 400, background: st === status ? 'var(--bg-card2)' : undefined }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_META[st].dot, flexShrink: 0 }} />
                {st}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Column defs ─── */
interface ColDef { key: string; label: string; width: number; align?: 'left' | 'right' }

const COLS: ColDef[] = [
  { key: 'date', label: 'Data', width: 76 },
  { key: 'nome', label: 'Nome', width: 170 },
  { key: 'telefone', label: 'WhatsApp', width: 150 },
  { key: 'status', label: 'Status', width: 132 },
  { key: 'valor_pedido', label: 'Valor', width: 100, align: 'right' },
  { key: 'contato', label: 'Contato', width: 150 },
  { key: 'motivo', label: 'Motivo', width: 132 },
  { key: 'campanha', label: 'Campanha', width: 220 },
  { key: 'conjunto', label: 'Conjunto', width: 200 },
  { key: 'ad_name', label: 'Anúncio', width: 200 },
  { key: 'email', label: 'E-mail', width: 200 },
]

const ID_W = 80
const ROW_H = 24

export function LeadsTab({ openId, onOpenConsumed, readOnly = false }: { openId?: string | null; onOpenConsumed?: () => void; readOnly?: boolean }) {
  const { leads, loading, error, saveError, clearSaveError, refetch, patchLead } = useLeads()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'Todos' | 'Parados'>('Todos')
  const [newOpen, setNewOpen] = useState(false)
  const [drawer, setDrawer] = useState<{ id: string; focus: 'motivo' | 'valor' | null } | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('leads_view_mode')
      if (saved === 'kanban' || saved === 'table') setViewMode(saved)
    } catch { }
  }, [])

  const handleSetViewMode = (mode: 'table' | 'kanban') => {
    setViewMode(mode)
    try { localStorage.setItem('leads_view_mode', mode) } catch { }
  }

  useEffect(() => {
    if (openId) { setDrawer({ id: openId, focus: null }); onOpenConsumed?.() }
  }, [openId, onOpenConsumed])

  const staleCount = leads.filter(l => isStale(l)).length
  const drawerLead = drawer ? leads.find(l => l.id === drawer.id) ?? null : null

  function changeStatus(lead: Lead, status: LeadStatus) {
    patchLead(lead.id, { status })
    if (status === 'Perdido' && !lead.motivo_perda) setDrawer({ id: lead.id, focus: 'motivo' })
    else if (status === 'Convertido' && lead.valor_pedido == null) setDrawer({ id: lead.id, focus: 'valor' })
  }

  const filtered = leads.filter(l => {
    const matchStatus = filterStatus === 'Todos' || (filterStatus === 'Parados' ? isStale(l) : l.status === filterStatus)
    const q = search.toLowerCase()
    const matchSearch = !q || [l.nome, l.email, l.telefone, l.campanha, l.ad_name]
      .some(v => v?.toLowerCase().includes(q))
    return matchStatus && matchSearch
  })

  const stats = {
    total: leads.length,
    convertido: leads.filter(l => l.status === 'Convertido').length,
    revenue: leads.reduce((s, l) => s + (l.status === 'Convertido' ? (l.valor_pedido ?? 0) : 0), 0),
    convRate: leads.length ? (leads.filter(l => l.status === 'Convertido').length / leads.length) * 100 : 0,
  }

  function getCellText(lead: Lead, key: string): string {
    switch (key) {
      case 'date': return lead.date ? fmtDate(lead.date) : fmtDate(lead.created_at)
      case 'nome': return lead.nome ?? ''
      case 'telefone': return lead.telefone ?? ''
      case 'email': return lead.email ?? ''
      case 'campanha': return lead.campanha ?? ''
      case 'conjunto': return lead.conjunto ?? ''
      case 'ad_name': return lead.ad_name ?? ''
      default: return ''
    }
  }

  const totalW = COLS.reduce((s, c) => s + c.width, ID_W)

  const novo = leads.filter(l => l.status === 'Novo').length
  const emAndamento = leads.filter(l => l.status === 'Em andamento').length
  const perdido = leads.filter(l => l.status === 'Perdido').length

  const STAT_TILES: { label: string; value: string; color: string; icon?: React.ReactNode; dot?: string }[] = [
    { icon: <Users size={16} strokeWidth={1.75} />, label: 'Total leads', value: String(stats.total), color: 'var(--text-1)' },
    { dot: STATUS_META['Novo'].dot, label: 'Novo', value: String(novo), color: 'var(--text-1)' },
    { dot: STATUS_META['Em andamento'].dot, label: 'Em andamento', value: String(emAndamento), color: 'var(--text-1)' },
    { dot: STATUS_META['Convertido'].dot, label: 'Convertidos', value: String(stats.convertido), color: 'var(--green)' },
    { dot: STATUS_META['Perdido'].dot, label: 'Perdidos', value: String(perdido), color: 'var(--red)' },
    { icon: <Clock size={16} strokeWidth={1.75} />, label: `Sem contato +${STALE_HOURS}h`, value: String(staleCount), color: staleCount > 0 ? 'var(--amber)' : 'var(--text-1)' },
    { icon: <TrendingUp size={16} strokeWidth={1.75} />, label: 'Taxa de conv.', value: `${stats.convRate.toFixed(1)}%`, color: 'var(--text-1)' },
    { icon: <DollarSign size={16} strokeWidth={1.75} />, label: 'Receita', value: fmtBRL(stats.revenue).replace(/,00$/, '') || 'R$ 0', color: 'var(--green)' },
  ]

  return (
    <div>
      {/* Indicadores */}
      <div className="kpi-grid stagger" style={{ marginBottom: 16 }}>
        {STAT_TILES.map(t => (
          <div key={t.label} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
              {t.icon ?? <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />}
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{t.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: t.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              {t.value}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderBottom: '1px solid var(--border-soft)', borderRadius: '16px 16px 0 0',
        padding: 12, flexWrap: 'wrap',
      }}>
        <label className="search" style={{ flex: 1, minWidth: 200, height: 36 }}>
          <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar lead"
            aria-label="Buscar lead"
          />
        </label>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['Todos', ...ALL_STATUSES, ...(staleCount > 0 ? ['Parados' as const] : [])] as const).map(st => (
            <button key={st} className="pill-btn" aria-pressed={filterStatus === st} onClick={() => setFilterStatus(st)}>
              {st === 'Parados' ? `Sem contato (${staleCount})` : st}
            </button>
          ))}
        </div>

        {/* View Mode Switcher: Tabela / Kanban */}
        <div style={{ display: 'inline-flex', background: 'var(--bg-card2)', padding: 2, borderRadius: 8, border: '1px solid var(--border-soft)' }}>
          <button
            type="button"
            onClick={() => handleSetViewMode('table')}
            className="btn btn-ghost btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: 12,
              background: viewMode === 'table' ? 'var(--bg-card)' : 'transparent',
              color: viewMode === 'table' ? 'var(--text-1)' : 'var(--text-3)',
              boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Visualização em Tabela"
          >
            <TableIcon size={14} /> Tabela
          </button>
          <button
            type="button"
            onClick={() => handleSetViewMode('kanban')}
            className="btn btn-ghost btn-sm"
            style={{
              padding: '4px 8px',
              fontSize: 12,
              background: viewMode === 'kanban' ? 'var(--bg-card)' : 'transparent',
              color: viewMode === 'kanban' ? 'var(--text-1)' : 'var(--text-3)',
              boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Visualização Kanban (Pipeline)"
          >
            <LayoutGrid size={14} /> Kanban
          </button>
        </div>

        {!readOnly && <button onClick={() => setNewOpen(true)} className="btn btn-soft btn-sm">
          <Plus size={16} strokeWidth={1.75} /> Novo lead
        </button>}
        <button onClick={refetch} disabled={loading} className="btn btn-outline btn-sm">
          <RefreshCw size={16} strokeWidth={1.75} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          Atualizar
        </button>
      </div>

      {viewMode === 'kanban' ? (
        <div style={{ marginTop: 14 }}>
          <LeadsKanban
            leads={filtered}
            onSelectLead={lead => setDrawer({ id: lead.id, focus: null })}
            onChangeStatus={(lead, st) => changeStatus(lead, st)}
            readOnly={readOnly}
          />
        </div>
      ) : (
        /* Tabela */
        <div style={{
          overflowX: 'auto', border: '1px solid var(--border)',
          borderTop: 'none', borderRadius: '0 0 16px 16px',
          background: 'var(--bg-card)', boxShadow: 'var(--shadow-soft)',
        }}>
          <div style={{ minWidth: totalW }}>

            {/* Header */}
            <div style={{
              display: 'flex', height: ROW_H + 4,
              background: 'var(--bg-card2)',
              borderBottom: '1px solid var(--border)',
              userSelect: 'none', position: 'sticky', top: 0, zIndex: 10,
            }}>
              <div style={{
                width: ID_W, minWidth: ID_W, height: ROW_H + 4,
                borderRight: '1px solid var(--border-soft)',
                display: 'flex', alignItems: 'center', padding: '0 8px',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>ID</span>
              </div>
              {COLS.map((col, ci) => (
                <div key={col.key} style={{
                  width: col.width, minWidth: col.width, height: ROW_H + 4,
                  borderRight: ci < COLS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  padding: '0 8px', display: 'flex', alignItems: 'center',
                  justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
                  fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
                  textTransform: 'uppercase', letterSpacing: '.06em',
                }}>
                  {col.label}
                </div>
              ))}
            </div>

            {saveError && (
              <div role="alert" style={{ margin: 16, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--red-soft)', border: '1px solid hsl(0 84% 60% / .3)', borderRadius: 'var(--radius-lg)', fontSize: 14 }}>
                <span style={{ flex: 1 }}><strong style={{ fontWeight: 600 }}>Não foi possível salvar a alteração.</strong> {saveError}</span>
                <button className="btn btn-ghost btn-sm" onClick={clearSaveError}>Fechar</button>
              </div>
            )}
            {error && (
              <div style={{ margin: 16, padding: 16, background: 'var(--red-soft)', border: '1px solid hsl(0 84% 60% / .3)', borderRadius: 'var(--radius-lg)', color: 'var(--red)', fontSize: 14 }}>
                Não foi possível carregar os leads: {error}
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div style={{ margin: 24, padding: '40px 16px', border: '1px dashed var(--border-input)', borderRadius: 'var(--radius-lg)', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
                <Users size={32} strokeWidth={1.5} style={{ opacity: .5, margin: "0 auto 8px", display: "block" }} aria-hidden="true" />
                <div>
                  {leads.length === 0
                    ? 'Nenhum lead ainda. Os do formulário do Meta chegam sozinhos; os outros você cadastra em “Novo lead”.'
                    : 'Nenhum resultado para o filtro atual.'}
                </div>
              </div>
            )}

            {/* Rows */}
            {filtered.map((lead, rowIdx) => {
              const isSelected = drawer?.id === lead.id
              const stale = isStale(lead)
              return (
                <div
                  key={lead.id}
                  className="lead-row"
                  onClick={() => setDrawer({ id: lead.id, focus: null })}
                  style={{
                    display: 'flex', height: ROW_H, cursor: 'pointer',
                    borderBottom: rowIdx < filtered.length - 1 ? '1px solid var(--border-soft)' : 'none',
                    background: isSelected ? 'var(--accent-soft)' : stale ? 'var(--amber-soft)' : undefined,
                  }}
                >
                  {/* ID cell */}
                  <div
                    title={lead.id}
                    style={{
                      width: ID_W, minWidth: ID_W, height: ROW_H,
                      borderRight: '1px solid var(--border-soft)',
                      display: 'flex', alignItems: 'center', padding: '0 8px',
                      background: 'var(--bg-card2)',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      fontSize: 11, color: 'var(--text-2)',
                      userSelect: 'all',
                    }}>
                      {lead.id.slice(0, 8)}
                    </span>
                  </div>

                  {COLS.map((col, ci) => (
                    <div key={col.key} style={{
                      width: col.width, minWidth: col.width, height: ROW_H, flexShrink: 0,
                      borderRight: ci < COLS.length - 1 ? '1px solid var(--border-soft)' : 'none',
                      display: 'flex', alignItems: 'stretch',
                    }}>
                      {col.key === 'status' ? (
                        <div style={{ display: 'flex', width: '100%' }} onClick={e => e.stopPropagation()}>
                          <StatusCell status={lead.status} onChange={s => changeStatus(lead, s)} />
                        </div>
                      ) : col.key === 'valor_pedido' ? (
                        <div style={{ display: 'flex', width: '100%' }} onClick={e => e.stopPropagation()}>
                          <ValorCell value={lead.valor_pedido} onSave={v => patchLead(lead.id, { valor_pedido: v })} />
                        </div>
                      ) : col.key === 'contato' ? (
                        <div style={{ width: '100%', padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: 12 }}>
                          {stale ? (
                            <span className="badge" style={{ background: 'var(--amber-soft)', color: 'var(--text-1)', padding: '0 8px', fontSize: 11 }}>Sem contato</span>
                          ) : (
                            <span style={{ color: lead.ultimo_contato ? 'var(--text-1)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{timeAgo(lead.ultimo_contato)}{lead.atendido_por ? <span style={{ color: 'var(--text-2)' }}> · {lead.atendido_por}</span> : null}</span>
                          )}
                        </div>
                      ) : col.key === 'motivo' ? (
                        <div style={{ width: '100%', padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: 12, color: lead.motivo_perda ? 'var(--text-1)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {lead.status === 'Perdido' ? (lead.motivo_perda ?? 'Informar motivo') : '—'}
                        </div>
                      ) : col.key === 'nome' ? (
                        <div style={{ width: '100%', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: lead.nome ? 'var(--text-1)' : 'var(--text-2)' }}>{lead.nome ?? '—'}</span>
                          {lead.notas && <span title={lead.notas} aria-label="Tem nota" style={{ display: 'inline-flex', color: 'var(--text-2)' }}><StickyNote size={12} strokeWidth={1.75} /></span>}
                        </div>
                      ) : col.key === 'telefone' ? (
                        <div style={{ width: '100%', minWidth: 0, height: '100%', padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                          {lead.telefone ? (
                            <a
                              href={waLink(lead.telefone)}
                              target="_blank" rel="noreferrer" title={`Abrir WhatsApp de ${lead.telefone}`}
                              onClick={e => e.stopPropagation()}
                              style={{ color: 'var(--green)', fontSize: 12, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {fmtPhone(lead.telefone)}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-2)', fontSize: 12 }}>—</span>
                          )}
                        </div>
                      ) : (
                        <div title={getCellText(lead, col.key) || undefined} style={{
                          width: '100%', minWidth: 0, height: '100%', padding: '0 8px',
                          display: 'flex', alignItems: 'center',
                          fontSize: 12, color: getCellText(lead, col.key) ? 'var(--text-1)' : 'var(--text-2)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {getCellText(lead, col.key) || '—'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
            {/* Rodapé */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px',
              borderTop: '1px solid var(--border-soft)', fontSize: 12, color: 'var(--text-2)',
              background: 'var(--bg-card2)', fontVariantNumeric: 'tabular-nums',
            }}>
              <span>{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
              {filterStatus !== 'Todos' && <span>· {filterStatus}</span>}
              {search && <span>· “{search}”</span>}
              {stats.convertido > 0 && (
                <span style={{ marginLeft: 'auto', color: 'var(--green)', fontWeight: 600 }}>
                  Receita convertidos: {fmtBRL(stats.revenue)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {newOpen && <NewLeadModal onClose={() => setNewOpen(false)} />}
      {drawerLead && (
        <LeadDrawer key={drawerLead.id} lead={drawerLead} focus={drawer?.focus ?? null} onClose={() => setDrawer(null)} onPatch={patchLead} />
      )}
    </div>
  )
}
