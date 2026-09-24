'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ArrowUpRight, Circle, Copy, Eraser, ExternalLink, GalleryHorizontal, Highlighter, Home, Maximize, MousePointer2, Pencil, PanelRight, RefreshCw, Square, Target, Type, Undo2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { buildSlides, STAGE } from '@/lib/reportSlides'
import type { SavedReport } from '@/lib/report'
import type { Mark } from '@/lib/presentation'
import { MarksLayer, SlideView, useFit } from './SlideView'
import { PulseLoader } from '@/components/PulseLoader'

type Tool = 'pointer' | 'laser' | 'pen' | 'hl' | 'rect' | 'circle' | 'arrow' | 'text'
const COLORS = ['#EF4444', '#FACC15', '#22C55E', '#FFFFFF']
const pad2 = (n: number) => String(n).padStart(2, '0')

const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', display: 'inline-grid', placeItems: 'center', cursor: 'pointer' }

/**
 * Tela do apresentador: slide atual, próximo slide, notas só suas, miniaturas e anotações que o cliente vê na tela dele.
 * A tela do cliente é outro endereço (botão "Abrir tela do cliente"), que segue o que acontece aqui.
 */
export function PresenterScreen({ slug, id }: { slug: string; id: string }) {
  const [report, setReport] = useState<SavedReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [marks, setMarks] = useState<Record<string, Mark[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [tool, setTool] = useState<Tool>('pointer')
  const [color, setColor] = useState(COLORS[0])
  const [tools, setTools] = useState(true)
  const [side, setSide] = useState(true)
  const [strip, setStrip] = useState(true)
  const [live, setLive] = useState<Mark | null>(null)
  const [textAt, setTextAt] = useState<{ x: number; y: number; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const bc = useRef<BroadcastChannel | null>(null)
  const pubTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { ref: stageRef, scale: stageScale } = useFit<HTMLDivElement>(2, 0)
  const { ref: nextRef, scale: nextScale } = useFit<HTMLDivElement>(1, 0)

  // Carrega o relatório e o link do cliente
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await apiFetch(`/api/admin/reports/${slug}/${id}`, { cache: 'no-store' }).catch(() => null)
      if (!r || !r.ok) { if (alive) setError(r?.status === 401 ? 'Entre na administração para apresentar este relatório.' : 'Não encontrei este relatório.'); return }
      const rep = await r.json() as SavedReport
      const t = await apiFetch('/api/admin/present', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, id }) }).then(x => x.json()).catch(() => ({})) as { token?: string }
      if (!alive) return
      setReport(rep); setNotes(rep.presenterNotes ?? {}); setToken(t.token ?? null)
    })()
    return () => { alive = false }
  }, [slug, id])

  const slides = useMemo(() => (report ? buildSlides(report.snapshot.data, report.snapshot.notes, report.mode, report.theme) : []), [report])
  const total = slides.length
  const spec = slides[index]
  const nextSpec = slides[index + 1]

  useEffect(() => {
    if (!token) return
    try { bc.current = new BroadcastChannel(`present:${token}`) } catch { }
    return () => { bc.current?.close(); bc.current = null }
  }, [token])

  // Publica onde estamos e o que foi desenhado: na hora para a janela do cliente no mesmo navegador, e no servidor (com pequena espera) para os outros aparelhos.
  const publish = useCallback((slide: number, m: Record<string, Mark[]>) => {
    if (!token) return
    bc.current?.postMessage({ slide, marks: m, at: Date.now() })
    if (pubTimer.current) clearTimeout(pubTimer.current)
    pubTimer.current = setTimeout(() => { void apiFetch('/api/admin/present/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, state: { slide, marks: m } }) }).catch(() => null) }, 350)
  }, [token])

  const go = useCallback((i: number) => {
    const n = Math.min(Math.max(0, i), Math.max(0, total - 1))
    setIndex(n); setTextAt(null); setLive(null); publish(n, marks)
  }, [total, marks, publish])

  const commit = useCallback((slideId: string, mark: Mark) => {
    setMarks(prev => { const m = { ...prev, [slideId]: [...(prev[slideId] ?? []), mark] }; publish(index, m); return m })
  }, [index, publish])
  const undo = useCallback(() => {
    if (!spec) return
    setMarks(prev => { const list = (prev[spec.id] ?? []).slice(0, -1); const m = { ...prev, [spec.id]: list }; publish(index, m); return m })
  }, [spec, index, publish])
  const clearSlide = useCallback(() => {
    if (!spec) return
    setMarks(prev => { const m = { ...prev }; delete m[spec.id]; publish(index, m); return m })
  }, [spec, index, publish])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(index + 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(index - 1) }
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(total - 1)
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
      else if (e.key === 'Escape') { setTool('pointer'); setTextAt(null) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go, index, total, undo])

  useEffect(() => { document.getElementById(`pthumb-${index}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }) }, [index])

  function saveNotes(next: Record<string, string>) {
    setNotes(next)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => { void apiFetch(`/api/admin/reports/${slug}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presenterNotes: next }) }).catch(() => null) }, 900)
  }

  // Desenho: coordenadas de 0 a 1 dentro do slide
  const overlay = useRef<HTMLDivElement>(null)
  const pos = (e: React.PointerEvent): [number, number] => {
    const r = overlay.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }
  const lastLaser = useRef(0)
  const sendLaser = (v: { x: number; y: number } | null) => { bc.current?.postMessage({ laser: v }) }
  function down(e: React.PointerEvent) {
    if (!spec) return
    const [x, y] = pos(e)
    if (tool === 'text') { setTextAt({ x, y, value: '' }); return }
    if (tool === 'laser') { sendLaser({ x, y }); return }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    if (tool === 'pen' || tool === 'hl') setLive({ t: tool, c: color, w: tool === 'hl' ? 22 : 5, p: [[x, y]] })
    else if (tool === 'rect' || tool === 'circle' || tool === 'arrow') setLive({ t: tool, c: color, w: 5, x1: x, y1: y, x2: x, y2: y })
  }
  function move(e: React.PointerEvent) {
    const [x, y] = pos(e)
    if (tool === 'laser') { const now = performance.now(); if (now - lastLaser.current > 30) { lastLaser.current = now; sendLaser({ x, y }) } return }
    if (!live) return
    if (live.t === 'pen' || live.t === 'hl') {
      const last = live.p[live.p.length - 1]
      if (Math.hypot(x - last[0], y - last[1]) > 0.002) setLive({ ...live, p: [...live.p, [x, y]] })
    } else if (live.t === 'rect' || live.t === 'circle' || live.t === 'arrow') setLive({ ...live, x2: x, y2: y })
  }
  function up() {
    if (tool === 'laser') { sendLaser(null); return }
    if (live && spec) {
      if ((live.t === 'pen' || live.t === 'hl') && live.p.length > 1) commit(spec.id, live)
      else if (live.t === 'rect' || live.t === 'circle' || live.t === 'arrow') { if (Math.hypot(live.x2 - live.x1, live.y2 - live.y1) > 0.01) commit(spec.id, live) }
    }
    setLive(null)
  }
  function addText() {
    if (textAt && spec && textAt.value.trim()) commit(spec.id, { t: 'text', c: color, x: textAt.x, y: textAt.y, s: textAt.value.trim(), sz: 30 })
    setTextAt(null)
  }

  const clientUrl = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/apresentacao/${token}` : null
  const openClient = () => { if (clientUrl) window.open(clientUrl, 'present-client', 'popup=yes,width=1280,height=720') }
  const copy = async () => { if (!clientUrl) return; try { await navigator.clipboard.writeText(clientUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { } }
  const fullscreen = () => { try { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen() } catch { } }

  if (error) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}><div><p style={{ fontSize: 15 }}>{error}</p><Link href="/admin" className="btn btn-outline btn-sm" style={{ marginTop: 12 }}>Ir para a administração</Link></div></div>
  if (!report || !spec) return <PulseLoader fullscreen size={72} caption="Carregando a apresentação" />

  const clientName = report.snapshot.data.client.name
  const progress = total > 1 ? ((index + 1) / total) * 100 : 100

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12, padding: 12, boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <header className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', flexWrap: 'wrap' }}>
        <Link href="/admin/reports" aria-label="Voltar ao Report Studio" title="Voltar ao Report Studio" style={{ ...iconBtn, border: 'none', background: 'none' }}><Home size={18} strokeWidth={1.75} /></Link>
        {report.snapshot.data.client.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={report.snapshot.data.client.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'contain', background: 'var(--bg-card2)' }} />
          : <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)', fontWeight: 800 }}>{clientName.slice(0, 1).toUpperCase()}</span>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{clientName} · {report.periodLabel}</div>
        </div>
        <button type="button" style={{ ...iconBtn, color: side ? 'var(--accent)' : undefined }} onClick={() => setSide(v => !v)} aria-pressed={side} aria-label="Painel lateral" title="Painel lateral (próximo slide e notas)"><PanelRight size={16} strokeWidth={1.75} /></button>
        <button type="button" style={{ ...iconBtn, color: strip ? 'var(--accent)' : undefined }} onClick={() => setStrip(v => !v)} aria-pressed={strip} aria-label="Miniaturas" title="Miniaturas"><GalleryHorizontal size={16} strokeWidth={1.75} /></button>
        <button type="button" style={iconBtn} onClick={fullscreen} aria-label="Tela cheia" title="Tela cheia"><Maximize size={16} strokeWidth={1.75} /></button>
        <button type="button" style={{ ...iconBtn, color: tools ? 'var(--accent)' : undefined }} onClick={() => setTools(v => !v)} aria-pressed={tools} aria-label="Ferramentas de anotação" title="Ferramentas de anotação"><Pencil size={16} strokeWidth={1.75} /></button>
        <button type="button" style={iconBtn} onClick={copy} aria-label="Copiar link do cliente" title={copied ? 'Link copiado' : 'Copiar link do cliente'}><Copy size={16} strokeWidth={1.75} color={copied ? 'var(--green)' : undefined} /></button>
        <button type="button" onClick={openClient} disabled={!clientUrl} style={{ height: 36, padding: '0 16px', borderRadius: 999, border: '1.5px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text-1)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <ExternalLink size={14} strokeWidth={1.75} /> Abrir tela do cliente
        </button>
      </header>

      {/* Palco + painel lateral */}
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
        <div style={{ flex: '3 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div ref={stageRef} style={{ position: 'relative', width: '100%', display: 'grid', placeItems: 'center', background: '#000', borderRadius: 16, overflow: 'hidden', aspectRatio: `${STAGE.w} / ${STAGE.h}` }}>
            <SlideView spec={spec} scale={stageScale} marks={marks[spec.id]}>
              {live && <div style={{ position: 'absolute', inset: 0 }}><MarksLayer marks={[]} live={live} /></div>}
              {tool !== 'pointer' && (
                <div ref={overlay} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => { if (tool === 'laser') sendLaser(null) }} style={{ position: 'absolute', inset: 0, cursor: tool === 'text' ? 'text' : tool === 'laser' ? 'none' : 'crosshair', touchAction: 'none' }} />
              )}
              {textAt && (
                <input autoFocus value={textAt.value} maxLength={120} placeholder="Escreva e tecle Enter" onChange={e => setTextAt({ ...textAt, value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') addText(); if (e.key === 'Escape') setTextAt(null) }} onBlur={addText}
                  style={{ position: 'absolute', left: `${textAt.x * 100}%`, top: `${textAt.y * 100}%`, transform: 'translateY(-50%)', minWidth: 180, padding: '4px 8px', borderRadius: 8, border: `2px solid ${color}`, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 16 }} />
              )}
            </SlideView>
            {/* barra de progresso do slide */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: 'rgba(255,255,255,.12)' }}><div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #4C46C8, #9FAFFF)', transition: 'width .25s' }} /></div>
            <span style={{ position: 'absolute', right: 12, bottom: 14, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{pad2(index + 1)} / {pad2(total)}</span>
            {tools && (
              <div role="toolbar" aria-label="Anotações" style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4, padding: 6, borderRadius: 999, background: 'rgba(60,60,70,.72)', backdropFilter: 'blur(6px)', maxWidth: '96%', flexWrap: 'wrap', justifyContent: 'center' }}>
                {([['pointer', MousePointer2, 'Selecionar (sem desenhar)'], ['laser', Target, 'Laser'], ['pen', Pencil, 'Caneta'], ['hl', Highlighter, 'Marca-texto'], ['rect', Square, 'Retângulo'], ['circle', Circle, 'Círculo'], ['arrow', ArrowUpRight, 'Seta'], ['text', Type, 'Texto']] as const).map(([k, Icon, label]) => (
                  <button key={k} type="button" onClick={() => setTool(k)} aria-pressed={tool === k} aria-label={label} title={label} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer', background: tool === k ? 'rgba(255,255,255,.28)' : 'transparent', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon size={16} strokeWidth={1.75} /></button>
                ))}
                <span aria-hidden="true" style={{ width: 1, height: 20, background: 'rgba(255,255,255,.25)' }} />
                <button type="button" onClick={undo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: '#fff', display: 'grid', placeItems: 'center' }}><Undo2 size={16} strokeWidth={1.75} /></button>
                <button type="button" onClick={clearSlide} aria-label="Apagar anotações deste slide" title="Apagar anotações deste slide" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: '#fff', display: 'grid', placeItems: 'center' }}><Eraser size={16} strokeWidth={1.75} /></button>
                {tool !== 'pointer' && tool !== 'laser' && COLORS.map(c => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Cor ${c}`} aria-pressed={color === c} style={{ width: 16, height: 16, borderRadius: '50%', border: color === c ? '2px solid #fff' : '2px solid transparent', background: c, cursor: 'pointer', outline: c === '#FFFFFF' ? '1px solid rgba(255,255,255,.4)' : undefined }} />)}
              </div>
            )}
          </div>
        </div>

        {side && (
          <aside style={{ flex: '1 1 300px', maxWidth: 420, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <section className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Próximo slide</h3><span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{nextSpec ? pad2(index + 2) : '—'}</span></div>
              <div ref={nextRef} style={{ width: '100%', aspectRatio: `${STAGE.w} / ${STAGE.h}`, borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card2)', display: 'grid', placeItems: 'center' }}>
                {nextSpec ? <SlideView spec={nextSpec} scale={nextScale} /> : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Último slide</span>}
              </div>
            </section>
            <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--border-soft)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Notas do apresentador</h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}><RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />{pad2(index + 1)}</span>
              </div>
              <textarea aria-label="Notas do apresentador" value={notes[spec.id] ?? ''} onChange={e => saveNotes({ ...notes, [spec.id]: e.target.value })} placeholder="Adicione notas para lembrar de falar…" maxLength={2000}
                style={{ flex: 1, minHeight: 140, marginTop: 12, border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: 'var(--text-1)', fontSize: 14, lineHeight: 1.6, fontFamily: 'inherit' }} />
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Só você vê estas notas. O cliente vê apenas o slide.</div>
            </section>
          </aside>
        )}
      </div>

      {/* Miniaturas */}
      {strip && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}>
          <button type="button" style={{ ...iconBtn, border: 'none', background: 'none', flexShrink: 0 }} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Slide anterior"><ArrowLeft size={18} strokeWidth={1.75} /></button>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', flex: 1, padding: '4px 2px' }}>
            {slides.map((s, i) => (
              <button key={s.id} id={`pthumb-${i}`} type="button" onClick={() => go(i)} aria-label={`Slide ${i + 1}: ${s.label}`} aria-current={i === index} style={{ flexShrink: 0, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', contentVisibility: 'auto' }}>
                <div style={{ borderRadius: 8, overflow: 'hidden', outline: i === index ? '2px solid var(--accent)' : '1px solid var(--border)', outlineOffset: i === index ? 1 : 0, opacity: i === index ? 1 : 0.8 }}><SlideView spec={s} scale={0.118} /></div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(index + 1)} disabled={index >= total - 1} aria-label="Próximo slide" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'var(--text-1)', color: 'var(--bg-card)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, opacity: index >= total - 1 ? 0.4 : 1 }}><ArrowRight size={18} strokeWidth={1.75} /></button>
        </div>
      )}
    </div>
  )
}
