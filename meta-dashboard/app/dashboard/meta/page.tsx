'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Moon, Sun } from 'lucide-react'
import { MetricTile } from '@/components/MetricTile'
import { CampaignTable } from '@/components/CampaignTable'
import { DailyChart } from '@/components/DailyChart'
import { FunnelTab } from '@/components/FunnelTab'
import { useMetricsRealtime } from '@/lib/useMetricsRealtime'
import type { DatePreset } from '@/lib/meta'

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today',    label: 'Hoje'    },
  { value: 'last_7d',  label: '7d'      },
  { value: 'last_14d', label: '14d'     },
  { value: 'last_30d', label: '30d'     },
]

function fmt(v: number | null | undefined, currency: string) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(v)
}
function fmtCompact(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`
  return String(v)
}

export default function MetaDashboard() {
  const [preset, setPreset]   = useState<DatePreset>('last_7d')
  const [theme, setTheme]     = useState<'dark' | 'light'>('dark')
  const [tab, setTab]         = useState<'metrics' | 'funnel'>('metrics')

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
    { label: 'Investimento', value: fmt(s.spend, currency),                spark: d?.spend       },
    { label: 'Leads',        value: fmtCompact(s.leads),                   spark: d?.leads       },
    { label: 'CPL',          value: fmt(s.cpl, currency),                  spark: d?.cpl         },
    { label: 'ROAS',         value: s.roas ? `${s.roas.toFixed(2)}×` : '—', spark: undefined    },
    { label: 'Impressões',   value: fmtCompact(s.impressions),             spark: d?.impressions },
    { label: 'CTR',          value: `${s.ctr.toFixed(2)}%`,               spark: d?.ctr         },
    { label: 'CPM',          value: fmt(s.cpm, currency),                  spark: undefined      },
    { label: 'Frequência',   value: s.frequency.toFixed(1),                spark: undefined      },
  ] : []

  const hasEnvError = data?.error?.includes('META_ACCESS_TOKEN')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 2 }}>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        position: 'sticky',
        top: 0,
        background: 'var(--bg)',
        zIndex: 50,
        gap: 16,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '-.2px',
            color: 'var(--text-1)',
            fontFamily: 'var(--font)',
            whiteSpace: 'nowrap',
          }}>
            DON <span style={{ color: 'var(--accent)' }}>↯</span> DASH
          </span>

          <span style={{ color: 'var(--border-med)', fontSize: 16, userSelect: 'none' }}>│</span>

          {data?.account_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              {!data.is_mock && (
                <span style={{ position: 'relative', display: 'inline-flex', width: 7, height: 7, flexShrink: 0 }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--green)', animation: 'ping 2.5s cubic-bezier(0,0,.2,1) infinite', opacity: 0.45 }} />
                  <span style={{ position: 'relative', width: 7, height: 7, borderRadius: '50%', background: 'var(--green)' }} />
                </span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data.account_name}
              </span>
              {data.is_mock && (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.15em', padding: '2px 6px', border: '1px solid var(--amber)', borderRadius: 'var(--radius-sm)', color: 'var(--amber)', textTransform: 'uppercase' }}>
                  Demo
                </span>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {/* Period */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginRight: 8 }}>
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => setPreset(p.value)} style={{
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font)',
                letterSpacing: '.04em',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                background: preset === p.value ? 'var(--accent-soft)' : 'transparent',
                color: preset === p.value ? 'var(--accent)' : 'var(--text-3)',
                transition: 'all .12s',
              }}>
                {p.label}
              </button>
            ))}
          </div>

          <button onClick={toggleTheme} style={iconBtn}>
            {theme === 'dark' ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
          </button>

          <button onClick={() => mutate()} disabled={isValidating} style={{
            ...iconBtn,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 10px',
            width: 'auto',
          }}>
            <RefreshCw size={12} strokeWidth={1.75} style={{ animation: isValidating ? 'spin 1s linear infinite' : undefined }} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>Atualizar</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 32px 80px' }}>

        {/* Error */}
        {(error || data?.error) && !data?.is_mock && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: 'rgba(245,96,90,.06)', border: '1px solid rgba(245,96,90,.2)',
            borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 24,
          }}>
            <AlertCircle size={14} color="var(--red)" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>
                {hasEnvError ? 'Configuração incompleta' : 'Erro ao buscar dados'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                {data?.error ?? 'Não foi possível conectar com a Meta API.'}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
          {(['metrics', 'funnel'] as const).map((key) => {
            const label = key === 'metrics' ? 'Métricas' : 'Funil de Vendas'
            const active = tab === key
            return (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                fontFamily: 'var(--font)',
                letterSpacing: active ? '.02em' : '.01em',
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                color: active ? 'var(--text-1)' : 'var(--text-3)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'all .12s',
              }}>{label}</button>
            )
          })}
        </div>

        {/* Funnel tab */}
        {!isLoading && tab === 'funnel' && s && <FunnelTab summary={s} currency={currency} />}
        {!isLoading && tab === 'funnel' && !s && (
          <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', padding: 40, letterSpacing: '.1em', textTransform: 'uppercase' }}>Carregando…</div>
        )}

        {/* Loading skeleton */}
        {isLoading && tab === 'metrics' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', minHeight: 96 }}>
                <div style={{ height: 8, width: '45%', background: 'var(--bg-card2)', borderRadius: 2, marginBottom: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 22, width: '60%', background: 'var(--bg-card2)', borderRadius: 2, animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))}
          </div>
        )}

        {/* Metric tiles */}
        {!isLoading && s && tab === 'metrics' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
            {tiles.map(t => (
              <MetricTile key={t.label} label={t.label} value={t.value} sparkData={t.spark} />
            ))}
          </div>
        )}

        {/* Daily chart */}
        {!isLoading && d && tab === 'metrics' && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 16 }}>
              Evolução Diária
            </div>
            <DailyChart daily={d} currency={currency} />
          </div>
        )}

        {/* Timestamp */}
        {data?.generated_at && !isLoading && tab === 'metrics' && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 20, textAlign: 'right', letterSpacing: '.06em', fontFamily: 'var(--mono)' }}>
            {new Date(data.generated_at).toLocaleString('pt-BR')} · ws
          </div>
        )}

        {/* Campaigns */}
        {!isLoading && data?.campaigns && tab === 'metrics' && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Campanhas</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{data.campaigns.length}</div>
            </div>
            <CampaignTable campaigns={data.campaigns} currency={currency} />
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes ping  { 75%,100% { transform: scale(2.4); opacity: 0; } }
        @media (max-width: 700px) {
          div[style*="repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
          header { padding: 0 16px !important; }
          main   { padding: 20px 16px 60px !important; }
        }
      `}</style>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  color: 'var(--text-2)',
  fontFamily: 'var(--font)',
  transition: 'border-color .12s, color .12s',
}
