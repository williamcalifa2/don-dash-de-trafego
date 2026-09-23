'use client'

import { useState, useMemo, memo } from 'react'
import type { Lead, LeadStatus } from '@/lib/leadTypes'
import { STATUS_META } from './LeadsTab'
import { isStale, timeAgo, waLink, fmtPhone } from '@/lib/leadUtils'
import { MessageSquare, DollarSign, Clock, AlertTriangle, ArrowRight, ArrowLeft, StickyNote } from 'lucide-react'

const KANBAN_COLUMNS: LeadStatus[] = ['Novo', 'Em andamento', 'Convertido', 'Perdido']

function fmtBRL(v: number | null | undefined) {
  if (!v && v !== 0) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

interface LeadsKanbanProps {
  leads: Lead[]
  onSelectLead: (lead: Lead) => void
  onChangeStatus: (lead: Lead, status: LeadStatus) => void
  readOnly?: boolean
}

export const LeadsKanban = memo(function LeadsKanban({ leads, onSelectLead, onChangeStatus, readOnly = false }: LeadsKanbanProps) {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<LeadStatus | null>(null)

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    if (readOnly) return
    e.dataTransfer.setData('text/plain', leadId)
    setDraggedLeadId(leadId)
  }

  const handleDragOver = (e: React.DragEvent, status: LeadStatus) => {
    if (readOnly) return
    e.preventDefault()
    if (dragOverCol !== status) {
      setDragOverCol(status)
    }
  }

  const handleDragLeave = () => {
    setDragOverCol(null)
  }

  const handleDrop = (e: React.DragEvent, targetStatus: LeadStatus) => {
    if (readOnly) return
    e.preventDefault()
    setDragOverCol(null)
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId
    if (!leadId) return
    const lead = leads.find(l => l.id === leadId)
    if (lead && lead.status !== targetStatus) {
      onChangeStatus(lead, targetStatus)
    }
    setDraggedLeadId(null)
  }

  const getNextStatus = (current: LeadStatus): LeadStatus | null => {
    const idx = KANBAN_COLUMNS.indexOf(current)
    if (idx === -1 || idx === KANBAN_COLUMNS.length - 1) return null
    return KANBAN_COLUMNS[idx + 1]
  }

  const getPrevStatus = (current: LeadStatus): LeadStatus | null => {
    const idx = KANBAN_COLUMNS.indexOf(current)
    if (idx <= 0) return null
    return KANBAN_COLUMNS[idx - 1]
  }

  const leadsByCol = useMemo(() => {
    const map: Record<LeadStatus, { leads: Lead[]; totalValue: number }> = {
      'Novo': { leads: [], totalValue: 0 },
      'Em andamento': { leads: [], totalValue: 0 },
      'Convertido': { leads: [], totalValue: 0 },
      'Perdido': { leads: [], totalValue: 0 },
    }
    for (let i = 0; i < leads.length; i++) {
      const l = leads[i]
      if (map[l.status]) {
        map[l.status].leads.push(l)
        map[l.status].totalValue += (l.valor_pedido || 0)
      }
    }
    return map
  }, [leads])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(285px, 1fr))',
        gap: 14,
        alignItems: 'start',
        overflowX: 'auto',
        paddingBottom: 24,
      }}
    >
      {KANBAN_COLUMNS.map(colStatus => {
        const colMeta = STATUS_META[colStatus]
        const colLeads = leadsByCol[colStatus]?.leads ?? []
        const colValue = leadsByCol[colStatus]?.totalValue ?? 0
        const isTarget = dragOverCol === colStatus

        return (
          <div
            key={colStatus}
            onDragOver={e => handleDragOver(e, colStatus)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, colStatus)}
            style={{
              background: isTarget ? 'var(--accent-soft)' : 'var(--bg-card2)',
              border: isTarget ? '2px dashed var(--accent)' : '1px solid var(--border-soft)',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 460,
              maxHeight: 'calc(100vh - 240px)',
              transition: 'background 0.15s, border-color 0.15s',
              overflow: 'hidden',
            }}
          >
            {/* Column Header */}
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--border-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: colMeta.dot,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  {colStatus}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 8,
                    background: colMeta.bg,
                    color: colMeta.dot,
                  }}
                >
                  {colLeads.length}
                </span>
              </div>

              {colValue > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtBRL(colValue)}
                </div>
              )}
            </div>

            {/* Column Body / Cards List */}
            <div
              style={{
                padding: '10px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                overflowY: 'auto',
                flex: 1,
              }}
            >
              {colLeads.length === 0 ? (
                <div
                  style={{
                    padding: '28px 14px',
                    textAlign: 'center',
                    color: 'var(--text-3)',
                    fontSize: 11,
                    border: '1px dashed var(--border-soft)',
                    borderRadius: 8,
                    marginTop: 6,
                  }}
                >
                  Nenhum lead nesta etapa
                </div>
              ) : (
                colLeads.map(lead => {
                  const stale = isStale(lead)
                  const wa = lead.telefone ? waLink(lead.telefone) : null
                  const next = getNextStatus(lead.status)
                  const prev = getPrevStatus(lead.status)

                  return (
                    <div
                      key={lead.id}
                      draggable={!readOnly}
                      onDragStart={e => handleDragStart(e, lead.id)}
                      onClick={() => onSelectLead(lead)}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s',
                        userSelect: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      {/* Top: Name & Time / WhatsApp */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.nome || 'Lead sem nome'}
                          </span>
                          {stale && (
                            <span
                              title="Sem contato há mais de 2 horas"
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: 'var(--amber)',
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Chamar no WhatsApp"
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                background: 'rgba(34, 197, 94, 0.12)',
                                color: '#16a34a',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textDecoration: 'none',
                              }}
                            >
                              <MessageSquare size={11} />
                            </a>
                          )}
                          <span style={{ fontSize: 10, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                            {timeAgo(lead.date || lead.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Phone only (clean, no wrapping) */}
                      <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, minHeight: 18 }}>
                        <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {lead.telefone ? fmtPhone(lead.telefone) : (lead.email || 'Sem contato')}
                        </span>
                      </div>

                      {/* Bottom line: Value, Note & Quick column move */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 4,
                          borderTop: '1px solid var(--border-soft)',
                          marginTop: 2,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {lead.valor_pedido != null && lead.valor_pedido > 0 ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: lead.status === 'Convertido' ? 'var(--green)' : 'var(--text-1)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {fmtBRL(lead.valor_pedido)}
                            </span>
                          ) : null}
                          {lead.notas ? (
                            <span title={lead.notas} style={{ color: 'var(--text-3)', display: 'inline-flex' }}>
                              <StickyNote size={11} />
                            </span>
                          ) : null}
                        </div>

                        {/* Subtle move controls */}
                        {!readOnly && (
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={e => e.stopPropagation()}
                          >
                            {prev && (
                              <button
                                type="button"
                                onClick={() => onChangeStatus(lead, prev)}
                                title={`Mover para ${prev}`}
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ width: 18, height: 18, padding: 0, color: 'var(--text-3)' }}
                              >
                                <ArrowLeft size={11} />
                              </button>
                            )}
                            {next && (
                              <button
                                type="button"
                                onClick={() => onChangeStatus(lead, next)}
                                title={`Avançar para ${next}`}
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ width: 18, height: 18, padding: 0, color: 'var(--accent)' }}
                              >
                                <ArrowRight size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})
