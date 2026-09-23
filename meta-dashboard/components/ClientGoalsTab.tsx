'use client'

import { useState, useEffect } from 'react'
import { Target, Compass, Filter, DollarSign, Check, Save, Sparkles } from 'lucide-react'
import type { ClientConfig } from '@/lib/clientConfig'

interface ClientGoalsTabProps {
  slug: string
  isStaff?: boolean
}

export function ClientGoalsTab({ slug, isStaff = true }: ClientGoalsTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [strategicObjective, setStrategicObjective] = useState('')
  const [goalsPeriod, setGoalsPeriod] = useState('')
  const [funnelGoals, setFunnelGoals] = useState('')
  const [targetBudget, setTargetBudget] = useState<string>('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/admin/clients/${slug}/config`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Não foi possível carregar as configurações.')
        const data = (await res.json()) as ClientConfig
        if (active) {
          setStrategicObjective(data.strategicObjective || '')
          setGoalsPeriod(data.goalsPeriod || '')
          setFunnelGoals(data.funnelGoals || '')
          setTargetBudget(data.targetBudget != null ? String(data.targetBudget) : '')
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Erro ao carregar metas.')
      } finally {
        if (active) setLoading(false)
      }
    }
    if (slug) load()
    return () => {
      active = false
    }
  }, [slug])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSavedSuccess(false)

    try {
      const budgetNum = parseFloat(targetBudget.replace(/[^\d.,]/g, '').replace(',', '.'))
      const payload: Partial<ClientConfig> = {
        strategicObjective: strategicObjective.trim(),
        goalsPeriod: goalsPeriod.trim(),
        funnelGoals: funnelGoals.trim(),
        targetBudget: !isNaN(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
      }

      const res = await fetch(`/api/admin/clients/${slug}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error || 'Erro ao salvar metas.')
      }

      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar metas.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)' }}>
        Carregando metas e estratégias do cliente...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 48 }}>
      {/* Header com instruções */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
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
            }}
          >
            <Target size={20} strokeWidth={2} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Configuração & Metas do Cliente
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Preencha os direcionamentos qualitativos e táticos. As apresentações (PPTX e PDF) puxam diretamente destes dados.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Card 1: Objetivo Estratégico */}
        <div className="card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Compass size={18} color="var(--accent)" strokeWidth={2} />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Objetivo Estratégico da Marca
            </h3>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                marginLeft: 'auto',
              }}
            >
              Slide 2 do Relatório
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            Posicionamento central, propósito e foco da empresa com o marketing digital e redes sociais.
          </p>
          <textarea
            value={strategicObjective}
            onChange={e => setStrategicObjective(e.target.value)}
            rows={3}
            className="input"
            style={{
              width: '100%',
              resize: 'vertical',
              fontSize: 13,
              lineHeight: 1.5,
              padding: 12,
              borderRadius: 10,
            }}
            placeholder="Ex.: Consolidar o posicionamento de alta autoridade na região, acelerando a captação de leads qualificados para procedimentos de alto ticket e expandindo a presença digital com conteúdo educativo consistente."
          />
        </div>

        {/* Card 2: Metas Estratégicas do Período (Metas por Escrito) */}
        <div className="card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Target size={18} color="#22C55E" strokeWidth={2} />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Metas do Período (Descritas por Extenso)
            </h3>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(34, 197, 94, 0.12)',
                color: '#22C55E',
                marginLeft: 'auto',
              }}
            >
              Qualitativas & Quantitativas
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            Escreva cada meta em uma frase por extenso (uma meta por linha). Não use apenas números soltos.
          </p>
          <textarea
            value={goalsPeriod}
            onChange={e => setGoalsPeriod(e.target.value)}
            rows={4}
            className="input"
            style={{
              width: '100%',
              resize: 'vertical',
              fontSize: 13,
              lineHeight: 1.6,
              padding: 12,
              borderRadius: 10,
              fontFamily: 'inherit',
            }}
            placeholder={'• Aumentar o número de seguidores qualificados com perfil comprador em 1.500 no trimestre\n• Ampliar o volume de vendas e agendamentos de procedimentos em 25%\n• Reduzir a taxa de não comparecimento fortalecendo a qualificação e contato em menos de 10 min\n• Testar novos criativos em formato Reels destacando prova social e autoridade'}
          />
        </div>

        {/* Card 3: Metas do Funil de Vendas */}
        <div className="card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Filter size={18} color="#F59E0B" strokeWidth={2} />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Metas do Funil de Vendas (Atração, Engajamento & Conversão)
            </h3>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#F59E0B',
                marginLeft: 'auto',
              }}
            >
              Alinhamento de Funil
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            Descreva os objetivos de cada etapa do funil (Topo, Meio e Fundo) para contextualizar o time e os relatórios.
          </p>
          <textarea
            value={funnelGoals}
            onChange={e => setFunnelGoals(e.target.value)}
            rows={4}
            className="input"
            style={{
              width: '100%',
              resize: 'vertical',
              fontSize: 13,
              lineHeight: 1.6,
              padding: 12,
              borderRadius: 10,
              fontFamily: 'inherit',
            }}
            placeholder={'• Topo (Atração): Gerar alcance amplo de mais de 45.000 pessoas da região com Reels educativos e anúncios dinâmicos.\n• Meio (Nutrição): Nutrir e aquecer a audiência que interagiu nos últimos 30 dias com carrosséis aprofundados e prova social.\n• Fundo (Conversão): Direcionar leads quentes para o WhatsApp com resposta ágil da recepção em até 10 minutos.'}
          />
        </div>

        {/* Card 4: Meta de Verba Mensal (Budget) */}
        <div className="card" style={{ padding: 20, borderRadius: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <DollarSign size={18} color="var(--accent)" strokeWidth={2} />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              Meta de Verba Mensal (R$)
            </h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
            Verba planejada para anúncios da Meta no mês. Alimenta o cálculo de ritmo (Pacing) e projeções financeiras.
          </p>
          <div style={{ maxWidth: 280 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 12, fontSize: 13, fontWeight: 700, color: 'var(--text-3)' }}>
                R$
              </span>
              <input
                type="number"
                step="any"
                min="0"
                value={targetBudget}
                onChange={e => setTargetBudget(e.target.value)}
                className="input"
                style={{
                  width: '100%',
                  paddingLeft: 38,
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 10,
                }}
                placeholder="Ex.: 5000"
              />
            </div>
          </div>
        </div>

        {/* Alerta de erro se houver */}
        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'var(--red-soft)',
              color: 'var(--red)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {/* Barra de ações e salvar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 8,
          }}
        >
          <div>
            {savedSuccess && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#22C55E',
                  fontSize: 13,
                  fontWeight: 600,
                  animation: 'fade-in 0.2s ease',
                }}
              >
                <Check size={16} strokeWidth={2.5} />
                <span>Metas salvas com sucesso! O relatório PPTX e os gráficos já estão sincronizados.</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 24px',
              height: 42,
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 10,
            }}
          >
            {saving ? (
              <span>Salvando...</span>
            ) : (
              <>
                <Save size={16} strokeWidth={2} />
                <span>Salvar Metas & Estratégia</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

