import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Edit3, Check, ChevronDown } from 'lucide-react'
import type { CampaignRow } from '@/lib/meta'

interface BudgetPacingCardProps {
  campaigns: CampaignRow[]
  currentSpend: number
  currency: string
  clientSlug?: string
}

function fmt(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}

function fmtDec(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

export function BudgetPacingCard({ campaigns, currentSpend, currency, clientSlug = 'default' }: BudgetPacingCardProps) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  const currentDay = now.getDate()
  const totalDays = new Date(year, month + 1, 0).getDate() // total days in month
  const daysRemaining = Math.max(0, totalDays - currentDay)
  const monthProgressPct = Math.round((currentDay / totalDays) * 100)

  // Default target budget: sum of active campaigns daily budgets * totalDays
  const activeDailyBudgetsSum = campaigns
    .filter(c => c.status === 'ACTIVE' && (c.daily_budget || 0) > 0)
    .reduce((acc, c) => acc + (c.daily_budget || 0), 0)
  const autoTarget = activeDailyBudgetsSum > 0 ? activeDailyBudgetsSum * totalDays : Math.max(1000, Math.round(currentSpend * 1.25))

  const storageKey = `budget_target:${clientSlug}`
  const [targetBudget, setTargetBudget] = useState<number>(autoTarget)
  const [isEditing, setIsEditing] = useState(false)
  const [editInput, setEditInput] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('budget_pacing_collapsed')
      if (saved !== null) {
        setIsCollapsed(saved === 'true')
      }
    } catch { }
  }, [])

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('budget_pacing_collapsed', String(next)) } catch { }
      return next
    })
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const n = parseFloat(saved)
        if (!isNaN(n) && n > 0) {
          setTargetBudget(n)
          return
        }
      }
    } catch { }
    if (autoTarget > 0) setTargetBudget(autoTarget)
  }, [storageKey, autoTarget])

  const handleSaveBudget = () => {
    const val = parseFloat(editInput.replace(/[^\d.,]/g, '').replace(',', '.'))
    if (!isNaN(val) && val > 0) {
      setTargetBudget(val)
      try {
        localStorage.setItem(storageKey, String(val))
      } catch { }
    }
    setIsEditing(false)
  }

  // Pacing calculations
  const spendPct = targetBudget > 0 ? (currentSpend / targetBudget) * 100 : 0
  const expectedSpendToDate = (currentDay / totalDays) * targetBudget
  const pacingRatio = expectedSpendToDate > 0 ? currentSpend / expectedSpendToDate : 1

  // Status
  let statusColor = 'var(--green)'
  let statusBg = 'var(--green-soft)'
  let statusText = 'No Ritmo Ideal'
  let statusDesc = 'Gasto alinhado com o cronograma do mês.'
  let StatusIcon = CheckCircle2

  if (pacingRatio > 1.12) {
    statusColor = 'var(--red)'
    statusBg = 'var(--red-soft)'
    statusText = 'Ritmo Acelerado'
    statusDesc = `Gasto ${Math.round((pacingRatio - 1) * 100)}% acima do planejado até o dia de hoje.`
    StatusIcon = ArrowUpRight
  } else if (pacingRatio < 0.88) {
    statusColor = 'var(--accent)'
    statusBg = 'var(--accent-soft)'
    statusText = 'Ritmo Lento / Sobrando'
    statusDesc = `Gasto ${Math.round((1 - pacingRatio) * 100)}% abaixo do planejado. Verba pode sobrar.`
    StatusIcon = ArrowDownRight
  }

  // Forecast
  const projectedMonthEnd = currentDay > 0 ? (currentSpend / currentDay) * totalDays : currentSpend
  const remainingBudget = Math.max(0, targetBudget - currentSpend)
  const recommendedDaily = daysRemaining > 0 ? remainingBudget / daysRemaining : 0

  return (
    <div
      className="card"
      style={{
        padding: isCollapsed ? '14px 18px' : '18px 20px',
        marginBottom: 20,
        boxShadow: 'var(--shadow-soft)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        transition: 'padding 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* Header (clickable to collapse/expand) */}
      <div
        onClick={toggleCollapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          cursor: 'pointer',
          userSelect: 'none',
          marginBottom: isCollapsed ? 0 : 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TrendingUp size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Controle de Ritmo de Verba (Budget Pacing)</span>
              {isCollapsed && (
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
                  · {fmt(currentSpend, currency)} de {fmt(targetBudget, currency)} ({spendPct.toFixed(0)}%)
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Dia {currentDay} de {totalDays} ({daysRemaining} dias restantes no mês) · Progresso: {monthProgressPct}%
            </div>
          </div>
        </div>

        {/* Right side: Pacing Badge + Chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 20,
              background: statusBg,
              color: statusColor,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <StatusIcon size={14} />
            <span>{statusText}</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              color: 'var(--text-2)',
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.2s ease',
            }}
            title={isCollapsed ? 'Expandir Ritmo de Verba' : 'Recolher Ritmo de Verba'}
            aria-expanded={!isCollapsed}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Progress Bar with markers */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
              <span>Investido: {fmt(currentSpend, currency)} ({spendPct.toFixed(1)}%)</span>
              <span>Meta: {fmt(targetBudget, currency)}</span>
            </div>
            <div
              style={{
                position: 'relative',
                height: 12,
                borderRadius: 6,
                background: 'var(--bg-card2)',
                overflow: 'visible',
              }}
            >
              {/* Real spend fill */}
              <div
                style={{
                  height: '100%',
                  borderRadius: 6,
                  background: statusColor,
                  width: `${Math.min(100, spendPct)}%`,
                  transition: 'width 0.4s ease-out',
                }}
              />
              {/* Expected milestone marker */}
              <div
                style={{
                  position: 'absolute',
                  top: -3,
                  bottom: -3,
                  left: `${Math.min(99, monthProgressPct)}%`,
                  width: 3,
                  background: 'var(--text-1)',
                  borderRadius: 2,
                  zIndex: 2,
                }}
                title={`Ritmo esperado para hoje: ${monthProgressPct}% (${fmt(expectedSpendToDate, currency)})`}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
              <span>0%</span>
              <span style={{ color: 'var(--text-2)' }}>▲ Marcador: Ritmo esperado ({monthProgressPct}%)</span>
              <span>100%</span>
            </div>
          </div>

          {/* 4 Metric Columns */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border-soft)',
            }}
          >
            {/* Meta Mensal */}
            <div style={{ background: 'var(--bg-card2)', padding: '10px 14px', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.05em' }}>
                  Orçamento do Mês
                </span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditInput(String(targetBudget))
                      setIsEditing(true)
                    }}
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Ajustar meta de verba"
                    style={{ padding: 2, width: 20, height: 20 }}
                  >
                    <Edit3 size={12} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={editInput}
                    onChange={e => setEditInput(e.target.value)}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveBudget()}
                    style={{
                      width: '100%',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--accent)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text-1)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveBudget}
                    className="btn btn-soft btn-sm"
                    style={{ padding: '2px 8px' }}
                  >
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(targetBudget, currency)}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                {activeDailyBudgetsSum > 0 ? `Soma ativa: ${fmt(activeDailyBudgetsSum, currency)}/dia` : 'Meta configurada'}
              </div>
            </div>

            {/* Investido até hoje */}
            <div style={{ background: 'var(--bg-card2)', padding: '10px 14px', borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.05em', marginBottom: 4 }}>
                Investido até Hoje
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(currentSpend, currency)}
              </div>
              <div style={{ fontSize: 10, color: statusColor, marginTop: 2, fontWeight: 600 }}>
                {statusDesc}
              </div>
            </div>

            {/* Projeção de Fechamento */}
            <div style={{ background: 'var(--bg-card2)', padding: '10px 14px', borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.05em', marginBottom: 4 }}>
                Projeção no Fechamento
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(projectedMonthEnd, currency)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                {projectedMonthEnd > targetBudget
                  ? `Estouro previsto de ${fmt(projectedMonthEnd - targetBudget, currency)}`
                  : `Sobra prevista de ${fmt(targetBudget - projectedMonthEnd, currency)}`}
              </div>
            </div>

            {/* Sugestão Diária Restante */}
            <div style={{ background: 'var(--bg-card2)', padding: '10px 14px', borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.05em', marginBottom: 4 }}>
                Ritmo Recomendado
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtDec(recommendedDaily, currency)}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}> /dia</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                {daysRemaining > 0 ? `Para os próximos ${daysRemaining} dias restantes` : 'Último dia do mês'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

