'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Pause, Play } from 'lucide-react'
import { MetricTile } from './MetricTile'
import { DailyChart } from './DailyChart'
import { FunnelTab } from './FunnelTab'
import { STATUS_META } from './LeadsTab'
import { useLeadsData as useLeads } from '@/lib/leadsContext'
import { timeAgo, STALE_HOURS } from '@/lib/leadUtils'
import type { MetricsResponse, MetricsSummary } from '@/lib/meta'
import type { ResultKind } from '@/lib/resultKind'
import { PulseLoader } from '@/components/PulseLoader'

export interface TvTile {
  label: string
  value: string
  spark?: number[]
  cur?: number | null
  prev?: number | null
  lowerIsBetter?: boolean
}

interface TvModeProps {
  data: MetricsResponse | null
  summary?: MetricsSummary
  tiles: TvTile[]
  currency: string
  presetLabel: string
  clientName: string
  logoUrl?: string
  onExit: () => void
  onToggleTheme: () => void
  staleCount: number
  kind?: ResultKind
  /** false = cliente sem leads de formulário (site/conversas): sem a tela de leads do CRM */
  showCrm?: boolean
}

const SLIDES_ALL = ['Resultados', 'Funil de vendas', 'Leads'] as const
const SLIDE_MS = 20_000
const DESIGN_WIDTH = 1360

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)
}
export function TvMode({
  data, summary, tiles, currency, presetLabel, clientName, logoUrl, onExit, onToggleTheme, staleCount, kind = 'form', showCrm = true,
}: TvModeProps) {
  const SLIDES = useMemo(() => (showCrm ? SLIDES_ALL : SLIDES_ALL.slice(0, 2)), [showCrm])
  const [slide, setSlide]   = useState(0)
  const [paused, setPaused] = useState(false)
  const [idle, setIdle]     = useState(false)
  const [now, setNow]       = useState(() => new Date())
  const [size, setSize]     = useState({ w: DESIGN_WIDTH, h: 720 })
  const [hint, setHint]     = useState(true)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { leads } = useLeads()

  const next = useCallback(() => setSlide(s => (s + 1) % SLIDES.length), [SLIDES.length])
  const prev = useCallback(() => setSlide(s => (s - 1 + SLIDES.length) % SLIDES.length), [SLIDES.length])

  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen()
      else document.documentElement.requestFullscreen?.()
    } catch {}
  }, [])

  // Escala: o layout é desenhado em 1360 px e ampliado para a largura real da TV.
  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const zoom = Math.max(1, size.w / DESIGN_WIDTH)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (paused) return
    const id = setTimeout(next, SLIDE_MS)
    return () => clearTimeout(id)
  }, [slide, paused, next])

  useEffect(() => {
    const id = setTimeout(() => setHint(false), 8000)
    return () => clearTimeout(id)
  }, [])

  // Mantém a tela da TV acordada.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const request = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        lock = (await wl?.request('screen')) ?? null
      } catch {}
    }
    request()
    const onVisible = () => { if (document.visibilityState === 'visible') request() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') { e.preventDefault(); setPaused(p => !p) }
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      else if (e.key === 't' || e.key === 'T') onToggleTheme()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit, next, prev, toggleFullscreen, onToggleTheme])

  // Esconde cursor e botões depois de 3 s sem mexer o mouse.
  const wake = useCallback(() => {
    setIdle(false)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), 3000)
  }, [])
  useEffect(() => {
    wake()
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [wake])

  const updatedAt = data?.generated_at ? new Date(data.generated_at) : null
  const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const counts = {
    total:      leads.length,
    novo:       leads.filter(l => l.status === 'Novo').length,
    andamento:  leads.filter(l => l.status === 'Em andamento').length,
    convertido: leads.filter(l => l.status === 'Convertido').length,
    revenue:    leads.reduce((s, l) => s + (l.status === 'Convertido' ? (l.valor_pedido ?? 0) : 0), 0),
  }
  const convRate = counts.total ? (counts.convertido / counts.total) * 100 : 0
  const recent = leads.slice(0, 9)

  const leadKpis = [
    { label: 'Total de leads', value: String(counts.total),     color: 'var(--text-1)' },
    { label: 'Novos',          value: String(counts.novo),      color: 'var(--text-1)', dot: STATUS_META['Novo'].dot },
    { label: 'Em andamento',   value: String(counts.andamento), color: 'var(--text-1)', dot: STATUS_META['Em andamento'].dot },
    { label: 'Convertidos',    value: String(counts.convertido), color: 'var(--green)', dot: STATUS_META['Convertido'].dot },
    { label: `Sem contato +${STALE_HOURS}h`, value: String(staleCount), color: staleCount > 0 ? 'var(--amber)' : 'var(--text-1)', dot: 'var(--amber)' },
    { label: 'Taxa de conv.',  value: `${convRate.toFixed(1)}%`, color: 'var(--text-1)' },
    { label: 'Receita',        value: fmtBRL(counts.revenue),   color: 'var(--green)' },
  ]

  return (
    <div
      role="dialog"
      aria-label="Modo TV"
      onMouseMove={wake}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--bg)',
        overflow: 'hidden', cursor: idle ? 'none' : 'default',
      }}
    >
      <style>{`
        @keyframes tvprog { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .tv-slide { animation: fade-up .4s ease both; }
        @media (prefers-reduced-motion: reduce) { .tv-prog { animation: none !important; transform: scaleX(1) !important; } }
      `}</style>

      <div style={{
        zoom, width: size.w / zoom, height: size.h / zoom,
        display: 'flex', flexDirection: 'column', padding: '20px 28px 0', gap: 16,
      }}>
        {/* Cabeçalho */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ height: 48, width: 'auto', maxWidth: 140, objectFit: 'contain', borderRadius: 'var(--radius-lg)' }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-lg)', background: 'var(--accent-soft)', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{clientName}</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--text-1)' }}>{presetLabel}</span>
              <span className="badge" style={{ background: 'var(--green-soft)', color: 'var(--text-1)' }}>
                <span style={{ position: 'relative', width: 7, height: 7 }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--green)', animation: 'live-ping 1.4s ease-out infinite' }} />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--green)' }} />
                </span>
                Ao vivo{updatedAt ? ` · atualizado às ${hhmm(updatedAt)}` : ''}
              </span>
              {paused && <span className="badge" style={{ background: 'var(--amber-soft)', color: 'var(--text-1)' }}>Pausado</span>}
            </div>
          </div>

          <nav className="tabs" aria-label="Telas" style={{ marginLeft: 'auto', borderBottom: 'none' }}>
            {SLIDES.map((name, i) => (
              <button key={name} role="tab" className="tab" aria-selected={slide === i} onClick={() => setSlide(i)}>{name}</button>
            ))}
          </nav>

          <div style={{ textAlign: 'right', marginLeft: 16 }}>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{hhmm(now)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
              {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </div>
          </div>
        </header>

        {/* Tela atual */}
        <main key={slide} className="tv-slide" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!data || !summary ? (
            <PulseLoader size={64} />
          ) : slide === 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flexShrink: 0 }}>
                {tiles.slice(0, 8).map(t => (
                  <MetricTile
                    key={t.label}
                    label={t.label}
                    value={t.value}
                    sparkData={t.spark}
                    currentRaw={t.cur ?? undefined}
                    prevValue={t.prev ?? undefined}
                    lowerIsBetter={t.lowerIsBetter}
                  />
                ))}
              </div>
              {data.daily && (
                <div className="card" style={{ padding: 24, minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Evolução diária</div>
                  <DailyChart daily={data.daily} currency={currency} kind={kind} />
                </div>
              )}
            </>
          ) : slide === 1 ? (
            <FunnelTab summary={summary} currency={currency} tv kind={kind} />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, flexShrink: 0 }}>
                {leadKpis.map(k => (
                  <div key={k.label} className="card" style={{ padding: 16, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
                      {k.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: k.dot, flexShrink: 0 }} />}
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{k.label}</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: k.color, marginTop: 8, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ overflow: 'hidden', minHeight: 0 }}>
                <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-soft)', fontSize: 16, fontWeight: 600 }}>Últimos leads</div>
                {recent.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Nenhum lead ainda.</div>
                ) : recent.map((l, i) => (
                  <div key={l.id} style={{
                    display: 'grid', gridTemplateColumns: '90px 1.2fr 1.6fr 1.2fr 150px', gap: 16, alignItems: 'center',
                    padding: '0 24px', height: 40, fontSize: 14,
                    borderBottom: i < recent.length - 1 ? '1px solid var(--border-soft)' : 'none',
                  }}>
                    <span style={{ color: 'var(--text-2)' }}>{timeAgo(l.created_at)}</span>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome ?? '—'}</span>
                    <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.campanha ?? '—'}</span>
                    <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.ad_name ?? '—'}</span>
                    <span className="badge" style={{ background: STATUS_META[l.status].bg, color: 'var(--text-1)', justifySelf: 'start' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_META[l.status].dot }} />
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>

        {/* Barra de tempo da tela */}
        <div style={{ height: 3, background: 'var(--bg-card2)', flexShrink: 0, margin: '0 -28px' }}>
          <div
            key={`${slide}-${paused}`}
            className="tv-prog"
            style={{
              height: '100%', background: 'var(--accent)', transformOrigin: 'left',
              transform: paused ? 'scaleX(0)' : undefined,
              animation: paused ? 'none' : `tvprog ${SLIDE_MS}ms linear forwards`,
            }}
          />
        </div>
      </div>

      {/* Controles: somem quando o mouse fica parado */}
      <div style={{
        position: 'fixed', top: 12, right: 12, display: 'flex', gap: 8, zIndex: 2001,
        opacity: idle ? 0 : 1, transition: 'opacity .3s', pointerEvents: idle ? 'none' : 'auto',
      }}>
        <button className="btn btn-outline btn-icon btn-sm" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Retomar' : 'Pausar'} title={paused ? 'Retomar (Espaço)' : 'Pausar (Espaço)'}>
          {paused ? <Play size={16} strokeWidth={1.75} /> : <Pause size={16} strokeWidth={1.75} />}
        </button>
        <button className="btn btn-outline btn-icon btn-sm" onClick={onExit} aria-label="Sair do modo TV" title="Sair (Esc)">
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {hint && (
        <div className="badge" style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 2001, padding: '6px 14px', fontSize: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-2)', boxShadow: 'var(--shadow-soft)',
        }}>
          F tela cheia · Espaço pausa · ← → troca de tela · T tema · Esc sai
        </div>
      )}
    </div>
  )
}
