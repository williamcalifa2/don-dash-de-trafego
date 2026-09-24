'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileBarChart, RefreshCw, TrendingUp, AlertCircle, Moon, Sun, Settings2, Tv, Bell, BellOff, LogOut, Shield, ChevronDown, CalendarDays, DollarSign, Presentation } from 'lucide-react'
import { MetricTile } from '@/components/MetricTile'
import { DailyChart } from '@/components/DailyChart'
import { FunnelTab } from '@/components/FunnelTab'
import { SimuladorTab } from '@/components/SimuladorTab'
import { LeadsTab } from '@/components/LeadsTab'
import { MetricPicker, useSelectedMetrics } from '@/components/MetricPicker'
import { TvMode } from '@/components/TvMode'
import { ReportTab } from '@/components/ReportTab'
import { ReportStudioTab } from '@/components/ReportStudioTab'
import { CampaignsTab } from '@/components/CampaignsTab'
import { PulseLoader } from '@/components/PulseLoader'
import { StaffShell, STAFF_EVENT, type StaffAction } from '@/components/StaffShell'
import { AudienceTab } from '@/components/AudienceTab'
import { LeadToast } from '@/components/LeadToast'
import { BudgetPacingPopover } from '@/components/BudgetPacingPopover'
import { ClientGoalsTab } from '@/components/ClientGoalsTab'
import { CalendarViewModal } from '@/components/CalendarViewModal'
import { LeadsProvider, useLeadsData } from '@/lib/leadsContext'
import { useLeadAlerts } from '@/lib/useLeadAlerts'
import { isStale } from '@/lib/leadUtils'
import { apiFetch } from '@/lib/apiFetch'
import { useMetricsRealtime } from '@/lib/useMetricsRealtime'
import type { DatePreset, MetricsSummary } from '@/lib/meta'
import type { PlatformKey } from '@/lib/platforms'
import type { ReportMode } from '@/lib/report'
import { PlatformBadges } from '@/components/PlatformBadges'
import { OrganicTab } from '@/components/OrganicTab'
import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'

function getDashboardPresets(): { value: DatePreset; label: string }[] {
  const br = new Date(Date.now() - 3 * 3600 * 1000)
  const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const day = (yr: number, mo: number, d: number) => new Date(Date.UTC(yr, mo, d))

  const fmtMonthYear = (offset: number) => {
    const d = day(br.getUTCFullYear(), br.getUTCMonth() - offset, 1)
    return `${MONTHS_PT[d.getUTCMonth()]} / ${d.getUTCFullYear()}`
  }

  return [
    { value: 'today', label: 'Hoje' },
    { value: 'last_7d', label: '7 dias' },
    { value: 'last_14d', label: '14 dias' },
    { value: 'last_30d', label: '30 dias' },
    { value: 'this_month', label: `${MONTHS_PT[br.getUTCMonth()]} (Este mês)` },
    { value: 'last_month', label: `${fmtMonthYear(1)} (Mês passado)` },
    { value: 'month_2', label: fmtMonthYear(2) },
    { value: 'month_3', label: fmtMonthYear(3) },
  ]
}

const PRESETS = getDashboardPresets()

function fmt(v: number | null | undefined, currency: string) {
  if (v == null) return '—'
  const d = Math.abs(v) >= 1000 ? 0 : 2
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
}
function fmtCompact(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}
function fmtPct(v: number) { return `${v.toFixed(2)}%` }
function fmtX(v: number | null | undefined) { return v ? `${v.toFixed(2)}x` : '—' }
function fmtDec(v: number) { return v.toFixed(1) }

const LOWER_IS_BETTER = new Set([
  'cpc', 'cpm', 'cpl', 'cpa', 'frequency',
  'cost_per_engagement', 'cost_per_link_click', 'cost_per_conversation',
])

function buildTile(
  key: string,
  s: MetricsSummary,
  p: MetricsSummary | undefined,
  d: { spend: number[]; leads: number[]; cpl: number[]; impressions: number[]; ctr: number[] } | undefined,
  currency: string,
  kind: ResultKind = 'form',
): { label: string; value: string; spark?: number[]; cur?: number | null; prev?: number | null; lowerIsBetter?: boolean } | null {
  const lib = LOWER_IS_BETTER.has(key)
  const L = KIND_LABELS[kind]
  // Clientes de site/conversas: "Leads" e "CPL" mostram o resultado real da conta (o que ela de fato gera).
  if (kind !== 'form' && key === 'leads') return { label: L.many, value: fmtCompact(s.results), spark: d?.leads, cur: s.results, prev: p?.results }
  if (kind !== 'form' && key === 'cpl') return { label: L.cost, value: fmt(s.cost_per_result, currency), spark: undefined, cur: s.cost_per_result, prev: p?.cost_per_result, lowerIsBetter: true }
  switch (key) {
    case 'spend': return { label: 'Investimento', value: fmt(s.spend, currency), spark: d?.spend, cur: s.spend, prev: p?.spend }
    case 'cpc': return { label: 'CPC', value: fmt(s.cpc, currency), spark: undefined, cur: s.cpc, prev: p?.cpc, lowerIsBetter: lib }
    case 'cpm': return { label: 'CPM', value: fmt(s.cpm, currency), spark: undefined, cur: s.cpm, prev: p?.cpm, lowerIsBetter: lib }
    case 'cpl': return { label: 'CPL', value: fmt(s.cpl, currency), spark: d?.cpl, cur: s.cpl, prev: p?.cpl, lowerIsBetter: lib }
    case 'cpa': return { label: 'CPA', value: fmt(s.cpa, currency), spark: undefined, cur: s.cpa, prev: p?.cpa, lowerIsBetter: lib }
    case 'roas': return { label: 'ROAS', value: fmtX(s.roas), spark: undefined, cur: s.roas, prev: p?.roas }
    case 'cost_per_engagement': return { label: 'Custo/Eng.', value: fmt(s.cost_per_engagement, currency), spark: undefined, cur: s.cost_per_engagement, prev: p?.cost_per_engagement, lowerIsBetter: lib }
    case 'cost_per_link_click': return { label: 'Custo/Clique', value: fmt(s.cost_per_link_click, currency), spark: undefined, cur: s.cost_per_link_click, prev: p?.cost_per_link_click, lowerIsBetter: lib }
    case 'cost_per_conversation': return { label: 'Custo/Conv.', value: fmt(s.cost_per_conversation, currency), spark: undefined, cur: s.cost_per_conversation, prev: p?.cost_per_conversation, lowerIsBetter: lib }
    case 'impressions': return { label: 'Impressões', value: fmtCompact(s.impressions), spark: d?.impressions, cur: s.impressions, prev: p?.impressions }
    case 'reach': return { label: 'Alcance', value: fmtCompact(s.reach), spark: undefined, cur: s.reach, prev: p?.reach }
    case 'frequency': return { label: 'Frequência', value: fmtDec(s.frequency), spark: undefined, cur: s.frequency, prev: p?.frequency, lowerIsBetter: lib }
    case 'clicks': return { label: 'Cliques', value: fmtCompact(s.clicks), spark: undefined, cur: s.clicks, prev: p?.clicks }
    case 'unique_clicks': return { label: 'Cliques Únicos', value: fmtCompact(s.unique_clicks), spark: undefined, cur: s.unique_clicks, prev: p?.unique_clicks }
    case 'ctr': return { label: 'CTR', value: fmtPct(s.ctr), spark: d?.ctr, cur: s.ctr, prev: p?.ctr }
    case 'link_clicks': return { label: 'Cl. no Link', value: fmtCompact(s.link_clicks), spark: undefined, cur: s.link_clicks, prev: p?.link_clicks }
    case 'post_engagement': return { label: 'Engajamento', value: fmtCompact(s.post_engagement), spark: undefined, cur: s.post_engagement, prev: p?.post_engagement }
    case 'reactions': return { label: 'Reações', value: fmtCompact(s.reactions), spark: undefined, cur: s.reactions, prev: p?.reactions }
    case 'comments': return { label: 'Comentários', value: fmtCompact(s.comments), spark: undefined, cur: s.comments, prev: p?.comments }
    case 'video_views': return { label: 'Views de Vídeo', value: fmtCompact(s.video_views), spark: undefined, cur: s.video_views, prev: p?.video_views }
    case 'leads': return { label: 'Leads', value: fmtCompact(s.leads), spark: d?.leads, cur: s.leads, prev: p?.leads }
    case 'purchases': return { label: 'Compras', value: fmtCompact(s.purchases), spark: undefined, cur: s.purchases, prev: p?.purchases }
    case 'purchase_value': return { label: 'Valor Compras', value: fmt(s.purchase_value, currency), spark: undefined, cur: s.purchase_value, prev: p?.purchase_value }
    case 'landing_page_views': return { label: 'Visitas Página', value: fmtCompact(s.landing_page_views), spark: undefined, cur: s.landing_page_views, prev: p?.landing_page_views }
    case 'messaging_conversations': return { label: 'Conversas', value: fmtCompact(s.messaging_conversations), spark: undefined, cur: s.messaging_conversations, prev: p?.messaging_conversations }
    default: return null
  }
}

export default function MetaDashboard() {
  return (
    <LeadsProvider>
      <Dashboard />
    </LeadsProvider>
  )
}

function Dashboard() {
  const [preset, setPreset] = useState<DatePreset>('last_7d')
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [reportOpen, setReportOpen] = useState(false)
  const [tab, setTab] = useState<'metrics' | 'campaigns' | 'funnel' | 'audience' | 'organic' | 'simulator' | 'leads' | 'reports'>('metrics')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tv, setTv] = useState(false)
  const [me, setMe] = useState<{ slug: string; name: string; logoUrl: string | null; platforms?: PlatformKey[]; authEnabled: boolean; admin?: boolean; role?: string | null } | null>(null)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const leadsApi = useLeadsData()
  const alerts = useLeadAlerts(leadsApi.leads, !leadsApi.loading && !leadsApi.error)
  const staleCount = useMemo(() => leadsApi.leads.filter(l => isStale(l)).length, [leadsApi.leads])
  const [selectedMetrics, setSelectedMetrics] = useSelectedMetrics()
  // A sidebar da agência abre o Report Studio; o link de outra tela traz ?tab=reports.
  useEffect(() => {
    const onEvent = (e: Event) => { if ((e as CustomEvent<StaffAction>).detail === 'reports') setTab('reports') }
    window.addEventListener(STAFF_EVENT, onEvent)
    const q = new URLSearchParams(window.location.search).get('tab')
    if (q === 'reports') { setTab('reports'); window.history.replaceState(null, '', window.location.pathname) }
    return () => window.removeEventListener(STAFF_EVENT, onEvent)
  }, [])

  useEffect(() => {
    let saved: 'dark' | 'light' | null = null
    try { saved = localStorage.getItem('theme') as 'dark' | 'light' | null } catch { }
    const initial = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const presetMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!presetMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [presetMenuOpen])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tv') === '1') setTv(true)
  }, [])

  const [meLoaded, setMeLoaded] = useState(false)
  const [minTimeReady, setMinTimeReady] = useState(false)
  const [safetyReady, setSafetyReady] = useState(false)

  useEffect(() => {
    let alive = true
    apiFetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!alive) return
        if (j) { setMe(j); document.title = `Dashboard Don - ${j.name}` }
      })
      .catch(() => { })
      .finally(() => { if (alive) setMeLoaded(true) })

    // Garante que o loader fique tempo suficiente para renderizar a tela completa sem micro-flickers
    const timer = setTimeout(() => { if (alive) setMinTimeReady(true) }, 800)
    const safety = setTimeout(() => { if (alive) setSafetyReady(true) }, 3500)
    return () => { alive = false; clearTimeout(timer); clearTimeout(safety) }
  }, [])

  useEffect(() => {
    const iconUrl = me?.logoUrl || '/icon-32.png'
    const existing = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']")
    if (existing.length > 0) {
      existing.forEach(link => {
        link.href = iconUrl
      })
    } else {
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = iconUrl
      document.head.appendChild(link)
    }
  }, [me?.logoUrl])

  async function backToAdmin() {
    await fetch('/api/admin/view', { method: 'DELETE' }).catch(() => { })
    window.location.assign('/admin')
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { })
    window.location.href = me?.admin ? '/admin' : me?.slug ? `/login?c=${me.slug}` : '/login'
  }

  function enterTv() {
    setTv(true)
    window.history.replaceState(null, '', '?tv=1')
    try { document.documentElement.requestFullscreen?.() } catch { }
  }
  function exitTv() {
    setTv(false)
    window.history.replaceState(null, '', window.location.pathname)
    try { if (document.fullscreenElement) document.exitFullscreen() } catch { }
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next) } catch { }
  }

  const { data, error, isLoading, isValidating, mutate } = useMetricsRealtime(preset)
  const currency = data?.currency ?? 'BRL'
  const s = data?.summary
  const p = data?.summary_prev
  const d = data?.daily

  // Tipo de resultado estável por cliente: sem resultados no período, mantém o último detectado (evita abas piscando ao trocar o período).
  const detected: ResultKind = data?.result_kind ?? 'form'
  const hasResults = (s?.results ?? 0) > 0
  const [storedKind, setStoredKind] = useState<ResultKind | null>(null)
  const kindKey = `resultKind:${me?.slug ?? 'default'}`
  useEffect(() => {
    try {
      const v = localStorage.getItem(kindKey)
      if (v === 'form' || v === 'site' || v === 'conversa' || v === 'custom' || v === 'sales' || v === 'misto') setStoredKind(v as ResultKind)
    } catch { }
  }, [kindKey])
  useEffect(() => { if (hasResults) { setStoredKind(detected); try { localStorage.setItem(kindKey, detected) } catch { } } }, [hasResults, detected, kindKey])
  const kind: ResultKind = hasResults ? detected : (storedKind ?? detected)
  const showCrm = kind === 'form' || kind === 'misto' || leadsApi.leads.length > 0

  // Relatório: já montado fora da tela, abre a impressão só com ele. O nome do arquivo sugerido vira "Relatório - cliente - período".
  const printReport = useCallback(() => {
    const title = document.title
    document.title = `Relatório - ${me?.name ?? 'cliente'} - ${PRESETS.find(pr => pr.value === preset)?.label ?? ''}`
    document.body.classList.add('printing')
    const done = () => { document.body.classList.remove('printing'); document.title = title; setReportOpen(false); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    setTimeout(() => window.print(), 200)
  }, [me?.name, preset])

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await mutate()
    } finally {
      setTimeout(() => setRefreshing(false), 800)
    }
  }, [mutate])

  const tiles = useMemo(() => {
    if (!s) return []
    return selectedMetrics
      .map(key => {
        const t = buildTile(key, s, p, d, currency, kind)
        if (t && !t.spark) t.spark = d?.metrics?.[kind !== 'form' && key === 'leads' ? 'results' : key]
        return t
      })
      .filter(Boolean) as NonNullable<ReturnType<typeof buildTile>>[]
  }, [s, selectedMetrics, p, d, currency, kind])

  const hasEnvError = data?.error?.includes('META_ACCESS_TOKEN')

  const isInitialReady = safetyReady || (minTimeReady && meLoaded && (!isLoading || data != null || error != null))

  if (!isInitialReady) {
    return <PulseLoader fullscreen size={72} caption={me?.name ? `Carregando o painel de ${me.name}` : 'Carregando o painel'} />
  }

  return (
    <StaffShell>
    <div className="page page-ready">

      {me?.admin && (
        <div className="card no-print" style={{ padding: '8px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 14 }}>
          <Shield size={16} strokeWidth={1.75} color="var(--accent)" />
          <span style={{ flex: 1, minWidth: 200 }}>Visualizando <strong style={{ fontWeight: 600 }}>{me.name}</strong> como administrador</span>
          <button className="btn btn-outline btn-sm" onClick={backToAdmin}>Voltar para administração</button>
        </div>
      )}

      {/* Cabeçalho: bloco 56×56 + título 24 + subtítulo 14 */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          {me?.logoUrl ? (
            <img
              src={me.logoUrl}
              alt="Logo"
              style={{ height: 56, width: 'auto', maxWidth: 140, objectFit: 'contain', borderRadius: 'var(--radius-lg)' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: 'var(--accent-soft)', borderRadius: 'var(--radius-lg)', flexShrink: 0 }}>
              <TrendingUp size={28} color="var(--accent)" strokeWidth={1.75} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: 'var(--text-1)', margin: 0 }}>
              {me?.name ?? '\u00A0'}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6, minHeight: 22 }}>
              <PlatformBadges platforms={me?.platforms ?? []} />
              {data?.account_name && !data.is_mock && (
                <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--text-1)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                  {data.account_name}
                </span>
              )}
              {data?.is_mock && (
                <span className="badge" style={{ background: 'var(--amber-soft)', color: 'var(--text-1)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                  Demo · dados fictícios
                </span>
              )}
              {!isLoading && (
                <span className="badge" style={{ background: isValidating ? 'var(--accent-soft)' : 'var(--green-soft)', color: 'var(--text-1)' }}>
                  <span style={{ position: 'relative', width: 7, height: 7, flexShrink: 0 }}>
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isValidating ? 'var(--accent)' : 'var(--green)', animation: 'live-ping 1.4s ease-out infinite' }} />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: isValidating ? 'var(--accent)' : 'var(--green)' }} />
                  </span>
                  {isValidating ? 'Atualizando…' : 'Ao vivo'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Seletor de Período Único Dropdown */}
          <div ref={presetMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPresetMenuOpen(v => !v)}
              className="btn btn-outline btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 12px',
                height: 32,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-1)',
              }}
              title="Selecionar período"
              aria-expanded={presetMenuOpen}
              aria-haspopup="listbox"
            >
              <span>{PRESETS.find(p => p.value === (tab === 'organic' ? 'this_month' : preset))?.label ?? 'Período'}</span>
              <ChevronDown size={14} style={{ opacity: 0.7, transform: presetMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {presetMenuOpen && (
              <div
                role="listbox"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 100,
                  minWidth: 220,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  boxShadow: 'var(--shadow-soft)',
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {(tab === 'organic' ? PRESETS.filter(pr => pr.value === 'this_month') : PRESETS).map(pr => {
                  const active = (tab === 'organic' ? 'this_month' : preset) === pr.value
                  return (
                    <button
                      key={pr.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setPreset(pr.value)
                        setPresetMenuOpen(false)
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: active ? 700 : 500,
                        color: active ? 'var(--accent)' : 'var(--text-1)',
                        background: active ? 'var(--accent-soft)' : 'transparent',
                        borderRadius: 8,
                        marginTop: pr.value === 'this_month' ? 4 : 0,
                        borderTop: pr.value === 'this_month' ? '1px solid var(--border)' : 'none',
                        paddingTop: pr.value === 'this_month' ? 8 : 6,
                      }}
                    >
                      <span>{pr.label}</span>
                      {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="hdr-sep" style={{ width: 1, height: 24, background: 'var(--border)' }} />

          {/* Popover Ancorado de Ritmo de Verba (Budget Pacing) */}
          <BudgetPacingPopover
            campaigns={data?.campaigns || []}
            currentSpend={s?.spend || 0}
            currency={currency}
            clientSlug={me?.slug}
          />

          {/* Botão Calendário redondo igual aos outros */}
          <button
            onClick={() => setCalendarOpen(true)}
            title="Calendário de Performance"
            aria-label="Calendário de Performance"
            className="btn btn-outline btn-icon btn-sm"
          >
            <CalendarDays size={16} strokeWidth={1.75} />
          </button>

          <button onClick={() => setPickerOpen(true)} title="Personalizar métricas" aria-label="Personalizar métricas" className="btn btn-outline btn-icon btn-sm">
            <Settings2 size={16} strokeWidth={1.75} />
          </button>
          <button onClick={alerts.toggle} aria-pressed={alerts.enabled}
            title={alerts.enabled ? 'Alertas de lead novo ligados (som e notificação)' : 'Ligar som e notificação de lead novo'}
            aria-label="Alertas de lead novo" className="btn btn-outline btn-icon btn-sm">
            {alerts.enabled ? <Bell size={16} strokeWidth={1.75} color="var(--accent)" /> : <BellOff size={16} strokeWidth={1.75} />}
          </button>
          <button onClick={enterTv} title="Modo TV" aria-label="Modo TV" className="btn btn-outline btn-icon btn-sm">
            <Tv size={16} strokeWidth={1.75} />
          </button>
          <button onClick={toggleTheme} title="Alternar tema" aria-label="Alternar tema" className="btn btn-outline btn-icon btn-sm">
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </button>
          <button onClick={handleManualRefresh} disabled={isValidating || refreshing} title="Atualizar dados" aria-label="Atualizar dados" className="btn btn-outline btn-icon btn-sm">
            <RefreshCw size={16} strokeWidth={1.75} style={{ animation: (isValidating || refreshing) ? 'spin 1s linear infinite' : undefined }} />
          </button>
          {me?.authEnabled && (
            <button onClick={logout} title="Sair" aria-label="Sair" className="btn btn-ghost btn-icon btn-sm">
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="no-print" style={{ borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <div className="tabs" role="tablist" style={{ borderBottom: 'none', marginBottom: 0 }}>
          {([['metrics', 'Geral'], ['campaigns', 'Campanhas'], ['funnel', kind === 'form' ? 'Funil de Vendas' : 'Funil'], ['audience', 'Público'], ['organic', 'Orgânico'], ['simulator', 'Simulador'], ['leads', 'Leads'], ['reports', 'Report Studio']] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="tab">
              {label}
              {key === 'leads' && staleCount > 0 && (
                <span className="badge" title={`${staleCount} lead(s) sem contato`} style={{ marginLeft: 8, padding: '0 8px', background: 'var(--amber-soft)', color: 'var(--text-1)' }}>{staleCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Erro */}
      {(error || data?.error) && !data?.is_mock && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'var(--red-soft)', border: '1px solid hsl(0 84% 60% / .3)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 24 }}>
          <AlertCircle size={16} color="var(--red)" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)', marginBottom: 2 }}>
              {hasEnvError ? 'Configuração incompleta' : 'Erro ao buscar dados'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {data?.error ?? 'Não foi possível conectar com a Meta API.'}
              {hasEnvError && (
                <span> Adicione <code style={{ background: 'var(--bg-card2)', padding: '1px 6px', borderRadius: 4 }}>META_ACCESS_TOKEN</code> e <code style={{ background: 'var(--bg-card2)', padding: '1px 6px', borderRadius: 4 }}>META_AD_ACCOUNT_ID</code> no <code style={{ background: 'var(--bg-card2)', padding: '1px 6px', borderRadius: 4 }}>.env.local</code>.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {reportOpen && data && (
        <div className="print-report-root">
          <ReportTab data={data} preset={preset} presetLabel={PRESETS.find(pr => pr.value === preset)?.label ?? ''} clientName={me?.name ?? ''} kind={kind} showCrm={showCrm} onReady={printReport} />
        </div>
      )}

      {/* Funnel tab */}
      {!isLoading && tab === 'funnel' && s && <FunnelTab summary={s} currency={currency} kind={kind} />}
      {tab === 'campaigns' && <CampaignsTab campaigns={data?.campaigns ?? []} summary={s} summaryPrev={p} currency={currency} kind={kind} preset={preset} presetLabel={PRESETS.find(pr => pr.value === preset)?.label ?? ''} loading={isLoading} />}
      {tab === 'audience' && <AudienceTab preset={preset} presetLabel={PRESETS.find(pr => pr.value === preset)?.label ?? ''} kind={kind} />}
      {tab === 'organic' && <OrganicTab preset="this_month" presetLabel="Este mês" isStaff={!me?.authEnabled || !!me?.admin} canLink={me?.role === 'owner' || me?.role === 'admin'} slug={me?.slug} />}
      {tab === 'simulator' && <SimuladorTab summary={s ? (kind === 'form' ? s : { ...s, leads: s.results }) : undefined} currency={currency} />}
      {tab === 'leads' && <LeadsTab openId={openLeadId} onOpenConsumed={() => setOpenLeadId(null)} readOnly={me?.role === 'reader'} />}
      {tab === 'reports' && (
        <ReportStudioTab
          clientSlug={me?.slug || 'default'}
          clientName={me?.name || 'Cliente'}
          clientLogo={me?.logoUrl}
          isStaff={false} /* o estúdio do cliente é só para ver: criar, editar, apresentar e excluir é no Report Studio da administração */
          defaultPreset={preset === 'last_7d' ? 'last_7d' : preset === 'this_month' ? 'this_month' : 'last_month'}
        />
      )}
      {!isLoading && tab === 'funnel' && !s && !error && (
        <PulseLoader size={40} />
      )}

      {/* Loading skeleton (apenas se não houver dados anteriores) */}
      {isLoading && !s && tab === 'metrics' && (
        <div className="tile-grid" style={{ marginBottom: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: 16, minHeight: 100 }}>
              <div style={{ height: 10, width: '60%', background: 'var(--bg-card2)', borderRadius: 4, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: 24, width: '40%', background: 'var(--bg-card2)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
      )}



      {/* Metric tiles */}
      {s && tab === 'metrics' && (
        <>
          <div className="tile-grid" style={{ marginBottom: 4, opacity: isLoading ? 0.7 : 1, transition: 'opacity 0.2s' }}>
            {tiles.map((t) => (
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
          <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right', margin: '8px 0 24px' }}>
            ↑↓ vs período anterior equivalente
          </div>
        </>
      )}

      {/* Daily chart */}
      {!isLoading && d && tab === 'metrics' && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Evolução diária</div>
          <DailyChart daily={d} currency={currency} kind={kind} />
        </div>
      )}

      {/* Last update */}
      {data?.generated_at && !isLoading && tab === 'metrics' && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 24, textAlign: 'right' }}>
          Atualizado em {new Date(data.generated_at).toLocaleString('pt-BR')}{data.freshness ? '' : ' · atualiza a cada 1 min'}
          {data.freshness?.note && <div style={{ color: 'var(--amber)', marginTop: 4 }} role="status">{data.freshness.note}</div>}
        </div>
      )}





      {alerts.toast && (
        <LeadToast
          lead={alerts.toast.lead}
          extra={alerts.toast.extra}
          scale={tv ? Math.max(1, window.innerWidth / 1360) : 1}
          onView={tv ? undefined : () => { setTab('leads'); setOpenLeadId(alerts.toast!.lead.id); alerts.dismiss() }}
          onDismiss={alerts.dismiss}
        />
      )}

      {tv && (
        <TvMode
          data={data ?? null}
          summary={s}
          tiles={tiles}
          currency={currency}
          presetLabel={PRESETS.find(pr => pr.value === preset)?.label ?? ''}
          clientName={me?.name ?? ''}
          logoUrl={me?.logoUrl ?? undefined}
          onExit={exitTv}
          onToggleTheme={toggleTheme}
          staleCount={staleCount}
          kind={kind}
          showCrm={showCrm}
        />
      )}

      {/* Metric Picker modal */}
      {pickerOpen && (
        <MetricPicker
          selected={selectedMetrics}
          summary={s}
          currency={currency}
          onClose={(keys) => {
            setSelectedMetrics(keys)
            setPickerOpen(false)
          }}
        />
      )}

      {/* Calendar View Modal */}
      {calendarOpen && (
        <CalendarViewModal
          onClose={() => setCalendarOpen(false)}
          daily={d}
          currency={currency}
          kind={kind}
          leads={leadsApi.leads}
        />
      )}
    </div>
    </StaffShell>
  )
}
