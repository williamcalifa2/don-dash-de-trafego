'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, TrendingUp, DollarSign, Users, MousePointer, Eye, MessageSquare } from 'lucide-react'
import type { DailySummary } from '@/lib/meta'
import type { ResultKind } from '@/lib/resultKind'
import { KIND_LABELS } from '@/lib/resultKind'
import type { Lead } from '@/lib/leadTypes'
import { fmtPhone, waLink } from '@/lib/leadUtils'

interface CalendarViewModalProps {
  onClose: () => void
  daily?: DailySummary
  currency: string
  kind?: ResultKind
  leads?: Lead[]
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

function fmtCurrency(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

function fmtDec(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

export function CalendarViewModal({ onClose, daily, currency, kind = 'form', leads = [] }: CalendarViewModalProps) {
  const L = KIND_LABELS[kind]
  const today = new Date()
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null)

  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()

  // First day of current month
  const firstDay = new Date(currentYear, currentMonth, 1)
  const startingDayOfWeek = firstDay.getDay()
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

  // Build daily data lookup map: 'YYYY-MM-DD' -> metrics
  const dailyMap = new Map<string, { spend: number; leads: number; cpl: number | null; impressions: number; ctr: number }>()

  if (daily && daily.dates) {
    daily.dates.forEach((d, idx) => {
      // Normalize 'YYYY-MM-DD'
      const key = d.slice(0, 10)
      const resVal = kind === 'form' || !daily.metrics?.results ? (daily.leads?.[idx] ?? 0) : (daily.metrics.results[idx] ?? 0)
      dailyMap.set(key, {
        spend: daily.spend?.[idx] ?? 0,
        leads: resVal,
        cpl: daily.cpl?.[idx] ?? null,
        impressions: daily.impressions?.[idx] ?? 0,
        ctr: daily.ctr?.[idx] ?? 0,
      })
    })
  }

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDateStr(today.toISOString().slice(0, 10))
  }

  // Generate cells
  const cells: Array<{ day: number; dateStr: string; isCurrentMonth: boolean; isToday: boolean }> = []

  // Prev month padding
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const d = new Date(currentYear, currentMonth - 1, day)
    cells.push({
      day,
      dateStr: d.toISOString().slice(0, 10),
      isCurrentMonth: false,
      isToday: false,
    })
  }

  // Current month
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const d = new Date(currentYear, currentMonth, day)
    const isToday =
      today.getFullYear() === currentYear &&
      today.getMonth() === currentMonth &&
      today.getDate() === day

    cells.push({
      day,
      dateStr: d.toISOString().slice(0, 10),
      isCurrentMonth: true,
      isToday,
    })
  }

  // Next month padding
  const totalCells = Math.ceil(cells.length / 7) * 7
  const nextDays = totalCells - cells.length
  for (let day = 1; day <= nextDays; day++) {
    const d = new Date(currentYear, currentMonth + 1, day)
    cells.push({
      day,
      dateStr: d.toISOString().slice(0, 10),
      isCurrentMonth: false,
      isToday: false,
    })
  }

  // Selected Day Details
  const selectedMetrics = selectedDateStr ? dailyMap.get(selectedDateStr) : null
  const selectedLeads = selectedDateStr ? leads.filter(l => (l.date || l.created_at).startsWith(selectedDateStr)) : []

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{
          width: '100%',
          maxWidth: 960,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          borderRadius: 20,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-elegant)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CalendarIcon size={20} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
                Calendário de Performance
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Resultados diários e eventos de conversão no estilo Google Calendar
              </div>
            </div>
          </div>

          {/* Month Controls & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={goToToday}
              className="btn btn-ghost btn-sm"
              style={{ border: '1px solid var(--border-soft)', fontSize: 12 }}
            >
              Hoje
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-soft)' }}>
              <button
                type="button"
                onClick={prevMonth}
                className="btn btn-ghost btn-icon btn-sm"
                title="Mês anterior"
                style={{ padding: '4px 8px' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 140, textAlign: 'center', color: 'var(--text-1)' }}>
                {MONTH_NAMES[currentMonth]} {currentYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="btn btn-ghost btn-icon btn-sm"
                title="Próximo mês"
                style={{ padding: '4px 8px' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-icon btn-sm"
              title="Fechar"
              style={{ marginLeft: 6 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Main Grid */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 16 }}>
            {/* Weekdays Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {WEEKDAYS.map((wd, i) => (
                <div
                  key={wd}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: i === 0 || i === 6 ? 'var(--text-3)' : 'var(--text-2)',
                    letterSpacing: '.06em',
                  }}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 6,
                flex: 1,
              }}
            >
              {cells.map(cell => {
                const data = dailyMap.get(cell.dateStr)
                const isSelected = selectedDateStr === cell.dateStr
                const hasResults = data && (data.leads > 0 || data.spend > 0)

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    style={{
                      minHeight: 82,
                      padding: 6,
                      borderRadius: 10,
                      background: isSelected
                        ? 'var(--accent-soft)'
                        : cell.isCurrentMonth
                          ? 'var(--bg-card2)'
                          : 'transparent',
                      border: isSelected
                        ? '2px solid var(--accent)'
                        : cell.isToday
                          ? '2px solid var(--green)'
                          : '1px solid var(--border-soft)',
                      opacity: cell.isCurrentMonth ? 1 : 0.45,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.1s, box-shadow 0.1s, background 0.1s',
                      position: 'relative',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-card)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = cell.isCurrentMonth ? 'var(--bg-card2)' : 'transparent'
                    }}
                  >
                    {/* Day Number Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: cell.isToday || isSelected ? 800 : 600,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: cell.isToday ? 'var(--green)' : 'transparent',
                          color: cell.isToday ? '#fff' : 'var(--text-1)',
                        }}
                      >
                        {cell.day}
                      </span>

                      {data && data.spend > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)' }}>
                          {fmtCurrency(data.spend, currency)}
                        </span>
                      )}
                    </div>

                    {/* Google Meet / Calendar style Event Pills */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                      {data && data.leads > 0 && (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 5px',
                            borderRadius: 4,
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: '#16a34a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title={`${data.leads} ${L.many}`}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                          {data.leads} {L.many}
                        </div>
                      )}

                      {data && data.cpl != null && data.cpl > 0 && (
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: '#2563eb',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`Custo médio: ${fmtDec(data.cpl, currency)}`}
                        >
                          {L.cost}: {fmtCurrency(data.cpl, currency)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected Day Inspector Side Panel */}
          {selectedDateStr && (
            <div
              style={{
                width: 320,
                borderLeft: '1px solid var(--border-soft)',
                background: 'var(--bg-card2)',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '.06em' }}>
                    Detalhes do Dia
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                    {new Date(selectedDateStr + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDateStr(null)}
                  className="btn btn-ghost btn-icon btn-sm"
                  style={{ width: 22, height: 22 }}
                >
                  <X size={14} />
                </button>
              </div>

              {selectedMetrics ? (
                <>
                  {/* Key Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>Investido</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCurrency(selectedMetrics.spend, currency)}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{L.many}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                        {selectedMetrics.leads}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{L.cost}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                        {selectedMetrics.cpl ? fmtDec(selectedMetrics.cpl, currency) : '—'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '10px 12px', borderRadius: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>CTR do Dia</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                        {selectedMetrics.ctr.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Secondary row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 10, fontSize: 11, color: 'var(--text-2)' }}>
                    <span>👁 {selectedMetrics.impressions.toLocaleString('pt-BR')} impressões</span>
                    <span>🎯 {selectedMetrics.leads > 0 ? `${((selectedMetrics.leads / (selectedMetrics.impressions || 1)) * 100).toFixed(2)}% conv.` : '0% conv.'}</span>
                  </div>
                </>
              ) : (
                <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--bg-card)', borderRadius: 10 }}>
                  Sem métricas sincronizadas da Meta para esta data.
                </div>
              )}

              {/* Leads registered on this day */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.05em' }}>
                  Leads Entrados ({selectedLeads.length})
                </div>

                {selectedLeads.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                    Nenhum lead individual registrado nesta data.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedLeads.map(l => {
                      const wa = l.telefone ? waLink(l.telefone) : null
                      return (
                        <div
                          key={l.id}
                          style={{
                            background: 'var(--bg-card)',
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border-soft)',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                            {l.nome || 'Lead sem nome'}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                            <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                              {l.telefone ? fmtPhone(l.telefone) : l.email || '—'}
                            </span>
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textDecoration: 'none' }}
                              >
                                WhatsApp ↗
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
