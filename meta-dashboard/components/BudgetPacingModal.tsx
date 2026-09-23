'use client'

import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Edit3, Check, X, ShieldAlert, Zap } from 'lucide-react'
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
  const month = now.getMonth() // 0-indexed
  const currentDay = now.getDate()
  const totalDays = new Date(year, month + 1, 0).getDate() // total days in month
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
  let statusColor = 'var(--green)'
  let statusBg = 'var(--green-soft)'
  let statusText = 'No Ritmo Ideal'
  let statusDesc = 'Gasto perfeitamente alinhado com o cronograma do mês.'
  let StatusIcon = CheckCircle2

  if (pacingRatio > 1.12) {
    statusColor = 'var(--red)'
    statusBg = 'var(--red-soft)'
    statusText = `Ritmo Acelerado (+${paceDiffPct}%)`
    statusDesc = `Gasto ${paceDiffPct}% acima do ritmo ideal esperado para hoje.`
    StatusIcon = ArrowUpRight
  } else if (pacingRatio < 0.88) {
    statusColor = 'var(--accent)'
    statusBg = 'var(--accent-soft)'
    statusText = `Ritmo Lento (${paceDiffPct}%)`
    statusDesc = `Gasto ${Math.abs(paceDiffPct)}% abaixo do ritmo. Verba pode sobrar se não acelerar.`
    StatusIcon = ArrowDownRight
  }

  // Forecast
  const currentDailyAvg = currentDay > 0 ? currentSpend / currentDay : 0
  const projectedMonthEnd = currentDay > 0 ? currentDailyAvg * totalDays : currentSpend
  const remainingBudget = Math.max(0, targetBudget - currentSpend)
  const recommendedDaily = daysRemaining > 0 ? remainingBudget / daysRemaining : 0

  // Claude Code-style ASCII bar blocks (20 segments)
  const totalBlocks = 20
  const filledBlocks = Math.min(totalBlocks, Math.round((spendPct / 100) * totalBlocks))
  const expectedBlockIndex = Math.min(totalBlocks - 1, Math.round((monthProgressPct / 100) * totalBlocks))

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
          maxWidth: 640,
          background: 'var(--bg-card)',
          borderRadius: 20,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-elegant)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fade-up 0.18s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
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
              <DollarSign size={20} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Ritmo de Verba (Budget Pacing)</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: statusBg,
                    color: statusColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <StatusIcon size={12} />
                  {statusText}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Controle de consumo financeiro Meta Ads em tempo real
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ width: 32, height: 32 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Claude Code Style Meter Terminal Box */}
          <div
            style={{
              background: 'var(--bg-card2)',
              borderRadius: 14,
              border: '1px solid var(--border-soft)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              fontFamily: 'var(--font)',
            }}
          >
            {/* Top row with percentages */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, color: statusColor, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {spendPct.toFixed(1)}%
                </span>
                <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                  consumido de {fmt(targetBudget, currency)}
                </span>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Mês: <strong style={{ color: 'var(--text-1)' }}>{monthProgressPct}%</strong> decorrido (dia {currentDay}/{totalDays})
              </div>
            </div>

            {/* Visual Pacing Progress Bar */}
            <div style={{ position: 'relative', height: 16, borderRadius: 8, background: 'var(--bg)', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
              {/* Actual Spend fill */}
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, spendPct)}%`,
                  background: `linear-gradient(90deg, var(--accent) 0%, ${statusColor} 100%)`,
                  borderRadius: 8,
                  transition: 'width 0.4s ease-out',
                }}
              />
              {/* Expected Day Milestone Pin */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${Math.min(99, monthProgressPct)}%`,
                  width: 3,
                  background: 'var(--text-1)',
                  zIndex: 2,
                  boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                }}
                title={`Ritmo esperado para hoje: ${monthProgressPct}% (${fmt(expectedSpendToDate, currency)})`}
              />
            </div>

            {/* Micro legend */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
              <span>Investido: {fmt(currentSpend, currency)}</span>
              <span style={{ color: 'var(--text-2)' }}>▲ Marcador: Ritmo esperado ({monthProgressPct}%)</span>
              <span>Restante: {fmt(remainingBudget, currency)}</span>
            </div>
          </div>

          {/* 4 Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {/* Meta Mensal (Editable) */}
            <div style={{ background: 'var(--bg-card2)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.06em' }}>
                  Meta de Verba do Mês
                </span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditInput(String(targetBudget))
                      setIsEditing(true)
                    }}
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Editar meta"
                    style={{ width: 22, height: 22, padding: 0 }}
                  >
                    <Edit3 size={12} />
                  </button>
                )}
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
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
                      padding: '4px 8px',
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--text-1)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveBudget}
                    className="btn btn-soft btn-sm"
                    style={{ padding: '4px 10px', height: 30 }}
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(targetBudget, currency)}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {activeDailyBudgetsSum > 0 ? `Soma ativa Meta: ${fmt(activeDailyBudgetsSum, currency)}/dia` : 'Configuração manual'}
              </div>
            </div>

            {/* Projeção de Fechamento */}
            <div style={{ background: 'var(--bg-card2)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.06em', marginBottom: 4 }}>
                Projeção no Fim do Mês
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: projectedMonthEnd > targetBudget ? 'var(--red)' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(projectedMonthEnd, currency)}
              </div>
              <div style={{ fontSize: 11, color: projectedMonthEnd > targetBudget ? 'var(--red)' : 'var(--green)', marginTop: 2, fontWeight: 600 }}>
                {projectedMonthEnd > targetBudget
                  ? `Estouro de ${fmt(projectedMonthEnd - targetBudget, currency)} previsto`
                  : `Dentro da meta (${fmt(targetBudget - projectedMonthEnd, currency)} sobra)`}
              </div>
            </div>

            {/* Ritmo Diário Atual */}
            <div style={{ background: 'var(--bg-card2)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.06em', marginBottom: 4 }}>
                Ritmo Diário Atual
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtDec(currentDailyAvg, currency)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}> /dia</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Média realizada nos primeiros {currentDay} dias
              </div>
            </div>

            {/* Ritmo Recomendado Restante */}
            <div style={{ background: 'var(--bg-card2)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.06em', marginBottom: 4 }}>
                Ritmo Recomendado
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtDec(recommendedDaily, currency)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}> /dia</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                Para os {daysRemaining} dias restantes no mês
              </div>
            </div>
          </div>

          {/* Active Campaigns Breakdown */}
          {activeCampaigns.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '.06em', marginBottom: 8 }}>
                Campanhas Ativas Consumindo Verba ({activeCampaigns.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {activeCampaigns.slice(0, 6).map(c => (
                  <div
                    key={c.id}
                    style={{
                      background: 'var(--bg-card2)',
                      padding: '8px 12px',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      border: '1px solid var(--border-soft)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                      {c.name}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {c.daily_budget ? `${fmt(c.daily_budget, currency)}/dia` : fmt(c.spend, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--border-soft)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--bg-card2)',
          }}
        >
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

