'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon } from 'lucide-react'
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
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(today.toISOString().slice(0, 10))
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)

  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()

  // Build daily data lookup map: 'YYYY-MM-DD' -> metrics
  const dailyMap = new Map<string, { spend: number; leads: number; cpl: number | null; impressions: number; ctr: number }>()
  const availableMonths = new Set<string>()

  if (daily && daily.dates) {
    daily.dates.forEach((d, idx) => {
      const key = d.slice(0, 10)
      if (key.length >= 7) availableMonths.add(key.slice(0, 7))
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

  // Contagem direta por data a partir da lista de leads
  const leadsCountByDate = new Map<string, number>()
  if (leads && leads.length > 0) {
    leads.forEach(l => {
      const d = (l.date || l.created_at || '').slice(0, 10)
      if (d) {
        leadsCountByDate.set(d, (leadsCountByDate.get(d) ?? 0) + 1)
        if (d.length >= 7) availableMonths.add(d.slice(0, 7))
      }
    })
  }

  // Also ensure current month is always discoverable
  availableMonths.add(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)

  // First day of current month
  const firstDay = new Date(currentYear, currentMonth, 1)
  const startingDayOfWeek = firstDay.getDay()
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDateStr(today.toISOString().slice(0, 10))
    setMonthPickerOpen(false)
  }

  const selectMonth = (monthIdx: number) => {
    setCurrentDate(new Date(currentYear, monthIdx, 1))
    setMonthPickerOpen(false)
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
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
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
          maxWidth: 1040,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          borderRadius: 20,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-elegant)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card2)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--accent-glow)',
              }}
            >
              <CalendarIcon size={20} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Calendário de Performance</span>
                <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10 }}>
                  Meta Ads
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Leads, conversas e investimento detalhados por dia
              </div>
            </div>
          </div>

          {/* Month Controls & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={goToToday}
              className="btn btn-ghost btn-sm"
              style={{ border: '1px solid var(--border-soft)', fontSize: 12, height: 32 }}
            >
              Hoje
            </button>

            {/* Month Dropdown / Selector trigger */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-soft)' }}>
              <button
                type="button"
                onClick={prevMonth}
                className="btn btn-ghost btn-icon btn-sm"
                title="Mês anterior"
                style={{ width: 30, height: 32 }}
              >
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                onClick={() => setMonthPickerOpen(v => !v)}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  minWidth: 150,
                  textAlign: 'center',
                  color: 'var(--text-1)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
                title="Clique para escolher o mês"
              >
                <span>{MONTH_NAMES[currentMonth]} {currentYear}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>▼</span>
              </button>

              <button
                type="button"
                onClick={nextMonth}
                className="btn btn-ghost btn-icon btn-sm"
                title="Próximo mês"
                style={{ width: 30, height: 32 }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-icon btn-sm"
              title="Fechar"
              style={{ width: 32, height: 32 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Month Selector Grid Modal / Dropdown */}
        {monthPickerOpen && (
          <div
            style={{
              position: 'absolute',
              top: 70,
              left: 0,
              right: 0,
              zIndex: 50,
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'var(--shadow-elegant)',
              padding: 20,
              animation: 'fade-up 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                Selecione o Mês ({currentYear})
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Clique em qualquer mês para visualizar o histórico
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {MONTH_NAMES.map((name, idx) => {
                const monthKey = `${currentYear}-${String(idx + 1).padStart(2, '0')}`
                const hasData = availableMonths.has(monthKey)
                const isSelected = idx === currentMonth

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectMonth(idx)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: isSelected
                        ? '2px solid var(--accent)'
                        : hasData
                          ? '1px solid var(--border-soft)'
                          : '1px solid var(--border-soft)',
                      background: isSelected
                        ? 'var(--accent-soft)'
                        : hasData
                          ? 'var(--bg-card2)'
                          : 'transparent',
                      color: isSelected
                        ? 'var(--accent)'
                        : hasData
                          ? 'var(--text-1)'
                          : 'var(--text-2)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: isSelected ? 800 : hasData ? 600 : 400,
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ fontSize: 10, color: hasData ? 'var(--green)' : 'var(--text-3)' }}>
                      {isSelected ? '● Selecionado' : hasData ? '● Com dados' : '○ Visualizar'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Calendar Grid Container */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }}>
          {/* Main Grid */}
          <div style={{ flex: '1 1 540px', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 18, minWidth: 320 }}>
            {/* Weekdays Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              {WEEKDAYS.map((wd, i) => (
                <div
                  key={wd}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: i === 0 || i === 6 ? 'var(--text-3)' : 'var(--text-2)',
                    letterSpacing: '.08em',
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
                gap: 8,
                flex: 1,
              }}
            >
              {cells.map(cell => {
                const data = dailyMap.get(cell.dateStr)
                const fromLeads = leadsCountByDate.get(cell.dateStr) ?? 0
                const dayCount = Math.max(data?.leads ?? 0, fromLeads)
                const isSelected = selectedDateStr === cell.dateStr

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    style={{
                      minHeight: 88,
                      padding: '8px 8px',
                      borderRadius: 12,
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
                      opacity: cell.isCurrentMonth ? 1 : 0.35,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--accent-glow)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = cell.isToday ? 'var(--green)' : 'var(--border-soft)'
                    }}
                  >
                    {/* Day Number Header & Spend */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: cell.isToday || isSelected ? 800 : 600,
                          color: cell.isToday ? 'var(--green)' : isSelected ? 'var(--accent)' : 'var(--text-1)',
                          lineHeight: 1,
                        }}
                      >
                        {cell.day}
                        {cell.isToday && <span style={{ fontSize: 9, marginLeft: 4, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase' }}>Hoje</span>}
                      </span>

                      {data && data.spend > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)' }}>
                          {fmtCurrency(data.spend, currency)}
                        </span>
                      )}
                    </div>

                    {/* Central Highlight: ONLY the quantity circle when dayCount > 0 */}
                    {dayCount > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 26,
                            height: 26,
                            padding: '0 8px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                            background: 'rgba(34, 197, 94, 0.18)',
                            color: '#16a34a',
                            border: '1px solid rgba(34, 197, 94, 0.35)',
                          }}
                          title={`${dayCount} leads`}
                        >
                          {dayCount}
                        </span>
                      </div>
                    ) : (
                      <div style={{ flex: 1 }} />
                    )}

                    {/* Secondary: CPL if present and has leads */}
                    <div>
                      {dayCount > 0 && data && data.cpl != null && data.cpl > 0 && (
                        <div
                          style={{
                            fontSize: 9.5,
                            fontWeight: 600,
                            padding: '2px 5px',
                            borderRadius: 6,
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`CPL: ${fmtCurrency(data.cpl, currency)}`}
                        >
                          CPL {fmtCurrency(data.cpl, currency)}
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
                flex: '1 1 300px',
                maxWidth: 340,
                borderLeft: '1px solid var(--border-soft)',
                background: 'var(--bg-card2)',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                overflowY: 'auto',
                minWidth: 280,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '.06em' }}>
                    Métricas do Dia
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                    {new Date(selectedDateStr + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDateStr(null)}
                  className="btn btn-ghost btn-icon btn-sm"
                  style={{ width: 26, height: 26 }}
                >
                  <X size={15} />
                </button>
              </div>

              {selectedMetrics ? (
                <>
                  {/* Key Metrics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Investimento</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                        {fmtCurrency(selectedMetrics.spend, currency)}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{L.many === 'Resultados' ? 'Leads' : L.many}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                        {selectedMetrics.leads}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{L.cost.includes('Resultado') ? 'CPL' : L.cost}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                        {selectedMetrics.cpl ? fmtDec(selectedMetrics.cpl, currency) : '—'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>CTR do Dia</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                        {selectedMetrics.ctr.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Secondary row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-soft)', fontSize: 11, color: 'var(--text-2)' }}>
                    <span>{selectedMetrics.impressions.toLocaleString('pt-BR')} impressões</span>
                    <span>Taxa: {selectedMetrics.leads > 0 ? `${((selectedMetrics.leads / (selectedMetrics.impressions || 1)) * 100).toFixed(2)}% taxa` : '0%'}</span>
                  </div>
                </>
              ) : (
                <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--bg-card)', borderRadius: 12, border: '1px dashed var(--border-soft)' }}>
                  Sem métricas sincronizadas da Meta para esta data.
                </div>
              )}

              {/* Leads registered on this day */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '.05em' }}>
                  Leads do Dia ({selectedLeads.length})
                </div>

                {selectedLeads.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', padding: 8 }}>
                    Nenhum lead individual captado nesta data.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedLeads.map(l => {
                      const wa = l.telefone ? waLink(l.telefone) : null
                      return (
                        <div
                          key={l.id}
                          style={{
                            background: 'var(--bg-card)',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid var(--border-soft)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                            {l.nome || 'Lead sem nome'}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                              {l.telefone ? fmtPhone(l.telefone) : l.email || '—'}
                            </span>
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#16a34a',
                                  textDecoration: 'none',
                                  background: 'rgba(34, 197, 94, 0.12)',
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                }}
                              >
                                WhatsApp
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
