'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileBarChart,
  Plus,
  Play,
  Download,
  Trash2,
  Calendar,
  FileText,
  Sparkles,
  AlertCircle,
  Loader2,
  ChevronDown,
  Presentation,
  Check,
  RotateCcw,
} from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { ReportMode, ReportPreset, SavedReport, SavedReportSummary } from '@/lib/report'
import { ReportStudio } from '@/components/ReportStudio'
import { buildSlides } from '@/lib/reportSlides'

interface ReportStudioTabProps {
  clientSlug: string
  clientName: string
  clientLogo?: string | null
  isStaff: boolean
  defaultPreset?: ReportPreset
}

const PRESET_LABELS: Record<string, string> = {
  last_month: 'Mês Passado',
  this_month: 'Este Mês',
  last_7d: 'Últimos 7 dias',
}

const MODE_LABELS: Record<ReportMode, { label: string; desc: string }> = {
  standard: { label: 'Padrão', desc: 'Visão executiva com KPIs e criativos (9 slides)' },
  advanced: { label: 'Avançado', desc: 'Completo com público, plataformas e funil (11 slides)' },
  organic: { label: 'Orgânico', desc: 'Exclusivo para engajamento e Instagram/Facebook (10 slides)' },
}

function fmtMoney(v?: number): string {
  if (v == null || !isFinite(v)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function fmtCount(v?: number): string {
  if (v == null || !isFinite(v)) return '—'
  return new Intl.NumberFormat('pt-BR').format(Math.round(v))
}

export function ReportStudioTab({
  clientSlug,
  clientName,
  clientLogo,
  isStaff,
  defaultPreset = 'last_month',
}: ReportStudioTabProps) {
  const [reports, setReports] = useState<SavedReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [filterPreset, setFilterPreset] = useState<'all' | 'last_month' | 'this_month' | 'last_7d'>('all')

  // Menu de Novo Relatório
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)

  // Studio ativo (para criar novo ou abrir salvo)
  const [studioConfig, setStudioConfig] = useState<{
    open: boolean
    savedReport?: SavedReport | null
    preset?: ReportPreset
    mode?: ReportMode
    readOnly?: boolean
  }>({ open: false })

  const [loadingReportId, setLoadingReportId] = useState<string | null>(null)
  const [downloadingPptxId, setDownloadingPptxId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!newMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [newMenuOpen])

  // Busca lista de relatórios salvos
  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/report/saved')
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Não foi possível carregar a biblioteca de relatórios.')
      }
      const data = await res.json()
      setReports(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  // Abrir relatório salvo na íntegra
  const openSavedReport = async (summary: SavedReportSummary) => {
    setLoadingReportId(summary.id)
    try {
      const res = await apiFetch(`/api/report/saved?id=${summary.id}`)
      if (!res.ok) {
        alert('Não foi possível abrir este relatório salvo.')
        return
      }
      const full: SavedReport = await res.json()
      setStudioConfig({
        open: true,
        savedReport: full,
        preset: full.preset,
        mode: full.mode,
        readOnly: !isStaff,
      })
    } finally {
      setLoadingReportId(null)
    }
  }

  // Criar novo relatório ao vivo
  const openNewReport = (preset: ReportPreset, mode: ReportMode) => {
    setNewMenuOpen(false)
    setStudioConfig({
      open: true,
      savedReport: null,
      preset,
      mode,
      readOnly: false,
    })
  }

  // Download PPTX direto do card
  const downloadPptxFromCard = async (summary: SavedReportSummary) => {
    setDownloadingPptxId(summary.id)
    try {
      const res = await apiFetch(`/api/report/saved?id=${summary.id}`)
      if (!res.ok) throw new Error('Falha ao baixar dados do relatório')
      const full: SavedReport = await res.json()
      const slides = buildSlides(full.snapshot.data, full.snapshot.notes, full.mode, full.theme)
      const fileName = `Relatorio-${full.mode}-${full.periodKey}-${clientName.replace(/[^\w]/g, '_')}`
      const { downloadPptx } = await import('@/lib/reportPptx')
      await downloadPptx(slides, fileName)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar PowerPoint')
    } finally {
      setDownloadingPptxId(null)
    }
  }

  // Excluir relatório
  const handleDeleteReport = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await apiFetch(`/api/report/saved?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Não foi possível excluir o relatório')
      setReports(prev => prev.filter(r => r.id !== id))
      setDeleteConfirmId(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir relatório')
    } finally {
      setDeletingId(null)
    }
  }

  // Filtragem
  const filteredReports = useMemo(() => {
    if (filterPreset === 'all') return reports
    return reports.filter(r => r.preset === filterPreset)
  }, [reports, filterPreset])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* Studio Banner / Hero Header */}
      <div
        className="card"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card2) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20,
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 260 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.24) 100%)',
              border: '1px solid rgba(99,102,241,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <Presentation size={28} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
                Report Studio
              </h2>
              <span
                className="badge"
                style={{
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  fontWeight: 700,
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                PRO
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.4 }}>
              Gere apresentações dinâmicas, personalize análises e acesse o histórico completo de relatórios de {clientName}.
            </p>
          </div>
        </div>

        {/* Botão de Criação para a Equipe */}
        {isStaff && (
          <div ref={newMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
              }}
              onClick={() => setNewMenuOpen(o => !o)}
              aria-expanded={newMenuOpen}
              aria-haspopup="menu"
            >
              <Plus size={16} strokeWidth={2.2} />
              <span>Gerar Novo Relatório</span>
              <ChevronDown size={14} style={{ transform: newMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
            </button>

            {newMenuOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 290,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  boxShadow: 'var(--shadow-elegant)',
                  padding: 8,
                  zIndex: 60,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>
                  Formato de Apresentação
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', height: 'auto', borderRadius: 10 }}
                  onClick={() => openNewReport(defaultPreset, 'standard')}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Apresentação Padrão</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>9 slides · KPIs executivos, campanhas e criativos</div>
                  </div>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', height: 'auto', borderRadius: 10 }}
                  onClick={() => openNewReport(defaultPreset, 'advanced')}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Relatório Avançado</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>11 slides · Inclui funil de vendas, plataformas e público</div>
                  </div>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', height: 'auto', borderRadius: 10 }}
                  onClick={() => openNewReport('this_month', 'organic')}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Relatório Orgânico</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>10 slides · Instagram e Facebook orgânico completo</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mini KPIs & Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[
            { id: 'all' as const, label: 'Todos' },
            { id: 'last_month' as const, label: 'Mês Passado' },
            { id: 'this_month' as const, label: 'Este Mês' },
            { id: 'last_7d' as const, label: 'Últimos 7 dias' },
          ].map(f => {
            const active = filterPreset === f.id
            return (
              <button
                key={f.id}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                }}
                onClick={() => setFilterPreset(f.id)}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
          {filteredReports.length} {filteredReports.length === 1 ? 'relatório disponível' : 'relatórios disponíveis'}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--red-soft)', padding: 14, borderRadius: 12, border: '1px solid hsl(0 84% 60% / .3)', color: 'var(--red)', fontSize: 13 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={loadReports} style={{ marginLeft: 'auto', height: 26, fontSize: 11 }}>
            <RotateCcw size={12} /> Tentar novamente
          </button>
        </div>
      )}

      {/* Estado de Carregamento Inicial */}
      {loading && !reports.length && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 12 }}>
          <Loader2 size={28} className="spin" color="var(--accent)" />
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Carregando biblioteca do Report Studio…</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredReports.length === 0 && (
        <div
          className="card"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            borderRadius: 18,
            border: '1.5px dashed var(--border)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--bg-card2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-3)',
            }}
          >
            <FileBarChart size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>
            Nenhum relatório arquivado ainda
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 440, margin: 0, lineHeight: 1.5 }}>
            {isStaff
              ? 'Gere o primeiro relatório da conta agora para criar uma apresentação executiva para seu cliente e arquivá-la no Studio.'
              : 'Assim que a equipe da agência publicar os relatórios de performance, eles estarão disponíveis aqui para você assistir e baixar.'}
          </p>
          {isStaff && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginTop: 8, height: 36, padding: '0 16px', borderRadius: 10 }}
              onClick={() => openNewReport(defaultPreset, 'standard')}
            >
              <Plus size={15} />
              <span>Gerar Primeiro Relatório</span>
            </button>
          )}
        </div>
      )}

      {/* Galeria de Relatórios Salvos (Grid de Cards) */}
      {!loading && filteredReports.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {filteredReports.map(rep => {
            const isLoadingThis = loadingReportId === rep.id
            const isDownloadingPptx = downloadingPptxId === rep.id
            const isDeleting = deletingId === rep.id
            const isConfirmingDelete = deleteConfirmId === rep.id

            return (
              <div
                key={rep.id}
                className="card"
                style={{
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--bg-card)',
                  boxShadow: 'var(--shadow-soft)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Capa em miniatura com branding */}
                <div
                  style={{
                    height: 140,
                    background: rep.theme === 'dark'
                      ? 'linear-gradient(135deg, #0B0B14 0%, #17172A 100%)'
                      : 'linear-gradient(135deg, #F8FAFC 0%, #EEF2F6 100%)',
                    borderBottom: '1px solid var(--border-soft)',
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {clientLogo ? (
                      <img
                        src={clientLogo}
                        alt={clientName}
                        style={{ maxHeight: 28, maxWidth: 100, objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700, color: rep.theme === 'dark' ? '#F8FAFC' : '#0F172A' }}>
                        {clientName}
                      </span>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(99,102,241,0.15)',
                          color: 'var(--accent)',
                          fontWeight: 700,
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 999,
                        }}
                      >
                        {MODE_LABELS[rep.mode]?.label || 'Padrão'}
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: rep.theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                          color: rep.theme === 'dark' ? '#E2E8F0' : '#475569',
                          fontWeight: 600,
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 999,
                        }}
                      >
                        {rep.slidesCount} slides
                      </span>
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: rep.theme === 'dark' ? '#FFFFFF' : '#0F172A',
                        lineHeight: 1.25,
                      }}
                    >
                      {rep.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: rep.theme === 'dark' ? '#94A3B8' : '#64748B',
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Calendar size={11} />
                      <span>{rep.periodLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Corpo do card: Métricas do relatório */}
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rep.kpis && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {rep.kpis.spend != null && (
                        <div style={{ background: 'var(--bg-card2)', padding: '4px 10px', borderRadius: 8, fontSize: 11 }}>
                          <span style={{ color: 'var(--text-3)' }}>Investimento: </span>
                          <strong style={{ color: 'var(--text-1)' }}>{fmtMoney(rep.kpis.spend)}</strong>
                        </div>
                      )}
                      {rep.kpis.results != null && (
                        <div style={{ background: 'var(--bg-card2)', padding: '4px 10px', borderRadius: 8, fontSize: 11 }}>
                          <span style={{ color: 'var(--text-3)' }}>Resultados: </span>
                          <strong style={{ color: 'var(--text-1)' }}>{fmtCount(rep.kpis.results)}</strong>
                        </div>
                      )}
                      {rep.kpis.cpl != null && (
                        <div style={{ background: 'var(--bg-card2)', padding: '4px 10px', borderRadius: 8, fontSize: 11 }}>
                          <span style={{ color: 'var(--text-3)' }}>CPL: </span>
                          <strong style={{ color: 'var(--green)' }}>{fmtMoney(rep.kpis.cpl)}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Publicado em {new Date(rep.createdAt).toLocaleDateString('pt-BR')}</span>
                    {rep.author && <span>por {rep.author}</span>}
                  </div>
                </div>

                {/* Rodapé com Ações */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderTop: '1px solid var(--border-soft)',
                    background: 'var(--bg-card2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1, height: 32, fontSize: 12, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => openSavedReport(rep)}
                    disabled={isLoadingThis}
                  >
                    {isLoadingThis ? <Loader2 size={13} className="spin" /> : <Play size={13} fill="currentColor" />}
                    <span>{isLoadingThis ? 'Abrindo…' : 'Abrir Apresentação'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ height: 32, padding: '0 10px', fontSize: 11, borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => downloadPptxFromCard(rep)}
                    disabled={isDownloadingPptx}
                    title="Baixar apresentação em PowerPoint (.pptx)"
                  >
                    {isDownloadingPptx ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                    <span>PPTX</span>
                  </button>

                  {/* Excluir para Staff */}
                  {isStaff && (
                    <div style={{ position: 'relative' }}>
                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ height: 32, padding: '0 8px', fontSize: 11, borderRadius: 8 }}
                            onClick={() => handleDeleteReport(rep.id)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? <Loader2 size={12} className="spin" /> : 'Confirmar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ height: 32, padding: '0 6px', fontSize: 11 }}
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          style={{ width: 32, height: 32, color: 'var(--text-3)' }}
                          onClick={() => setDeleteConfirmId(rep.id)}
                          title="Excluir relatório arquivado"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Renderiza o ReportStudio em modo tela cheia quando aberto */}
      {studioConfig.open && (
        <ReportStudio
          onClose={() => setStudioConfig({ open: false })}
          initialPreset={studioConfig.preset || defaultPreset}
          initialMode={studioConfig.mode || 'standard'}
          savedReport={studioConfig.savedReport}
          readOnly={studioConfig.readOnly}
          onSaveSuccess={() => {
            loadReports()
          }}
        />
      )}
    </div>
  )
}

