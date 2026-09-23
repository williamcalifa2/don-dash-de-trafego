'use client'

import { useState, useEffect, useRef } from 'react'
import { DollarSign, CheckCircle2, ArrowUpRight, ArrowDownRight, Edit3, Check, X } from 'lucide-react'
import type { CampaignRow } from '@/lib/meta'

interface BudgetPacingPopoverProps {
  campaigns?: CampaignRow[]
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

function Row({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'ok' | 'bad' }) {
  const color = tone === 'warn' ? 'var(--amber)' : tone === 'bad' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--text-1)'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid var(--border-soft)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color, display: 'block' }}>{value}</span>
        {sub && <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'block' }}>{sub}</span>}
      </span>
    </div>
  )
}

export function BudgetPacingPopover({ campaigns = [], currentSpend, currency, clientSlug = 'default' }: BudgetPacingPopoverProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const currentDay = now.getDate()
  const totalDays = new Date(year, month + 1, 0).getDate()
  const daysRemaining = Math.max(0, totalDays - currentDay)
  const monthProgressPct = Math.round((currentDay / totalDays) * 100)

  // Default target budget
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

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setIsEditing(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setIsEditing(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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

  // Calculations
  const spendPct = targetBudget > 0 ? (currentSpend / targetBudget) * 100 : 0
  const expectedSpendToDate = (currentDay / totalDays) * targetBudget
  const pacingRatio = expectedSpendToDate > 0 ? currentSpend / expectedSpendToDate : 1
  const paceDiffPct = Math.round((pacingRatio - 1) * 100)

  let statusColor = 'var(--green)'
  let statusBg = 'rgba(34, 197, 94, 0.14)'
  let statusText = 'Ritmo Ideal'
  let StatusIcon = CheckCircle2
  let statusTone: 'ok' | 'warn' | 'bad' = 'ok'

  if (pacingRatio > 1.12) {
    statusColor = 'var(--red)'
    statusBg = 'rgba(239, 68, 68, 0.14)'
    statusText = `Acelerado (+${paceDiffPct}%)`
    StatusIcon = ArrowUpRight
    statusTone = 'bad'
  } else if (pacingRatio < 0.88) {
    statusColor = 'var(--accent)'
    statusBg = 'var(--accent-soft)'
    statusText = `Lento (${paceDiffPct}%)`
    StatusIcon = ArrowDownRight
    statusTone = 'warn'
  }

  const currentDailyAvg = currentDay > 0 ? currentSpend / currentDay : 0
  const projectedMonthEnd = currentDay > 0 ? currentDailyAvg * totalDays : currentSpend
  const remainingBudget = Math.max(0, targetBudget - currentSpend)
  const recommendedDaily = daysRemaining > 0 ? remainingBudget / daysRemaining : 0

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Ritmo de Verba (Budget Pacing)"
        aria-label="Ritmo de Verba"
        className={`btn btn-outline btn-icon btn-sm ${open ? 'active' : ''}`}
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          borderColor: open ? 'var(--accent)' : undefined,
          background: open ? 'var(--accent-soft)' : undefined,
          color: open ? 'var(--accent)' : undefined,
        }}
      >
        <DollarSign size={16} strokeWidth={2} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ritmo de Verba"
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 100,
            width: 'min(360px, calc(100vw - 32px))',
            maxHeight: 'min(80vh, 600px)',
            overflowY: 'auto',
            padding: 16,
            boxShadow: 'var(--shadow-elegant)',
            borderRadius: 16,
            animation: 'fade-up 0.15s ease-out',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                Ritmo de Verba
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                (Pacing)
              </span>
            </div>
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
          </div>

          {/* Token-like Usage Card */}
          <div
            style={{
              background: 'var(--bg-card2)',
              borderRadius: 12,
              border: '1px solid var(--border-soft)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: statusColor, fontVariantNumeric: 'tabular-nums' }}>
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

            {/* Token Progress Bar */}
            <div
              style={{
                position: 'relative',
                height: 8,
                borderRadius: 999,
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
                  borderRadius: 999,
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

          {/* Key-Value Details */}
          <div>
            {/* Meta do Mês com Edição Rápida */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '7px 0', borderTop: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Meta do Mês</span>
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    value={editInput}
                    onChange={e => setEditInput(e.target.value)}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveBudget()}
                    style={{
                      width: 84,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--accent)',
                      borderRadius: 4,
                      padding: '2px 6px',
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
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 4px', height: 22, color: 'var(--text-3)' }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(targetBudget, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditInput(String(targetBudget))
                      setIsEditing(true)
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-3)' }}
                    title="Editar meta de verba"
                  >
                    <Edit3 size={11} />
                  </button>
                </div>
              )}
            </div>

            <Row
              label="Investimento Atual"
              value={fmt(currentSpend, currency)}
              sub={`${spendPct.toFixed(0)}% do planejado`}
            />

            <Row
              label="Projeção de Fechamento"
              value={fmt(projectedMonthEnd, currency)}
              sub={projectedMonthEnd > targetBudget ? 'Possível estouro de orçamento' : 'Dentro do limite planejado'}
              tone={projectedMonthEnd > targetBudget ? 'bad' : 'ok'}
            />

            <Row
              label="Ritmo Diário Atual"
              value={`${fmtDec(currentDailyAvg, currency)} / dia`}
              sub={`Média nos primeiros ${currentDay} dias`}
            />

            <Row
              label="Ritmo Diário Ideal"
              value={`${fmtDec(recommendedDaily, currency)} / dia`}
              sub={`Para fechar a meta nos ${daysRemaining} dias restantes`}
              tone="ok"
            />
          </div>

          {/* Minimal Footer */}
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: '1px solid var(--border-soft)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: 'var(--text-3)',
            }}
          >
            <span>{daysRemaining} dias até o fim do mês</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, height: 24, padding: '0 6px', color: 'var(--text-2)' }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
