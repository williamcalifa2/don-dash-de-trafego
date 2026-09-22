'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Eye, EyeOff, FileText, Loader2, RefreshCw, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { ReportData, ReportNotes, ReportPreset } from '@/lib/report'
import { buildSlides, FONT, PALETTE, STAGE, type El, type SlideSpec } from '@/lib/reportSlides'

type Loaded = ReportData & { draftAnalysis: string }
type Phase = { kind: 'loading'; text: string } | { kind: 'error'; text: string } | { kind: 'ready'; data: Loaded }

const needsPrepare = (d: Loaded) => d.paid.status === 'pending' || d.organic.status === 'incomplete' || d.organic.status === 'pending'

/** Uma linha de texto/forma do slide. Com `onEdit`, os textos da equipe viram campos editáveis. */
function Element({ el, onEdit }: { el: El; onEdit?: (key: NonNullable<Extract<El, { t: 'text' }>['edit']>, value: string) => void }) {
  const pos = { position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h } as const
  if (el.t === 'box') return <div style={{ ...pos, background: el.fill, border: el.line ? `2px solid ${el.line}` : undefined, borderRadius: el.radius, boxSizing: 'border-box' }} />
  if (el.t === 'img') {
    return el.src ? <img src={el.src} alt="" style={{ ...pos, objectFit: 'cover', borderRadius: el.radius }} /> : <div style={{ ...pos, background: '#D9D9E6', borderRadius: el.radius }} />
  }
  const text: React.CSSProperties = {
    ...pos, fontFamily: `${FONT}, system-ui, sans-serif`, fontSize: el.size, fontWeight: el.weight ?? 400, color: el.color, textAlign: el.align ?? 'left',
    lineHeight: el.lineHeight ?? 1.2, whiteSpace: 'pre-wrap', overflow: 'hidden', margin: 0,
    display: 'flex', alignItems: el.valign === 'middle' ? 'center' : 'flex-start', justifyContent: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
  }
  if (el.edit && onEdit) {
    const key = el.edit
    return (
      <textarea aria-label={el.placeholder ?? 'Texto'} value={el.text} placeholder={el.placeholder} onChange={e => onEdit(key, e.target.value)} spellCheck
        style={{ ...text, display: 'block', background: 'rgba(111,109,247,.10)', border: '1px dashed rgba(111,109,247,.55)', borderRadius: 6, padding: 8, resize: 'none', outline: 'none', overflow: 'auto' }} />
    )
  }
  return <div style={text}><span style={{ width: '100%' }}>{el.text}</span></div>
}

export function Slide({ spec, scale, onEdit }: { spec: SlideSpec; scale: number; onEdit?: Parameters<typeof Element>[0]['onEdit'] }) {
  return (
    <div style={{ width: STAGE.w * scale, height: STAGE.h * scale, position: 'relative', overflow: 'hidden', borderRadius: scale < 0.5 ? 4 : 8, flexShrink: 0 }}>
      <div style={{ width: STAGE.w, height: STAGE.h, position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: spec.dark ? PALETTE.dark : PALETTE.light, overflow: 'hidden' }}>
        {spec.els.map((el, i) => <Element key={i} el={el} onEdit={onEdit} />)}
      </div>
    </div>
  )
}

export function ReportStudio({ onClose, initialPreset = 'last_month' }: { onClose: () => void; initialPreset?: ReportPreset }) {
  const [preset, setPreset] = useState<ReportPreset>(initialPreset)
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
  const slides = useMemo(() => (data && notes ? buildSlides(data, notes) : []), [data, notes])
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

  const fileName = data ? `Relatorio-${data.month.key}-${data.client.name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}` : 'Relatorio'

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
            <div style={{ boxShadow: '0 8px 30px rgba(0,0,0,.18)', borderRadius: 8 }}><Slide spec={active} scale={scale} onEdit={edit} /></div>
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
