'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Eye, EyeOff, FileText, Loader2, RefreshCw, Sparkles, X, UploadCloud, RotateCcw } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { generateSmartAnalysis, type ReportData, type ReportMode, type ReportNotes, type ReportPreset } from '@/lib/report'
import { buildSlides, FONT, PALETTE, STAGE, type El, type SlideSpec } from '@/lib/reportSlides'

type Loaded = ReportData & { draftAnalysis: string }
type Phase = { kind: 'loading'; text: string } | { kind: 'error'; text: string } | { kind: 'ready'; data: Loaded }

const needsPrepare = (d: Loaded) => d.paid.status === 'pending' || d.organic.status === 'incomplete' || d.organic.status === 'pending'

function SvgChart({ el }: { el: Extract<El, { t: 'chart' }> }) {
  const { data, colors } = el
  if (!data || data.length === 0 || !data[0]?.labels || data[0].labels.length === 0) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#9A9AB8', fontSize: 14 }}>Sem dados para exibir no gráfico</div>
  }

  const labels = data[0].labels
  const n = labels.length
  const w = 960
  const h = 360
  const padLeft = 65
  const padRight = 65
  const padTop = 30
  const padBottom = 50
  const plotW = w - padLeft - padRight
  const plotH = h - padTop - padBottom

  const s0 = data[0]
  const max0 = Math.max(...s0.values.map(v => Number(v) || 0), 1) * 1.15
  const s1 = data[1]
  const max1 = s1 ? Math.max(...s1.values.map(v => Number(v) || 0), 1) * 1.2 : 1

  const getX = (i: number) => padLeft + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const getY0 = (val: number) => padTop + plotH - ((Number(val) || 0) / max0) * plotH
  const getY1 = (val: number) => padTop + plotH - ((Number(val) || 0) / max1) * plotH

  const color0 = colors[0]?.startsWith('#') ? colors[0] : `#${colors[0] || '6F6DF7'}`
  const color1 = colors[1]?.startsWith('#') ? colors[1] : `#${colors[1] || '16A34A'}`

  const d0 = s0.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY0(v)}`).join(' ')
  const area0 = `${d0} L ${getX(n - 1)} ${padTop + plotH} L ${getX(0)} ${padTop + plotH} Z`
  const d1 = s1 ? s1.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY1(v)}`).join(' ') : ''

  const stepCount = 4
  const gridLines = Array.from({ length: stepCount + 1 }).map((_, idx) => {
    const ratio = idx / stepCount
    const y = padTop + plotH - ratio * plotH
    const v0 = Math.round(ratio * max0)
    const v1 = s1 ? Math.round(ratio * max1) : null
    return { y, v0, v1 }
  })

  const showLabelIdx = (i: number) => {
    if (n <= 10) return true
    if (n <= 20) return i % 2 === 0 || i === n - 1
    return i % Math.ceil(n / 10) === 0 || i === n - 1
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="chartGrad0" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color0} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color0} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {gridLines.map((g, idx) => (
          <g key={idx}>
            <line x1={padLeft} y1={g.y} x2={padLeft + plotW} y2={g.y} stroke="#EAEAEF" strokeDasharray="4 4" strokeWidth="1" />
            <text x={padLeft - 10} y={g.y + 4} textAnchor="end" fontSize="11" fill={color0} fontWeight="600" fontFamily="sans-serif">
              R$ {g.v0}
            </text>
            {g.v1 != null && (
              <text x={padLeft + plotW + 10} y={g.y + 4} textAnchor="start" fontSize="11" fill={color1} fontWeight="600" fontFamily="sans-serif">
                {g.v1}
              </text>
            )}
          </g>
        ))}

        <path d={area0} fill="url(#chartGrad0)" />
        <path d={d0} fill="none" stroke={color0} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {s0.values.map((v, i) => (
          <circle key={`c0-${i}`} cx={getX(i)} cy={getY0(v)} r="4" fill="#FFFFFF" stroke={color0} strokeWidth="2.5" />
        ))}

        {s1 && (
          <>
            <path d={d1} fill="none" stroke={color1} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {s1.values.map((v, i) => (
              <circle key={`c1-${i}`} cx={getX(i)} cy={getY1(v)} r="4" fill="#FFFFFF" stroke={color1} strokeWidth="2.5" />
            ))}
          </>
        )}

        {labels.map((lbl, i) => {
          if (!showLabelIdx(i)) return null
          return (
            <text key={`lbl-${i}`} x={getX(i)} y={padTop + plotH + 22} textAnchor="middle" fontSize="11" fill="#71717A" fontFamily="sans-serif">
              {lbl}
            </text>
          )
        })}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 6, fontSize: 13, fontWeight: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0B0B14' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: color0 }} />
          <span>{s0.name} (Eixo esquerdo)</span>
        </div>
        {s1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0B0B14' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: color1 }} />
            <span>{s1.name} (Eixo direito)</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Uma linha de texto/forma do slide. Com `onEdit`, os textos da equipe viram campos editáveis. */
function Element({
  el,
  onEdit,
  onSmartAnalysis,
}: {
  el: El
  onEdit?: (key: NonNullable<Extract<El, { t: 'text' }>['edit']>, value: string) => void
  onSmartAnalysis?: () => void
}) {
  const pos = { position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h } as const
  if (el.t === 'box') return <div style={{ ...pos, background: el.fill, border: el.line ? `2px solid ${el.line}` : undefined, borderRadius: el.radius, boxSizing: 'border-box' }} />
  if (el.t === 'img') {
    return el.src ? <img src={el.src} alt="" style={{ ...pos, objectFit: 'cover', borderRadius: el.radius }} /> : <div style={{ ...pos, background: '#D9D9E6', borderRadius: el.radius }} />
  }
  if (el.t === 'chart') {
    return (
      <div style={{ ...pos, background: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E2EA', padding: '16px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
        {el.title && <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.ink, marginBottom: 8, fontFamily: `${FONT}, sans-serif` }}>{el.title}</div>}
        <div style={{ flex: 1, minHeight: 0 }}>
          <SvgChart el={el} />
        </div>
      </div>
    )
  }
  if (el.t === 'table') {
    return (
      <div style={{ ...pos, background: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E2EA', overflow: 'hidden', boxSizing: 'border-box', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
        <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: `${FONT}, system-ui, sans-serif` }}>
          <thead>
            <tr style={{ background: PALETTE.violet, color: '#FFFFFF', height: 46 }}>
              {el.headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    width: el.colWidths[i] ? `${(el.colWidths[i] / el.w) * 100}%` : 'auto',
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {el.rows.map((row, rIdx) => (
              <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    style={{
                      padding: '12px 16px',
                      fontSize: 12,
                      fontWeight: cell.bold ? 700 : 400,
                      color: cell.color ?? PALETTE.ink,
                      textAlign: cell.align ?? 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  const text: React.CSSProperties = {
    ...pos, fontFamily: `${FONT}, system-ui, sans-serif`, fontSize: el.size, fontWeight: el.weight ?? 400, color: el.color, textAlign: el.align ?? 'left',
    lineHeight: el.lineHeight ?? 1.2, whiteSpace: 'pre-wrap', overflow: 'visible', margin: 0,
    display: 'flex', alignItems: el.valign === 'middle' ? 'center' : 'flex-start', justifyContent: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
  }
  if (el.edit && onEdit) {
    const key = el.edit
    const isAnalysisOrNext = key === 'analysis' || key === 'next'
    return (
      <div style={{ ...pos, position: 'absolute' }}>
        <textarea
          aria-label={el.placeholder ?? 'Texto'}
          value={el.text}
          placeholder={el.placeholder}
          onChange={e => onEdit(key, e.target.value)}
          spellCheck
          style={{
            ...text,
            width: '100%',
            height: '100%',
            display: 'block',
            background: 'rgba(111,109,247,.10)',
            border: '1.5px dashed rgba(111,109,247,.55)',
            borderRadius: 8,
            padding: 12,
            resize: 'none',
            outline: 'none',
            overflow: 'auto',
            boxSizing: 'border-box',
          }}
        />
        {isAnalysisOrNext && onSmartAnalysis && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onSmartAnalysis(); }}
            title="Preencher com análise inteligente baseada nos dados da Meta"
            style={{
              position: 'absolute',
              top: 10,
              right: 12,
              background: '#6F6DF7',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(111,109,247,0.35)',
              zIndex: 10,
            }}
          >
            <Sparkles size={13} /> Gerar Análise Inteligente
          </button>
        )}
      </div>
    )
  }
  return <div style={text}><span style={{ width: '100%' }}>{el.text}</span></div>
}

export function Slide({
  spec,
  scale,
  onEdit,
  onSmartAnalysis,
}: {
  spec: SlideSpec
  scale: number
  onEdit?: Parameters<typeof Element>[0]['onEdit']
  onSmartAnalysis?: () => void
}) {
  return (
    <div style={{ width: STAGE.w * scale, height: STAGE.h * scale, position: 'relative', overflow: 'hidden', borderRadius: scale < 0.5 ? 4 : 8, flexShrink: 0 }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: spec.dark ? PALETTE.dark : PALETTE.light, overflow: 'hidden' }}>
        {spec.els.map((el, i) => <Element key={i} el={el} onEdit={onEdit} onSmartAnalysis={onSmartAnalysis} />)}
      </div>
    </div>
  )
}

export function ReportStudio({
  onClose,
  initialPreset = 'last_month',
  initialMode = 'standard',
}: {
  onClose: () => void
  initialPreset?: ReportPreset
  initialMode?: ReportMode
}) {
  const [preset, setPreset] = useState<ReportPreset>(initialPreset)
  const [mode, setMode] = useState<ReportMode>(initialMode)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', text: 'Carregando o relatório…' })
  const [notes, setNotes] = useState<ReportNotes | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState(0)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [exporting, setExporting] = useState<null | 'pptx' | 'pdf'>(null)
  const [scale, setScale] = useState(0.6)
  const stageBox = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const load = useCallback(async (opts: { prepare?: boolean; targetPreset?: ReportPreset } = {}) => {
    const p = opts.targetPreset ?? preset
    let prepared = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await apiFetch(`/api/report/monthly?preset=${p}`, { cache: 'no-store' }).catch(() => null)
      const j = r ? await r.json().catch(() => ({})) as Loaded & { error?: string } : null
      if (!r || !r.ok || !j) { setPhase({ kind: 'error', text: j?.error ?? 'Não foi possível carregar o relatório. Tente de novo.' }); return }
      if (needsPrepare(j) && (opts.prepare ?? true) && !prepared) {
        prepared = true
        setPhase({ kind: 'loading', text: `Buscando os números de ${j.month.label} na Meta…` })
        const prep = await apiFetch('/api/report/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare', preset: p }) }).catch(() => null)
        const pj = prep ? await prep.json().catch(() => ({})) as { prepared?: boolean; reason?: string; error?: string; ads?: { reason?: string }; organic?: { reason?: string } } : null
        if (prep && !prep.ok && pj?.error) { setPhase({ kind: 'error', text: pj.error }); return }
        if (pj && pj.reason === 'cooldown') { /* já buscou agora há pouco: segue com o que tem */ }
        continue
      }
      setNotes({ ...j.notes, analysis: j.notes.analysis || j.draftAnalysis })
      setPhase({ kind: 'ready', data: j })
      return
    }
  }, [preset])

  useEffect(() => { load() }, [load])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  // ajusta o palco à largura disponível
  useEffect(() => {
    const el = stageBox.current
    if (!el) return
    const fit = () => setScale(Math.max(0.3, Math.min(1, (el.clientWidth - 32) / STAGE.w, (el.clientHeight - 32) / STAGE.h)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase.kind])

  const data = phase.kind === 'ready' ? phase.data : null
  const slides = useMemo(() => (data && notes ? buildSlides(data, notes, mode) : []), [data, notes, mode])
  const included = slides.filter(s => !hidden.has(s.id))

  const save = useCallback(async (n: ReportNotes, p = preset) => {
    setSaved('saving')
    const r = await apiFetch('/api/report/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', notes: n, preset: p }) }).catch(() => null)
    dirty.current = false
    setSaved(r?.ok ? 'saved' : 'error')
  }, [preset])

  const edit = useCallback((key: keyof ReportNotes, value: string) => {
    setNotes(prev => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      dirty.current = true; setSaved('idle')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => save(next), 1200)
      return next
    })
  }, [save])

  const handleSmartAnalysis = useCallback(() => {
    if (!data) return
    const smart = generateSmartAnalysis(data)
    setNotes(prev => {
      if (!prev) return prev
      const next = { ...prev, analysis: smart.analysis, next: smart.next }
      dirty.current = true
      setSaved('idle')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => save(next), 1200)
      return next
    })
  }, [data, save])

  const switchPreset = useCallback((next: ReportPreset) => {
    if (next === preset) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (dirty.current && notes) void save(notes, preset)
    setPreset(next)
    setPhase({ kind: 'loading', text: next === 'last_7d' ? 'Carregando relatório dos últimos 7 dias…' : 'Carregando relatório do último mês…' })
    void load({ targetPreset: next, prepare: true })
  }, [preset, notes, save, load])

  // não perde o texto se fechar logo depois de editar
  const close = useCallback(() => { if (saveTimer.current) clearTimeout(saveTimer.current); if (dirty.current && notes) void save(notes); onClose() }, [notes, onClose, save])

  const fileName = data
    ? `Relatorio-${mode === 'advanced' ? 'Avancado-' : ''}${data.month.key}-${data.client.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`
    : 'Relatorio'

  async function exportPptx() {
    if (!included.length) return
    setExporting('pptx')
    try { const { downloadPptx } = await import('@/lib/reportPptx'); await downloadPptx(included, fileName) } finally { setExporting(null) }
  }
  function exportPdf() {
    if (!included.length) return
    setExporting('pdf')
    const title = document.title
    document.title = fileName
    document.body.classList.add('printing-report')
    const done = () => { document.body.classList.remove('printing-report'); document.title = title; setExporting(null); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    setTimeout(() => window.print(), 250) // deixa as imagens do modo impressão carregarem
  }

  const active = slides[Math.min(current, Math.max(0, slides.length - 1))]

  const ui = (
    <div role="dialog" aria-modal="true" aria-label="Relatório mensal" className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg, #F7F8FA)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {data ? (preset === 'last_7d' ? 'Relatório semanal' : 'Relatório mensal') : 'Relatório'}
              {data ? ` · ${data.month.label}` : ''}
            </div>
            {data && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.client.name} · {included.length} de {slides.length} slides</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card2, rgba(0,0,0,0.06))', padding: '3px 4px', borderRadius: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${preset === 'last_month' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => switchPreset('last_month')}
            >
              Último mês
            </button>
            <button
              type="button"
              className={`btn btn-sm ${preset === 'last_7d' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => switchPreset('last_7d')}
            >
              Últimos 7 dias
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card2, rgba(0,0,0,0.06))', padding: '3px 4px', borderRadius: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'standard' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => { setMode('standard'); setCurrent(0) }}
            >
              Padrão (8 slides)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'advanced' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 12, borderRadius: 6 }}
              onClick={() => { setMode('advanced'); setCurrent(0) }}
            >
              Avançado (11 slides)
            </button>
          </div>
        </div>
        {data && <span aria-live="polite" style={{ fontSize: 12, color: saved === 'error' ? 'var(--red)' : 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {saved === 'saving' && <><Loader2 size={13} className="spin" /> Salvando…</>}{saved === 'saved' && <><Check size={13} /> Textos salvos</>}{saved === 'error' && 'Não foi possível salvar os textos'}
        </span>}
        {data && <button className="btn btn-outline btn-sm" onClick={() => { setPhase({ kind: 'loading', text: 'Atualizando os números…' }); void load({ prepare: true }) }} title="Busca os números do período de novo na Meta"><RefreshCw size={14} strokeWidth={1.75} /> Buscar dados</button>}
        {data && <button className="btn btn-outline btn-sm" onClick={exportPdf} disabled={!!exporting}><FileText size={14} strokeWidth={1.75} /> {exporting === 'pdf' ? 'Preparando…' : 'Baixar PDF'}</button>}
        {data && <button className="btn btn-primary btn-sm" onClick={exportPptx} disabled={!!exporting}><Download size={14} strokeWidth={1.75} /> {exporting === 'pptx' ? 'Gerando…' : 'Baixar PowerPoint'}</button>}
        <button className="btn btn-outline btn-icon btn-sm" onClick={close} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button>
      </header>

      {phase.kind === 'loading' && <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-2)', fontSize: 14 }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} className="spin" /> {phase.text}</span></div>}
      {phase.kind === 'error' && (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <p role="alert" style={{ fontSize: 14, color: 'var(--text-1)', margin: '0 0 14px' }}>{phase.text}</p>
            <button className="btn btn-outline btn-sm" onClick={() => { setPhase({ kind: 'loading', text: 'Carregando o relatório…' }); void load() }}><RefreshCw size={14} strokeWidth={1.75} /> Tentar de novo</button>
          </div>
        </div>
      )}

      {data && notes && active && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <nav aria-label="Slides" style={{ width: 176, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
            {slides.map((s, i) => {
              const off = hidden.has(s.id)
              return (
                <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button onClick={() => setCurrent(i)} aria-current={i === current} aria-label={`Slide ${i + 1}: ${s.label}`} style={{ padding: 0, border: `2px solid ${i === current ? PALETTE.violet : 'transparent'}`, borderRadius: 8, background: 'none', cursor: 'pointer', opacity: off ? 0.35 : 1 }}>
                    <Slide spec={s} scale={0.11} />
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
                    <span>{i + 1}. {s.label}</span>
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 24, height: 24 }} onClick={() => setHidden(h => { const n = new Set(h); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })} aria-label={off ? `Incluir ${s.label}` : `Ocultar ${s.label}`} title={off ? 'Incluir no relatório' : 'Ocultar do relatório'}>
                      {off ? <EyeOff size={13} strokeWidth={1.75} /> : <Eye size={13} strokeWidth={1.75} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </nav>
          <div ref={stageBox} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, background: 'var(--muted-bg, rgba(127,127,160,.08))' }}>
            <div style={{ boxShadow: '0 8px 30px rgba(0,0,0,.18)', borderRadius: 8 }}>
              <Slide spec={active} scale={scale} onEdit={edit} onSmartAnalysis={handleSmartAnalysis} />
            </div>
            {active.id === 'creatives' && data.paid.top.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card, #FFFFFF)', border: '1px solid var(--border, #E2E2EA)', borderRadius: 8, padding: '6px 14px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2, #55556A)' }}>Melhorar resolução dos criativos:</span>
                {data.paid.top.slice(0, 3).map((a, idx) => {
                  const isOverridden = !!notes.creativeOverrides?.[a.id]
                  return (
                    <div key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <label
                        className="btn btn-outline btn-sm"
                        style={{ height: 26, padding: '0 8px', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        title="Substituir thumbnail por imagem em alta definição do seu computador"
                      >
                        <UploadCloud size={12} />
                        <span>Criativo {idx + 1} {isOverridden ? '✓' : ''}</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = () => {
                              const dataUrl = String(reader.result)
                              const nextOverrides = { ...(notes.creativeOverrides ?? {}), [a.id]: dataUrl }
                              const nextNotes = { ...notes, creativeOverrides: nextOverrides }
                              setNotes(nextNotes)
                              void save(nextNotes)
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                      {isOverridden && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          style={{ width: 22, height: 22 }}
                          title="Restaurar imagem original da Meta"
                          onClick={() => {
                            const nextOverrides = { ...(notes.creativeOverrides ?? {}) }
                            delete nextOverrides[a.id]
                            const nextNotes = { ...notes, creativeOverrides: nextOverrides }
                            setNotes(nextNotes)
                            void save(nextNotes)
                          }}
                        >
                          <RotateCcw size={11} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Os campos com contorno tracejado são textos seus: clique e escreva. O resto vem dos dados da Meta.</p>
          </div>
        </div>
      )}
    </div>
  )

  // Modo impressão: todos os slides incluídos, um por página (fora da tela, só aparece ao imprimir).
  const print = (
    <div className="report-print-root" aria-hidden="true">
      {included.map(s => <div key={s.id} className="report-page"><Slide spec={s} scale={1} /></div>)}
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(<>{ui}{print}</>, document.body)
}
