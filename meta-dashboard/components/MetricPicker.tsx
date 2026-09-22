'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Check, GripVertical } from 'lucide-react'
import { METRIC_DEFS, DEFAULT_METRICS, type MetricKey, type MetricsSummary } from '@/lib/meta'

const STORAGE_KEY = 'meta_selected_metrics'

export function useSelectedMetrics(): [MetricKey[], (keys: MetricKey[]) => void] {
  const [selected, setSelectedState] = useState<MetricKey[]>(DEFAULT_METRICS)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as MetricKey[]
        if (Array.isArray(parsed) && parsed.length > 0) setSelectedState(parsed)
      }
    } catch {}
  }, [])

  function setSelected(keys: MetricKey[]) {
    setSelectedState(keys)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)) } catch {}
  }

  return [selected, setSelected]
}

interface MetricPickerProps {
  selected: MetricKey[]
  summary?: MetricsSummary
  currency?: string
  onClose: (selected: MetricKey[]) => void
}

const GROUPS = ['Financeiro', 'Alcance', 'Engajamento', 'Vídeo', 'Conversões', 'Mensagens']

function fmtPreview(key: MetricKey, s: MetricsSummary, currency: string): string {
  const fmt = (v: number | null | undefined) => {
    if (v == null) return '—'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(v)
  }
  const compact = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
    return String(Math.round(v))
  }
  switch (key) {
    case 'spend':                 return fmt(s.spend)
    case 'cpc':                   return fmt(s.cpc)
    case 'cpm':                   return fmt(s.cpm)
    case 'cpl':                   return fmt(s.cpl)
    case 'cpa':                   return fmt(s.cpa)
    case 'roas':                  return s.roas ? `${s.roas.toFixed(2)}x` : '—'
    case 'cost_per_engagement':   return fmt(s.cost_per_engagement)
    case 'cost_per_link_click':   return fmt(s.cost_per_link_click)
    case 'cost_per_conversation': return fmt(s.cost_per_conversation)
    case 'impressions':           return compact(s.impressions)
    case 'reach':                 return compact(s.reach)
    case 'frequency':             return s.frequency.toFixed(1)
    case 'clicks':                return compact(s.clicks)
    case 'unique_clicks':         return compact(s.unique_clicks)
    case 'ctr':                   return `${s.ctr.toFixed(2)}%`
    case 'link_clicks':           return compact(s.link_clicks)
    case 'post_engagement':       return compact(s.post_engagement)
    case 'reactions':             return compact(s.reactions)
    case 'comments':              return compact(s.comments)
    case 'video_views':           return compact(s.video_views)
    case 'leads':                 return compact(s.leads)
    case 'purchases':             return compact(s.purchases)
    case 'purchase_value':        return fmt(s.purchase_value)
    case 'landing_page_views':    return compact(s.landing_page_views)
    case 'messaging_conversations': return compact(s.messaging_conversations)
    default:                      return '—'
  }
}

export function MetricPicker({ selected: initialSelected, summary, currency = 'BRL', onClose }: MetricPickerProps) {
  const [draft, setDraft] = useState<MetricKey[]>(initialSelected)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const draftSet = new Set(draft)

  function toggle(key: MetricKey) {
    setDraft(prev => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev
        return prev.filter(k => k !== key)
      }
      return [...prev, key]
    })
  }

  function apply() {
    onClose(draft)
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) apply()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') apply() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Drag and drop handlers
  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setDraft(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  const labelMap = Object.fromEntries(METRIC_DEFS.map(m => [m.key, m.label]))

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'hsl(0 0% 0% / .8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className="card" style={{
        width: '100%', maxWidth: 680,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-elegant)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 24, borderBottom: '1px solid var(--border-soft)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>Personalizar métricas</div>
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 2 }}>{draft.length} selecionada{draft.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={apply} aria-label="Fechar" title="Fechar" className="btn btn-ghost btn-icon btn-sm">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Left: metric catalogue */}
          <div style={{
            width: 260, flexShrink: 0,
            overflowY: 'auto', padding: 16,
            borderRight: '1px solid var(--border-soft)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 10 }}>
              Métricas disponíveis
            </div>
            {GROUPS.map(group => {
              const items = METRIC_DEFS.filter(m => m.group === group)
              if (!items.length) return null
              return (
                <div key={group} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6 }}>
                    {group}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {items.map(m => {
                      const active = draftSet.has(m.key as MetricKey)
                      return (
                        <button
                          key={m.key}
                          onClick={() => toggle(m.key as MetricKey)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            background: active ? 'var(--accent-soft)' : 'transparent',
                            border: active ? '1px solid var(--accent-glow)' : '1px solid transparent',
                            color: active ? 'var(--accent)' : 'var(--text-1)',
                            fontSize: 14, fontWeight: active ? 600 : 400,
                            textAlign: 'left', transition: 'all .2s',
                          }}
                        >
                          <span style={{
                            width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: active ? 'var(--accent)' : 'var(--bg)',
                            border: active ? 'none' : '1px solid var(--border-input)',
                            transition: 'all .1s',
                          }}>
                            {active && <Check size={9} strokeWidth={3} color="#fff" />}
                          </span>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right: preview + order */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
              Pré-visualização · arraste para reordenar
            </div>

            {/* Mini tile grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}>
              {draft.map((key, i) => {
                const isDragging = dragIndex === i
                const isDropTarget = dropIndex === i && dragIndex !== null && dragIndex !== i
                const value = summary ? fmtPreview(key, summary, currency) : '—'
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={e => handleDragStart(e, i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDrop={e => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    style={{
                      background: isDropTarget ? 'var(--accent-soft)' : 'var(--bg-card2)',
                      border: isDropTarget
                        ? '1px dashed var(--accent)'
                        : isDragging
                        ? '1px dashed var(--border)'
                        : '1px solid var(--border)',
                      borderRadius: 12, padding: 12,
                      cursor: 'grab', opacity: isDragging ? 0.4 : 1,
                      transition: 'all .1s',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      minHeight: 72,
                    }}
                  >
                    {/* tile top row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '.07em',
                        textTransform: 'uppercase', color: 'var(--text-3)',
                        lineHeight: 1.2,
                      }}>
                        {labelMap[key] ?? key}
                      </span>
                      <GripVertical size={11} color="var(--text-3)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    </div>
                    {/* tile value */}
                    <div style={{
                      fontSize: 20, fontWeight: 700, color: 'var(--text-1)',
                      fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
                    }}>
                      {value}
                    </div>
                    {/* position badge */}
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
                      #{i + 1}
                    </div>
                  </div>
                )
              })}
            </div>

            {draft.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: '24px 0' }}>
                Selecione métricas à esquerda
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border-soft)',
          display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          <button onClick={() => setDraft([...DEFAULT_METRICS])} className="btn btn-outline">
            Restaurar padrão
          </button>
          <button onClick={apply} className="btn btn-primary">
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
