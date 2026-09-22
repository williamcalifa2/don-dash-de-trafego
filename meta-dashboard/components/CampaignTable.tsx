'use client'

import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'
import { ConversionChips } from '@/components/ConversionsCard'
import { Fragment, useState, useCallback } from 'react'
import { ChevronRight, ExternalLink, X, ArrowUpDown, ArrowUp, ArrowDown, Activity } from 'lucide-react'
import { resolveDelivery, type CampaignRow, type ConversionItem } from '@/lib/meta'
import { apiFetch } from '@/lib/apiFetch'
import { previewSrc } from '@/lib/adPreview'
import { analyzeFatigue } from '@/lib/creativeFatigue'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  ACTIVE: { label: 'Ativo', color: 'var(--green)', bg: 'var(--green-soft)', dot: 'var(--green)' },
  PAUSED: { label: 'Pausado', color: 'var(--red)', bg: 'var(--red-soft)', dot: 'var(--red)' },
  DELETED: { label: 'Deletado', color: 'var(--red)', bg: 'var(--red-soft)', dot: 'var(--red)' },
  ARCHIVED: { label: 'Arquivado', color: 'var(--text-2)', bg: 'var(--bg-card2)', dot: 'var(--text-2)' },
  IN_PROCESS: { label: 'Aprendizado', color: 'var(--amber)', bg: 'var(--amber-soft)', dot: 'var(--amber)' },
  WITH_ISSUES: { label: 'Com erros', color: 'var(--amber)', bg: 'var(--amber-soft)', dot: 'var(--amber)' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'var(--text-2)', bg: 'var(--bg-card2)', dot: 'var(--text-2)' }
  return (
    <span className="badge" style={{ color: s.color, background: s.bg }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

function fmt(v: number, currency: string) {
  const d = Math.abs(v) >= 1000 ? 0 : 2
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
}
function fmtSmall(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

type SortCol = 'name' | 'spend' | 'leads' | 'cpl' | 'roas' | 'ctr' | 'frequency'
type SortDir = 'asc' | 'desc'

interface AdSet {
  id: string; name: string; status: string; spend: number
  impressions: number; clicks: number; ctr: number; frequency: number; leads: number; cpl: number | null; results?: number; cost_per_result?: number | null
  conversions?: ConversionItem[]
}

interface Ad {
  id: string; name: string; status: string; thumb: string; creative_name: string
  object_type: string; spend: number; impressions: number; clicks: number; ctr?: number; frequency?: number; leads: number; cpl: number | null; results?: number; cost_per_result?: number | null
  conversions?: ConversionItem[]
}

interface CampaignTableProps {
  campaigns: CampaignRow[]
  currency: string
  datePreset?: string
  kind?: ResultKind
}

export function CampaignTable({ campaigns, currency, datePreset = 'last_7d', kind = 'form' }: CampaignTableProps) {
  const L = KIND_LABELS[kind]
  // Clientes de site/conversas: as colunas de lead/CPL mostram o resultado real (conversas, leads do site ou resultados).
  const nRes = (r: { leads: number; results?: number }) => (kind === 'form' ? r.leads : (r.results ?? 0))
  const cRes = (r: { cpl: number | null; cost_per_result?: number | null }) => (kind === 'form' ? r.cpl : (r.cost_per_result ?? null))
  const [sortCol, setSortCol] = useState<SortCol>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null)
  const [adsetData, setAdsetData] = useState<Record<string, AdSet[]>>({})
  const [loadingAdset, setLoadingAdset] = useState<string | null>(null)
  const [expandedAdset, setExpandedAdset] = useState<string | null>(null)
  const [adsData, setAdsData] = useState<Record<string, Ad[]>>({})
  const [loadingAds, setLoadingAds] = useState<string | null>(null)
  const [creativeModal, setCreativeModal] = useState<Ad | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const toggleCampaign = useCallback(async (id: string) => {
    if (expandedCampaign === id) { setExpandedCampaign(null); return }
    setExpandedCampaign(id)
    if (adsetData[id]) return
    setLoadingAdset(id)
    try {
      const res = await apiFetch(`/api/meta/campaign/${id}?date_preset=${datePreset}`)
      const json = await res.json() as { adsets?: AdSet[] }
      setAdsetData(d => ({ ...d, [id]: json.adsets ?? [] }))
    } catch { }
    setLoadingAdset(null)
  }, [expandedCampaign, adsetData, datePreset])

  const toggleAdset = useCallback(async (adsetId: string) => {
    if (expandedAdset === adsetId) { setExpandedAdset(null); return }
    setExpandedAdset(adsetId)
    if (adsData[adsetId]) return
    setLoadingAds(adsetId)
    try {
      const res = await apiFetch(`/api/meta/adset/${adsetId}?date_preset=${datePreset}`)
      const json = await res.json() as { ads?: Ad[] }
      setAdsData(d => ({ ...d, [adsetId]: json.ads ?? [] }))
    } catch { }
    setLoadingAds(null)
  }, [expandedAdset, adsData, datePreset])

  const statuses = ['ALL', ...Array.from(new Set(campaigns.map(c => c.status)))]

  const sorted = [...campaigns]
    .filter(c => filterStatus === 'ALL' || c.status === filterStatus)
    .sort((a, b) => {
      let av: number | string, bv: number | string
      if (sortCol === 'name') { av = a.name; bv = b.name }
      else if (sortCol === 'spend') { av = a.spend; bv = b.spend }
      else if (sortCol === 'leads') { av = resolveDelivery(a, kind).count; bv = resolveDelivery(b, kind).count }
      else if (sortCol === 'cpl') { av = resolveDelivery(a, kind).cost ?? Infinity; bv = resolveDelivery(b, kind).cost ?? Infinity }
      else if (sortCol === 'roas') { av = a.roas ?? -1; bv = b.roas ?? -1 }
      else if (sortCol === 'ctr') { av = a.ctr; bv = b.ctr }
      else { av = a.frequency; bv = b.frequency }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

  function sortIcon(col: SortCol) {
    if (sortCol !== col) return <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
    return sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
  }

  const thStyle = (col: SortCol, right = false): React.CSSProperties => ({
    padding: '12px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
    textTransform: 'uppercase', color: 'var(--text-2)',
    textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none', background: 'var(--bg-card2)',
    borderBottom: '1px solid var(--border)',
  })

  if (!campaigns.length) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      Nenhuma campanha encontrada no período.
    </div>
  )

  return (
    <div>
      {/* Unified header: title + filters + count */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--border-soft)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginRight: 4 }}>Campanhas</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {statuses.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 9999, cursor: 'pointer',
              border: '1px solid',
              borderColor: filterStatus === s ? 'var(--accent-glow)' : 'var(--border)',
              background: filterStatus === s ? 'var(--accent-soft)' : 'transparent',
              color: filterStatus === s ? 'var(--accent)' : 'var(--text-2)',
              transition: 'all .2s',
            }}>
              {s === 'ALL' ? 'Todas' : (STATUS_MAP[s]?.label ?? s)}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          {sorted.length} campanha{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 760 }}>
          <thead>
            <tr>
              <th style={thStyle('name')} onClick={() => handleSort('name')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Campanha {sortIcon('name')}</span>
              </th>
              <th style={{ ...thStyle('spend'), textAlign: 'left' }}>Status</th>
              {(['spend', 'leads', 'cpl', 'roas', 'ctr', 'frequency'] as SortCol[]).map(col => (
                <th key={col} style={thStyle(col, true)} onClick={() => handleSort(col)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', width: '100%' }}>
                    {col === 'frequency' ? 'Freq.' : col === 'leads' ? L.many.toUpperCase() : col === 'cpl' ? L.cost.toUpperCase() : col.toUpperCase()} {sortIcon(col)}
                    {col === 'frequency'
                      ? 'Freq.'
                      : col === 'leads'
                        ? (kind === 'form' ? 'RESULTADOS / LEADS' : L.many.toUpperCase())
                        : col === 'cpl'
                          ? (kind === 'form' ? 'CUSTO / RES.' : L.cost.toUpperCase())
                          : col.toUpperCase()} {sortIcon(col)}
                  </span>
                </th>
              ))}
              <th style={{ ...thStyle('spend'), textAlign: 'center' }}>↓</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => {
              const isExpanded = expandedCampaign === c.id
              const adsets = adsetData[c.id]
              const isLoading = loadingAdset === c.id
              const delivery = resolveDelivery(c, kind)
              return (
                <Fragment key={c.id}>
                  <tr
                    style={{ background: isExpanded ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', transition: 'background-color .2s' }}
                    onClick={() => toggleCampaign(c.id)}
                    onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card2)' }}
                    onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td style={{ padding: '12px 16px', borderBottom: isExpanded ? 'none' : '1px solid var(--border-soft)', color: 'var(--text-1)', fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--accent)', transition: 'transform .15s', display: 'inline-flex', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                          <ChevronRight size={13} />
                        </span>
                        {c.name}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: isExpanded ? 'none' : '1px solid var(--border-soft)' }}>
                      <StatusBadge status={c.status} />
                    </td>
                    <NumCell>{fmt(c.spend, currency)}</NumCell>
                    <NumCell>{nRes(c) || '—'}</NumCell>
                    <NumCell color={kind === 'form' && c.cpl && c.cpl > 200 ? 'var(--red)' : undefined}>{cRes(c) ? fmtSmall(cRes(c)!, currency) : '—'}</NumCell>
                    <NumCell>
                      {delivery.count > 0 ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
                          <span>{delivery.count.toLocaleString('pt-BR')}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>{delivery.label}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </NumCell>
                    <NumCell color={delivery.type === 'form' && delivery.cost && delivery.cost > 200 ? 'var(--red)' : undefined}>
                      {delivery.cost != null && delivery.cost > 0 ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
                          <span>{fmtSmall(delivery.cost, currency)}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>{delivery.costLabel}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </NumCell>
                    <NumCell color={c.roas && c.roas >= 3 ? 'var(--green)' : c.roas && c.roas < 1.5 ? 'var(--red)' : undefined}>{c.roas ? `${c.roas.toFixed(1)}x` : '—'}</NumCell>
                    <NumCell>{c.ctr.toFixed(2)}%</NumCell>
                    <NumCell>{c.frequency.toFixed(1)}</NumCell>
                    <td style={{ padding: '12px 16px', borderBottom: isExpanded ? 'none' : '1px solid var(--border-soft)', textAlign: 'center' }}>
                      <a
                        href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.id}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color: 'var(--text-3)', display: 'inline-flex', opacity: 0.6 }}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>

                  {/* Ad Sets expansion */}
                  {isExpanded && (
                    <tr key={`${c.id}-adsets`}>
                      <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--border-soft)' }}>
                          <ConversionChips items={c.conversions ?? []} currency={currency} />
                          {isLoading ? (
                            <div style={{ padding: '16px 24px', color: 'var(--text-3)', fontSize: 12 }}>Carregando conjuntos…</div>
                          ) : !adsets?.length ? (
                            <div style={{ padding: '16px 24px', color: 'var(--text-3)', fontSize: 12 }}>Nenhum conjunto encontrado.</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: 'var(--bg-card2)' }}>
                                  {['Conjunto de anúncio', 'Status', 'Investido', (kind === 'form' ? 'Resultados' : L.many), (kind === 'form' ? 'Custo / Res.' : L.cost), 'CTR', 'Freq.', ''].map((h, i) => (
                                    <th key={i} style={{
                                      padding: '8px 14px 8px ' + (i === 0 ? '40px' : '14px'),
                                      fontSize: 9, fontWeight: 700, letterSpacing: '.07em',
                                      textTransform: 'uppercase', color: 'var(--text-3)',
                                      textAlign: i > 1 ? 'right' : 'left', whiteSpace: 'nowrap',
                                      borderBottom: '1px solid var(--border-soft)',
                                    }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {adsets.map(as => {
                                  const isAdsetExpanded = expandedAdset === as.id
                                  const ads = adsData[as.id]
                                  const isAdsLoading = loadingAds === as.id
                                  const asDelivery = resolveDelivery(as, kind)
                                  return (
                                    <Fragment key={as.id}>
                                      <tr
                                        style={{ cursor: 'pointer', background: isAdsetExpanded ? 'var(--accent-soft)' : 'transparent' }}
                                        onClick={() => toggleAdset(as.id)}
                                        onMouseEnter={e => { if (!isAdsetExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card2)' }}
                                        onMouseLeave={e => { if (!isAdsetExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                                      >
                                        <td style={{ padding: '9px 14px 9px 40px', borderBottom: isAdsetExpanded ? 'none' : '1px solid var(--border-soft)', color: 'var(--text-1)', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                            <ChevronRight size={11} style={{ color: 'var(--text-3)', transform: isAdsetExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                                            {as.name}
                                          </span>
                                        </td>
                                        <td style={{ padding: '9px 14px', borderBottom: isAdsetExpanded ? 'none' : '1px solid var(--border-soft)' }}>
                                          <StatusBadge status={as.status} />
                                        </td>
                                        <SubNum>{fmt(as.spend, currency)}</SubNum>
                                        <SubNum>
                                          {asDelivery.count > 0 ? (
                                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                                              <span>{asDelivery.count.toLocaleString('pt-BR')}</span>
                                              <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{asDelivery.label}</span>
                                            </div>
                                          ) : (
                                            '—'
                                          )}
                                        </SubNum>
                                        <SubNum>
                                          {asDelivery.cost != null && asDelivery.cost > 0 ? (
                                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                                              <span>{fmtSmall(asDelivery.cost, currency)}</span>
                                              <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{asDelivery.costLabel}</span>
                                            </div>
                                          ) : (
                                            '—'
                                          )}
                                        </SubNum>
                                        <SubNum>{as.ctr.toFixed(2)}%</SubNum>
                                        <SubNum>{as.frequency.toFixed(1)}</SubNum>
                                        <td style={{ padding: '9px 14px', borderBottom: isAdsetExpanded ? 'none' : '1px solid var(--border-soft)', textAlign: 'right' }}>
                                          <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>criativos</span>
                                        </td>
                                      </tr>

                                      {/* Creatives expansion */}
                                      {isAdsetExpanded && (
                                        <tr key={`${as.id}-ads`}>
                                          <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--border-soft)' }}>
                                            <div style={{ background: 'var(--bg-card2)', padding: '12px 40px 12px 56px' }}>
                                              {isAdsLoading ? (
                                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Carregando criativos…</span>
                                              ) : !ads?.length ? (
                                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Nenhum anúncio encontrado.</span>
                                              ) : (
                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                  {ads.map(ad => {
                                                    const adDelivery = resolveDelivery(ad, kind)
                                                    const fatigue = analyzeFatigue(ad)
                                                    return (
                                                      <div key={ad.id}
                                                        onClick={async () => {
                                                          setCreativeModal(ad)
                                                          setPreviewHtml(null)
                                                          setPreviewLoading(true)
                                                          try {
                                                            const r = await apiFetch(`/api/meta/ad/${ad.id}`)
                                                            const j = await r.json() as { html?: string }
                                                            setPreviewHtml(j.html ?? null)
                                                          } catch { }
                                                          setPreviewLoading(false)
                                                        }}
                                                        className="card card-interactive"
                                                        style={{ width: 154, overflow: 'hidden' }}
                                                      >
                                                        <div style={{ height: 80, background: 'var(--bg-card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                          {ad.thumb ? (
                                                            <img src={ad.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                          ) : (
                                                            <span style={{ fontSize: 20 }}>🖼</span>
                                                          )}
                                                        </div>
                                                        <div style={{ padding: 8 }}>
                                                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.name}</div>
                                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, alignItems: 'center', gap: 4 }}>
                                                            <StatusBadge status={ad.status} />
                                                            <span
                                                              style={{
                                                                fontSize: 9,
                                                                fontWeight: 700,
                                                                padding: '1px 5px',
                                                                borderRadius: 4,
                                                                background: fatigue.bg,
                                                                color: fatigue.color,
                                                              }}
                                                              title={`Saúde: ${fatigue.label}\nFreq: ${fatigue.frequency.toFixed(2)}x | CTR: ${fatigue.ctr.toFixed(2)}%`}
                                                            >
                                                              {fatigue.shortLabel}
                                                            </span>
                                                          </div>
                                                          {adDelivery.count > 0 && (
                                                            <div style={{ marginTop: 4, textAlign: 'right' }}>
                                                              <span
                                                                style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}
                                                                title={`${adDelivery.count} ${adDelivery.label}`}
                                                              >
                                                                {adDelivery.count} {adDelivery.badge}
                                                              </span>
                                                            </div>
                                                          )}
                                                        </div>
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Creative Modal */}
      {creativeModal && (
        <div
          onClick={() => setCreativeModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'hsl(0 0% 0% / .8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ overflow: 'hidden', maxWidth: 512, width: '100%', boxShadow: 'var(--shadow-elegant)' }}
          >
            {/* Header */}
            <div style={{ padding: 24, borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{creativeModal.name}</div>
                <div style={{ marginTop: 4 }}><StatusBadge status={creativeModal.status} /></div>
              </div>
              <button onClick={() => setCreativeModal(null)} aria-label="Fechar" title="Fechar" className="btn btn-ghost btn-icon btn-sm" style={{ flexShrink: 0 }}><X size={16} /></button>
            </div>

            {/* Ad Preview */}
            <div style={{ padding: 16, borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'center', minHeight: 120, alignItems: 'center', background: 'var(--bg)' }}>
              {previewLoading ? (
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Carregando preview…</span>
              ) : previewSrc(previewHtml) ? (
                <iframe src={previewSrc(previewHtml)!} title="Prévia do anúncio" width={320} height={540} sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="no-referrer" style={{ border: 0, maxWidth: '100%' }} />
              ) : creativeModal.thumb ? (
                <img src={creativeModal.thumb} alt="" style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 8 }} />
              ) : (
                <span style={{ fontSize: 32 }}>🖼</span>
              )}
            </div>

            {/* Metrics */}
            <div style={{ padding: 24 }}>
              {(() => {
                const modalDelivery = resolveDelivery(creativeModal, kind)
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {[
                        { label: 'Investido', value: fmt(creativeModal.spend, currency) },
                        { label: 'Impressões', value: creativeModal.impressions.toLocaleString('pt-BR') },
                        {
                          label: modalDelivery.label ? (modalDelivery.label.charAt(0).toUpperCase() + modalDelivery.label.slice(1)) : L.many,
                          value: modalDelivery.count > 0 ? modalDelivery.count.toLocaleString('pt-BR') : '—',
                        },
                        { label: 'Cliques', value: String(creativeModal.clicks || '—') },
                        {
                          label: modalDelivery.costLabel ? `Custo (${modalDelivery.costLabel})` : L.cost,
                          value: modalDelivery.cost ? fmtSmall(modalDelivery.cost, currency) : '—',
                        },
                      ].map(m => (
                        <div key={m.label} style={{ background: 'var(--bg-card2)', borderRadius: 12, padding: 12 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Diagnóstico de Fadiga do Criativo */}
                    {(() => {
                      const f = analyzeFatigue(creativeModal)
                      return (
                        <div
                          style={{
                            marginTop: 14,
                            padding: '12px 14px',
                            borderRadius: 12,
                            background: f.bg,
                            border: `1px solid ${f.color}40`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: f.color }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.dot }} />
                              Diagnóstico: {f.label}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: f.color }}>
                              Freq: {f.frequency.toFixed(2)}x · CTR: {f.ctr.toFixed(2)}%
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.4, marginBottom: 6 }}>
                            {f.diagnosis}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4, borderTop: '1px solid var(--border-soft)', paddingTop: 6 }}>
                            <strong>Recomendação:</strong> {f.recommendation}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NumCell({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <td style={{
      padding: '12px 16px', borderBottom: '1px solid var(--border-soft)',
      color: color ?? 'var(--text-1)',
      fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap',
    }}>
      {children}
    </td>
  )
}

function SubNum({ children }: { children: React.ReactNode }) {
  return (
    <td style={{
      padding: '9px 14px', borderBottom: '1px solid var(--border-soft)',
      color: 'var(--text-1)',
      fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 12,
    }}>
      {children}
    </td>
  )
}
