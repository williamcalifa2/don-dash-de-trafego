'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, AlertCircle, Moon, Sun } from 'lucide-react'
import { MetricTile } from '@/components/MetricTile'
import { CampaignTable } from '@/components/CampaignTable'
import { DailyChart } from '@/components/DailyChart'
import { FunnelTab } from '@/components/FunnelTab'
import { useMetricsRealtime } from '@/lib/useMetricsRealtime'
import type { DatePreset } from '@/lib/meta'

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today',    label: 'Hoje' },
  { value: 'last_7d',  label: '7 dias' },
  { value: 'last_14d', label: '14 dias' },
  { value: 'last_30d', label: '30 dias' },
]

function fmt(v: number | null | undefined, currency: string) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(v)
}
function fmtCompact(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(v)
}

export default function MetaDashboard() {
  const [preset, setPreset] = useState<DatePreset>('last_7d')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tab, setTab] = useState<'metrics' | 'funnel'>('metrics')

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    const initial = saved ?? 'dark'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
  }

  const { data, error, isLoading, isValidating, mutate } = useMetricsRealtime(preset)

  const currency = data?.currency ?? 'BRL'
  const s = data?.summary
  const d = data?.daily

  const tiles = s ? [
    { label: 'Investimento', value: fmt(s.spend, currency),                  spark: d?.spend },
    { label: 'Leads',        value: fmtCompact(s.leads),                      spark: d?.leads },
    { label: 'CPL',          value: fmt(s.cpl, currency),                     spark: d?.cpl },
    { label: 'ROAS',         value: s.roas ? `${s.roas.toFixed(2)}x` : '—',  spark: undefined },
    { label: 'Impressões',   value: fmtCompact(s.impressions),                spark: d?.impressions },
    { label: 'CTR',          value: `${s.ctr.toFixed(2)}%`,                   spark: d?.ctr },
    { label: 'CPM',          value: fmt(s.cpm, currency),                     spark: undefined },
    { label: 'Frequência',   value: s.frequency.toFixed(1),                   spark: undefined },
  ] : []

  const hasEnvError = data?.error?.includes('META_ACCESS_TOKEN')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '0 16px', paddingBlock: '40px 80px', maxWidth: 1040, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <TrendingUp size={20} color="var(--accent)" strokeWidth={1.75} />
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>Meta Ads Dashboard</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {data?.account_name && (
              <p style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {!data.is_mock && (
                  <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--green)', animation: 'ping 2s cubic-bezier(0,0,.2,1) infinite', opacity: 0.5 }} />
                    <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                  </span>
                )}
                {data.account_name}
              </p>
            )}
            {data?.is_mock && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,.12)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,.2)' }}>
                Demo · dados fictícios
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Period picker */}
          <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {PRESETS.map((p) => (
              <button key={p.value} onClick={() => setPreset(p.value)} style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                border: 'none', cursor: 'pointer',
                background: preset === p.value ? 'var(--accent-soft)' : 'transparent',
                color: preset === p.value ? 'var(--accent)' : 'var(--text-2)',
                transition: 'all .15s',
              }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button onClick={toggleTheme} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-2)',
          }}>
            {theme === 'dark'
              ? <Sun size={14} strokeWidth={1.75} />
              : <Moon size={14} strokeWidth={1.75} />}
          </button>

          {/* Refresh */}
          <button onClick={() => mutate()} disabled={isValidating} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 34, padding: '0 12px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
            opacity: isValidating ? 0.6 : 1,
          }}>
            <RefreshCw size={13} strokeWidth={1.75} style={{ animation: isValidating ? 'spin 1s linear infinite' : undefined }} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: 'fit-content', marginBottom: 28 }}>
        {([['metrics', 'Métricas'], ['funnel', 'Funil de Vendas']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
            border: 'none', cursor: 'pointer',
            background: tab === key ? 'var(--accent-soft)' : 'transparent',
            color: tab === key ? 'var(--accent)' : 'var(--text-2)',
            transition: 'all .15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Error */}
      {(error || data?.error) && !data?.is_mock && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
          borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 32,
        }}>
          <AlertCircle size={16} color="var(--red)" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 2 }}>
              {hasEnvError ? 'Configuração incompleta' : 'Erro ao buscar dados'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {data?.error ?? 'Não foi possível conectar com a Meta API.'}
              {hasEnvError && (
                <span> Adicione <code style={{ fontFamily: 'var(--mono)', background: 'var(--bg-card2)', padding: '1px 5px', borderRadius: 3 }}>META_ACCESS_TOKEN</code> e <code style={{ fontFamily: 'var(--mono)', background: 'var(--bg-card2)', padding: '1px 5px', borderRadius: 3 }}>META_AD_ACCOUNT_ID</code> no <code style={{ fontFamily: 'var(--mono)', background: 'var(--bg-card2)', padding: '1px 5px', borderRadius: 3 }}>.env.local</code>.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Funnel tab */}
      {!isLoading && tab === 'funnel' && s && (
        <FunnelTab summary={s} currency={currency} />
      )}
      {!isLoading && tab === 'funnel' && !s && !error && (
        <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 40 }}>Carregando dados...</div>
      )}

      {/* Loading skeleton */}
      {isLoading && tab === 'metrics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', minHeight: 100 }}>
              <div style={{ height: 10, width: '60%', background: 'var(--border)', borderRadius: 3, marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: 26, width: '40%', background: 'var(--border)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
      )}

      {/* Metric tiles */}
      {!isLoading && s && tab === 'metrics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {tiles.map((t) => (
            <MetricTile
              key={t.label}
              label={t.label}
              value={t.value}
              sparkData={t.spark}
            />
          ))}
        </div>
      )}

      {/* Daily chart */}
      {!isLoading && d && tab === 'metrics' && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Evolução diária</div>
          <DailyChart daily={d} currency={currency} />
        </div>
      )}

      {/* Last update */}
      {data?.generated_at && !isLoading && tab === 'metrics' && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 24, textAlign: 'right' }}>
          Atualizado em {new Date(data.generated_at).toLocaleString('pt-BR')} · WebSocket ativo
        </div>
      )}

      {/* Campaigns table */}
      {!isLoading && data?.campaigns && tab === 'metrics' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Campanhas</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{data.campaigns.length} campanhas</div>
          </div>
          <CampaignTable campaigns={data.campaigns} currency={currency} />
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
        @keyframes ping { 75%,100% { transform: scale(2.2); opacity: 0; } }
        @media (max-width: 700px) {
          div[style*="repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  )
}
