'use client'

import { useState } from 'react'
import type { Lead, LeadStatus } from '@/lib/leadTypes'
import { STATUS_META } from './LeadsTab'
import { isStale, timeAgo, waLink, fmtPhone } from '@/lib/leadUtils'
import { MessageSquare, DollarSign, Clock, AlertTriangle, ArrowRight, ArrowLeft, ChevronRight } from 'lucide-react'

const KANBAN_COLUMNS: LeadStatus[] = ['Novo', 'Em andamento', 'Convertido', 'Perdido']

function fmtBRL(v: number | null | undefined) {
  if (!v && v !== 0) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface LeadsKanbanProps {
  leads: Lead[]
  onSelectLead: (lead: Lead) => void
  onChangeStatus: (lead: Lead, status: LeadStatus) => void
  readOnly?: boolean
}

export function LeadsKanban({ leads, onSelectLead, onChangeStatus, readOnly = false }: LeadsKanbanProps) {
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

  // Quick move to next/prev column
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(280px, 1fr))',
        gap: 14,
        alignItems: 'start',
        overflowX: 'auto',
        paddingBottom: 24,
      }}
    >
      {KANBAN_COLUMNS.map(colStatus => {
        const colMeta = STATUS_META[colStatus]
        const colLeads = leads.filter(l => l.status === colStatus)
        const colValue = colLeads.reduce((acc, l) => acc + (l.valor_pedido || 0), 0)
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
              minHeight: 480,
              maxHeight: 'calc(100vh - 240px)',
              transition: 'background 0.2s, border-color 0.2s',
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
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: colMeta.dot,
                    boxShadow: `0 0 8px ${colMeta.dot}66`,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  {colStatus}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 7px',
                    borderRadius: 10,
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
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                overflowY: 'auto',
                flex: 1,
              }}
            >
              {colLeads.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: 'var(--text-3)',
                    fontSize: 12,
                    border: '1px dashed var(--border-soft)',
                    borderRadius: 10,
                    marginTop: 8,
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
                        border: stale ? '1px solid var(--amber)' : '1px solid var(--border-soft)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                        userSelect: 'none',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,0.08)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)'
                      }}
                    >
                      {/* Top: Name & Time */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>
                          {lead.nome || 'Lead sem nome'}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-3)',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <Clock size={10} />
                          {timeAgo(lead.date || lead.created_at)}
                        </div>
                      </div>

                      {/* Stale Alert */}
                      {stale && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--amber)',
                            background: 'var(--amber-soft)',
                            padding: '2px 6px',
                            borderRadius: 6,
                            marginBottom: 8,
                          }}
                        >
                          <AlertTriangle size={11} />
                          Parado há +2h
                        </div>
                      )}

                      {/* Phone & Direct WhatsApp Action */}
                      {lead.telefone && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                            padding: '4px 8px',
                            borderRadius: 6,
                            background: 'var(--bg-card2)',
                          }}
                        >
                          <span style={{ fontSize: 11, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtPhone(lead.telefone)}
                          </span>
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Abrir WhatsApp direto"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#16a34a',
                                textDecoration: 'none',
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'rgba(34, 197, 94, 0.12)',
                              }}
                            >
                              <MessageSquare size={11} />
                              Chamar
                            </a>
                          )}
                        </div>
                      )}

                      {/* Campaign / Ad Source */}
                      {(lead.campanha || lead.ad_name) && (
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-3)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginBottom: 6,
                          }}
                          title={`${lead.campanha || ''} / ${lead.ad_name || ''}`}
                        >
                          📣 {lead.campanha || lead.ad_name}
                        </div>
                      )}

                      {/* Value / Revenue Badge */}
                      {lead.valor_pedido != null && lead.valor_pedido > 0 && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            color: lead.status === 'Convertido' ? 'var(--green)' : 'var(--text-1)',
                            background: lead.status === 'Convertido' ? 'var(--green-soft)' : 'var(--bg-card2)',
                            padding: '2px 8px',
                            borderRadius: 6,
                            marginBottom: 8,
                          }}
                        >
                          <DollarSign size={11} />
                          {fmtBRL(lead.valor_pedido)}
                        </div>
                      )}

                      {/* Notes snippet */}
                      {lead.notas && (
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-2)',
                            fontStyle: 'italic',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            borderLeft: '2px solid var(--border-soft)',
                            paddingLeft: 6,
                            marginBottom: 8,
                          }}
                        >
                          &ldquo;{lead.notas}&rdquo;
                        </div>
                      )}

                      {/* Card Footer: Quick Move Controls */}
                      {!readOnly && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 6,
                            marginTop: 4,
                            paddingTop: 6,
                            borderTop: '1px solid var(--border-soft)',
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          {prev && (
                            <button
                              type="button"
                              onClick={() => onChangeStatus(lead, prev)}
                              title={`Voltar para ${prev}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                                background: 'transparent',
                                border: '1px solid var(--border-soft)',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                                color: 'var(--text-3)',
                                cursor: 'pointer',
                              }}
                            >
                              <ArrowLeft size={10} />
                              {prev}
                            </button>
                          )}
                          {next && (
                            <button
                              type="button"
                              onClick={() => onChangeStatus(lead, next)}
                              title={`Avançar para ${next}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                                background: 'var(--accent-soft)',
                                border: '1px solid var(--accent)',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'var(--accent)',
                                cursor: 'pointer',
                              }}
                            >
                              {next}
                              <ArrowRight size={10} />
                            </button>
                          )}
                        </div>
                      )}
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
}
