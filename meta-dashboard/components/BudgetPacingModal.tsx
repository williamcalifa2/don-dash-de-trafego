'use client'

import { useState, useEffect } from 'react'
import { DollarSign, CheckCircle2, ArrowUpRight, ArrowDownRight, Edit3, Check, X } from 'lucide-react'
import type { CampaignRow } from '@/lib/meta'

interface BudgetPacingModalProps {
  onClose: () => void
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

export function BudgetPacingModal({ onClose, campaigns, currentSpend, currency, clientSlug = 'default' }: BudgetPacingModalProps) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const currentDay = now.getDate()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const daysRemaining = Math.max(0, totalDays - currentDay)
  const monthProgressPct = Math.round((currentDay / totalDays) * 100)

  // Default target budget: sum of active campaigns daily budgets * totalDays
  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE')
  const activeDailyBudgetsSum = activeCampaigns
    .filter(c => (c.daily_budget || 0) > 0)
    .reduce((acc, c) => acc + (c.daily_budget || 0), 0)
  const autoTarget = activeDailyBudgetsSum > 0 ? activeDailyBudgetsSum * totalDays : Math.max(1000, Math.round(currentSpend * 1.25))

  const storageKey = `budget_target:${clientSlug}`
  const [targetBudget, setTargetBudget] = useState<number>(autoTarget)
  const [isEditing, setIsEditing] = useState(false)
  const [editInput, setEditInput] = useState('')

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
  const paceDiffPct = Math.round((pacingRatio - 1) * 100)

  // Status
  let statusColor = '#22C55E'
  let statusBg = 'rgba(34, 197, 94, 0.14)'
  let statusText = 'Ritmo Ideal'
  let StatusIcon = CheckCircle2

  if (pacingRatio > 1.12) {
    statusColor = '#EF4444'
    statusBg = 'rgba(239, 68, 68, 0.14)'
    statusText = `Acelerado (+${paceDiffPct}%)`
    StatusIcon = ArrowUpRight
  } else if (pacingRatio < 0.88) {
    statusColor = 'var(--accent)'
    statusBg = 'var(--accent-soft)'
    statusText = `Lento (${paceDiffPct}%)`
    StatusIcon = ArrowDownRight
  }

  // Forecast
  const currentDailyAvg = currentDay > 0 ? currentSpend / currentDay : 0
  const projectedMonthEnd = currentDay > 0 ? currentDailyAvg * totalDays : currentSpend
  const remainingBudget = Math.max(0, targetBudget - currentSpend)
  const recommendedDaily = daysRemaining > 0 ? remainingBudget / daysRemaining : 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
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
          maxWidth: 380,
          background: 'var(--bg-card)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fade-up 0.15s ease-out',
        }}
      >
        {/* Compact HUD Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DollarSign size={16} />
            </div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                Uso de Verba
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>
                (Pacing)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 10,
                background: statusBg,
                color: statusColor,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <StatusIcon size={11} />
              {statusText}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-icon btn-sm"
              style={{ width: 26, height: 26, color: 'var(--text-3)' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* HUD Meter Body */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Main Percentage & Bar (Token Usage Style) */}
          <div
            style={{
              background: 'var(--bg-card2)',
              borderRadius: 12,
              border: '1px solid var(--border-soft)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
                  {spendPct.toFixed(1)}%
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  consumido
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                Mês: <strong style={{ color: 'var(--text-1)' }}>{monthProgressPct}%</strong> (dia {currentDay}/{totalDays})
              </div>
            </div>

            {/* Token-like Progress Bar */}
            <div
              style={{
                position: 'relative',
                height: 10,
                borderRadius: 6,
                background: 'var(--bg)',
                overflow: 'hidden',
                border: '1px solid var(--border-soft)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, spendPct)}%`,
                  background: `linear-gradient(90deg, var(--accent) 0%, ${statusColor} 100%)`,
                  borderRadius: 6,
                  transition: 'width 0.3s ease-out',
                }}
              />
              {/* Expected Day Milestone Pin */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${Math.min(99, monthProgressPct)}%`,
                  width: 2,
                  background: 'var(--text-1)',
                  zIndex: 2,
                  boxShadow: '0 0 4px rgba(255,255,255,0.4)',
                }}
                title={`Ritmo esperado para hoje: ${monthProgressPct}%`}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
              <span>{fmt(currentSpend, currency)}</span>
              <span>Meta: {fmt(targetBudget, currency)}</span>
            </div>
          </div>

          {/* Compact Metrics Grid (2x2) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* Meta Mensal (Click to Edit) */}
            <div style={{ background: 'var(--bg-card2)', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                  Meta do Mês
                </span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditInput(String(targetBudget))
                      setIsEditing(true)
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-3)' }}
                    title="Editar meta"
                  >
                    <Edit3 size={11} />
                  </button>
                )}
              </div>
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
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
                      borderRadius: 4,
                      padding: '2px 4px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-1)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveBudget}
                    className="btn btn-soft btn-sm"
                    style={{ padding: '2px 6px', height: 22 }}
                  >
                    <Check size={11} />
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(targetBudget, currency)}
                </div>
              )}
            </div>

            {/* Projeção Fim do Mês */}
            <div style={{ background: 'var(--bg-card2)', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                Projeção Mês
              </span>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: projectedMonthEnd > targetBudget ? '#EF4444' : 'var(--text-1)',
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmt(projectedMonthEnd, currency)}
              </div>
            </div>

            {/* Ritmo Diário Atual */}
            <div style={{ background: 'var(--bg-card2)', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                Ritmo Atual
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {fmtDec(currentDailyAvg, currency)}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)' }}>/dia</span>
              </div>
            </div>

            {/* Ritmo Recomendado */}
            <div style={{ background: 'var(--bg-card2)', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
                Ritmo Ideal
              </span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {fmtDec(recommendedDaily, currency)}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)' }}>/dia</span>
              </div>
            </div>
          </div>
        </div>

        {/* Minimal Footer */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-soft)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card2)',
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {daysRemaining} dias restantes no ciclo
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, height: 26, padding: '0 8px', color: 'var(--text-2)' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
