'use client'

import { useEffect, useState } from 'react'
import { X, Check, Settings2, Target, DollarSign, Power, Loader2, Sparkles } from 'lucide-react'
import type { ClientConfig } from '@/lib/clientConfig'
import { PulseLoader } from '@/components/PulseLoader'

interface ClientConfigModalProps {
  slug: string
  clientName: string
  onClose: () => void
  onSaved?: (newConfig: ClientConfig) => void
  /** dentro de outra tela (aba do gerenciador de clientes): sem fundo escuro, sem cabeçalho e sem "Cancelar" */
  embedded?: boolean
}

export function ClientConfigModal({ slug, clientName, onClose, onSaved, embedded = false }: ClientConfigModalProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [active, setActive] = useState(true)
  const [strategicObjective, setStrategicObjective] = useState('')
  const [goalsPeriod, setGoalsPeriod] = useState('')
  const [targetBudget, setTargetBudget] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/admin/clients/${slug}/config`)
      .then(r => r.ok ? r.json() : null)
      .then((cfg: ClientConfig | null) => {
        if (!alive || !cfg) return
        setActive(cfg.active !== false)
        setStrategicObjective(cfg.strategicObjective || '')
        setGoalsPeriod(cfg.goalsPeriod || '')
        setTargetBudget(cfg.targetBudget != null ? String(cfg.targetBudget) : '')
      })
      .catch(() => setError('Não foi possível carregar as configurações do cliente.'))
      .finally(() => { if (alive) setLoading(false) })

    return () => { alive = false }
  }, [slug])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const budgetNum = targetBudget.trim() ? parseFloat(targetBudget.replace(',', '.')) : undefined
      const body = {
        active,
        strategicObjective: strategicObjective.trim(),
        goalsPeriod: goalsPeriod.trim(),
        targetBudget: budgetNum != null && !isNaN(budgetNum) ? budgetNum : null,
      }

      const res = await fetch(`/api/admin/clients/${slug}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({})) as { ok?: boolean; config?: ClientConfig; error?: string }

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Erro ao salvar configurações.')
      }

      setSuccess(true)
      if (json.config && onSaved) onSaved(json.config)
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={embedded ? undefined : onClose}
      style={embedded ? { display: 'block' } : {
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        role="dialog"
        aria-label="Configurações do Cliente"
        style={embedded ? { display: 'flex', flexDirection: 'column', gap: 18 } : {
          width: '100%',
          maxWidth: 580,
          padding: 24,
          background: 'var(--bg-card)',
          borderRadius: 20,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-elegant)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Header */}
        {!embedded && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-soft)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              <Settings2 size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                Configurações · {clientName}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                Objetivos estratégicos, ritmo de verba e status de sincronização
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>}

        {loading ? (
          <PulseLoader size={36} />
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status (Ativo / Pausado) */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: active ? 'var(--bg-card2)' : 'var(--amber-soft)',
                border: `1px solid ${active ? 'var(--border-soft)' : 'var(--amber)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                  <Power size={15} color={active ? 'var(--green)' : 'var(--amber)'} />
                  <span>Status do Cliente: {active ? 'Ativo' : 'Pausado'}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {active
                    ? 'Sincroniza campanhas e leads normalmente via segundo plano.'
                    : 'Pausado: não gasta requisições na Meta nem roda sincronizações automáticas.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActive(v => !v)}
                className={`btn btn-sm ${active ? 'btn-outline' : 'btn-primary'}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  borderColor: active ? 'var(--border)' : undefined,
                  minWidth: 100,
                }}
              >
                {active ? 'Pausar Cliente' : 'Ativar Cliente'}
              </button>
            </div>

            {/* Objetivo Estratégico */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label
                  htmlFor="strat-obj"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}
                >
                  <Target size={14} color="var(--accent)" />
                  Objetivo Estratégico do Cliente
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Slide 2 da apresentação</span>
              </div>
              <textarea
                id="strat-obj"
                className="field"
                rows={3}
                placeholder="Ex.: Consolidar o posicionamento como referência local e acelerar a geração de leads qualificados para a equipe de vendas."
                value={strategicObjective}
                onChange={e => setStrategicObjective(e.target.value)}
                style={{ width: '100%', resize: 'vertical', fontSize: 13, padding: '10px 12px', lineHeight: 1.4 }}
              />
            </div>

            {/* Metas e Diretrizes do Período */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label
                  htmlFor="goals-period"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}
                >
                  <Sparkles size={14} color="var(--accent)" />
                  Metas e Diretrizes do Período
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Uma por linha</span>
              </div>
              <textarea
                id="goals-period"
                className="field"
                rows={3}
                placeholder={"Ex.: Manter o CPL médio abaixo de R$ 25,00\nAumentar volume de conversões em 20%\nTestar novos criativos em vídeo semanalmente"}
                value={goalsPeriod}
                onChange={e => setGoalsPeriod(e.target.value)}
                style={{ width: '100%', resize: 'vertical', fontSize: 13, padding: '10px 12px', lineHeight: 1.4 }}
              />
            </div>

            {/* Meta de Investimento Mensal (Budget Target) */}
            <div>
              <label
                htmlFor="target-budget"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}
              >
                <DollarSign size={14} color="var(--accent)" />
                Meta de Investimento Mensal (Budget Pacing)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: 9, fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>R$</span>
                <input
                  id="target-budget"
                  type="text"
                  className="field"
                  placeholder="2500,00"
                  value={targetBudget}
                  onChange={e => setTargetBudget(e.target.value)}
                  style={{ width: '100%', paddingLeft: 38, fontSize: 13, height: 38 }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Valor mensal estimado para cálculo de ritmo de verba (Budget Pacing).
              </div>
            </div>

            {error && (
              <div style={{ padding: 10, borderRadius: 8, background: 'var(--red-soft)', color: 'var(--red)', fontSize: 12 }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{ padding: 10, borderRadius: 8, background: 'var(--green-soft)', color: 'var(--green)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} /> Configurações salvas com sucesso!
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
              {!embedded && <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </button>}
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={saving}
                style={{ minWidth: 120 }}
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Salvando…</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Salvar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

