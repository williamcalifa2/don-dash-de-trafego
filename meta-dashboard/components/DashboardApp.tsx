'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileBarChart, RefreshCw, TrendingUp, AlertCircle, Moon, Sun, Settings2, Tv, Bell, BellOff, LogOut, Shield, ChevronDown } from 'lucide-react'
import { MetricTile } from '@/components/MetricTile'
import { CampaignTable } from '@/components/CampaignTable'
import { DailyChart } from '@/components/DailyChart'
import { FunnelTab } from '@/components/FunnelTab'
import { SimuladorTab } from '@/components/SimuladorTab'
import { LeadsTab } from '@/components/LeadsTab'
import { MetricPicker, useSelectedMetrics } from '@/components/MetricPicker'
import { TvMode } from '@/components/TvMode'
import { RetornoTab } from '@/components/RetornoTab'
import { ReportTab } from '@/components/ReportTab'
import { ReportStudio } from '@/components/ReportStudio'
import { LeadToast } from '@/components/LeadToast'
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
import { AudienceTab } from '@/components/AudienceTab'

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'last_7d', label: '7 dias' },
  { value: 'last_14d', label: '14 dias' },
  { value: 'last_30d', label: '30 dias' },
  { value: 'this_month', label: 'Este mês' },
]

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
  const [monthlyOpen, setMonthlyOpen] = useState(false)
  const [monthlyMode, setMonthlyMode] = useState<ReportMode>('standard')
  const [tab, setTab] = useState<'metrics' | 'funnel' | 'audience' | 'organic' | 'retorno' | 'simulator' | 'leads'>('metrics')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tv, setTv] = useState(false)
  const [me, setMe] = useState<{ slug: string; name: string; logoUrl: string | null; platforms?: PlatformKey[]; authEnabled: boolean; admin?: boolean; role?: string | null } | null>(null)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const leadsApi = useLeadsData()
  const alerts = useLeadAlerts(leadsApi.leads, !leadsApi.loading && !leadsApi.error)
  const staleCount = leadsApi.leads.filter(l => isStale(l)).length
  const [selectedMetrics, setSelectedMetrics] = useSelectedMetrics()

  useEffect(() => {
    let saved: 'dark' | 'light' | null = null
    try { saved = localStorage.getItem('theme') as 'dark' | 'light' | null } catch { }
    const initial = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const [reportMenuOpen, setReportMenuOpen] = useState(false)
  const reportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reportMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) {
        setReportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [reportMenuOpen])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tv') === '1') setTv(true)
  }, [])

  useEffect(() => {
    apiFetch('/api/me').then(r => r.ok ? r.json() : null).then(j => { if (j) { setMe(j); document.title = `Dashboard Don - ${j.name}` } }).catch(() => { })
  }, [])

  useEffect(() => {
    const iconUrl = me?.logoUrl || '/api/brand/icon'
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
  useEffect(() => { try { const v = localStorage.getItem(kindKey); if (v === 'form' || v === 'site' || v === 'conversa' || v === 'misto') setStoredKind(v) } catch { } }, [kindKey])
  useEffect(() => { try { const v = localStorage.getItem(kindKey); if (v === 'form' || v === 'site' || v === 'conversa' || v === 'custom' || v === 'sales' || v === 'misto') setStoredKind(v) } catch { } }, [kindKey])
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
  // Se a aba aberta deixou de existir para este cliente, volta para as métricas.
  useEffect(() => { if (!showCrm && tab === 'retorno') setTab('metrics') }, [showCrm, tab])
  // O Simulador ainda é só do administrador; o cliente não vê a aba nem abre por outro caminho.
  useEffect(() => { if (tab === 'simulator' && me && !me.admin) setTab('metrics') }, [tab, me])

  const tiles = s
    ? selectedMetrics
      .map(key => {
        const t = buildTile(key, s, p, d, currency, kind)
        if (t && !t.spark) t.spark = d?.metrics?.[kind !== 'form' && key === 'leads' ? 'results' : key]
        return t
      })
      .filter(Boolean) as NonNullable<ReturnType<typeof buildTile>>[]
    : []

  const hasEnvError = data?.error?.includes('META_ACCESS_TOKEN')

  return (
    <div className="page">

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
                  {isValidating ? 'Atualizando…' : 'Ao vivo · 5 min'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {/* O orgânico só tem "Este mês": os dados são coletados uma vez por dia e não há atualização manual. */}
            {(tab === 'organic' ? PRESETS.filter(pr => pr.value === 'this_month') : PRESETS).map((pr) => (
              <button key={pr.value} onClick={() => setPreset(pr.value)} aria-pressed={tab === 'organic' ? true : undefined}
                className={`btn btn-sm ${preset === pr.value || tab === 'organic' ? 'btn-primary' : 'btn-outline'}`}>
                {pr.label}
              </button>
            ))}
          </div>

          <div className="hdr-sep" style={{ width: 1, height: 24, background: 'var(--border)' }} />

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
          <button onClick={() => mutate()} disabled={isValidating} className="btn btn-soft btn-sm">
            <RefreshCw size={16} strokeWidth={1.75} style={{ animation: isValidating ? 'spin 1s linear infinite' : undefined }} />
            Atualizar
          </button>
          {me?.authEnabled && (
            <button onClick={logout} title="Sair" aria-label="Sair" className="btn btn-ghost btn-icon btn-sm">
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Abas sublinhadas com Ações de Relatório */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="tabs" role="tablist" style={{ borderBottom: 'none', marginBottom: 0 }}>
          {([['metrics', 'Métricas'], ['funnel', kind === 'form' ? 'Funil de Vendas' : 'Funil'], ['audience', 'Público'], ['organic', 'Orgânico'], ['retorno', 'Retorno'], ['simulator', 'Simulador'], ['leads', 'Leads']] as const).filter(([key]) => (showCrm || key !== 'retorno') && (key !== 'simulator' || !!me?.admin)).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="tab">
              {label}
              {key === 'leads' && staleCount > 0 && (
                <span className="badge" title={`${staleCount} lead(s) sem contato`} style={{ marginLeft: 8, padding: '0 8px', background: 'var(--amber-soft)', color: 'var(--text-1)' }}>{staleCount}</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
          <div ref={reportMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => { setMonthlyMode('standard'); setMonthlyOpen(true); setReportMenuOpen(false) }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: 'none',
              }}
              title="Gerar Apresentação PPTX (Padrão)"
            >
              <FileBarChart size={16} strokeWidth={1.75} />
              <span>Apresentação PPTX</span>
            </button>
            <button
              className="btn btn-outline btn-sm btn-icon"
              onClick={() => setReportMenuOpen(v => !v)}
              aria-expanded={reportMenuOpen}
              aria-haspopup="menu"
              aria-label="Opções de relatório PPTX"
              style={{
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                padding: '0 8px',
              }}
              title="Ver opções de relatório (Padrão ou Avançado)"
            >
              <ChevronDown
                size={14}
                strokeWidth={2}
                style={{
                  transform: reportMenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s ease',
                }}
              />
            </button>

            {reportMenuOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  zIndex: 50,
                  minWidth: 270,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.35)',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <button
                  role="menuitem"
                  onClick={() => { setMonthlyMode('standard'); setMonthlyOpen(true); setReportMenuOpen(false) }}
                  className="btn btn-ghost btn-sm"
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    padding: '8px 10px',
                    height: 'auto',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>Apresentação Padrão</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>8 slides · Resumo executivo tradicional</span>
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                <button
                  role="menuitem"
                  onClick={() => { setMonthlyMode('advanced'); setMonthlyOpen(true); setReportMenuOpen(false) }}
                  className="btn btn-ghost btn-sm"
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    padding: '8px 10px',
                    height: 'auto',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>Relatório Avançado</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>11 slides · Funil, público e campanhas</span>
                </button>
              </div>
            )}
          </div>

          <button className="btn btn-outline btn-sm" onClick={() => setReportOpen(true)} disabled={reportOpen || !data}>
            <Download size={16} strokeWidth={1.75} /> {reportOpen ? 'Preparando…' : 'Baixar relatório'}
          </button>
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
      {tab === 'audience' && <AudienceTab preset={preset} presetLabel={PRESETS.find(pr => pr.value === preset)?.label ?? ''} kind={kind} />}
      {tab === 'organic' && <OrganicTab preset="this_month" presetLabel="Este mês" canLink={me?.role === 'owner' || me?.role === 'admin'} slug={me?.slug} />}
      {tab === 'simulator' && me?.admin && <SimuladorTab summary={s ? (kind === 'form' ? s : { ...s, leads: s.results }) : undefined} currency={currency} />}
      {tab === 'retorno' && <RetornoTab preset={preset} presetLabel={PRESETS.find(pr => pr.value === preset)?.label ?? ''} />}
      {tab === 'leads' && <LeadsTab openId={openLeadId} onOpenConsumed={() => setOpenLeadId(null)} readOnly={me?.role === 'reader'} />}
      {!isLoading && tab === 'funnel' && !s && !error && (
        <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 40 }}>Carregando dados...</div>
      )}

      {/* Loading skeleton */}
      {isLoading && tab === 'metrics' && (
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
      {!isLoading && s && tab === 'metrics' && (
        <div className="tile-grid stagger" style={{ marginBottom: 4 }}>
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
      )}
      {!isLoading && s && tab === 'metrics' && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'right', margin: '8px 0 24px' }}>
          ↑↓ vs período anterior equivalente
        </div>
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


      {/* Campaigns table */}
      {!isLoading && data?.campaigns && tab === 'metrics' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <CampaignTable campaigns={data.campaigns} currency={currency} datePreset={preset} kind={kind} />
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

      {monthlyOpen && (
        <ReportStudio
          onClose={() => setMonthlyOpen(false)}
          initialPreset={preset === 'last_7d' ? 'last_7d' : 'last_month'}
          initialMode={monthlyMode}
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
    </div>
  )
}
