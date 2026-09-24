'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildSlides } from '@/lib/reportSlides'
import type { PresentState } from '@/lib/presentation'
import type { SavedReport } from '@/lib/report'
import { rewriteImages, SlideView, useFit } from './SlideView'
import { PulseLoader } from '@/components/PulseLoader'

type Loaded = Pick<SavedReport, 'title' | 'mode' | 'theme' | 'snapshot'>

/** Tela do cliente: só o slide, sem controles, seguindo o apresentador. Pensada para ser compartilhada no Meet ou aberta pelo cliente. */
export function ClientScreen({ token }: { token: string }) {
  const [report, setReport] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<PresentState>({ slide: 0, marks: {}, at: 0 })
  const { ref, scale } = useFit<HTMLDivElement>(3, 0)
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/present/${token}`, { cache: 'no-store' }).then(async r => { const j = await r.json().catch(() => ({})); if (!alive) return; if (!r.ok) setError(j.error ?? 'Este link não está disponível.'); else setReport(j as Loaded) }).catch(() => { if (alive) setError('Sem conexão. Recarregue a página.') })
    return () => { alive = false }
  }, [token])

  // Acompanha o apresentador: na hora quando estão no mesmo navegador (janela aberta pelo botão) e, para qualquer outro aparelho, a cada 1,5 s.
  useEffect(() => {
    let alive = true, last = 0
    const apply = (s: PresentState) => { if (alive && s.at >= last) { last = s.at; setState(s) } }
    const poll = () => fetch(`/api/present/${token}/state`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((s: PresentState | null) => { if (s) apply(s) }).catch(() => { })
    poll()
    const id = setInterval(poll, 1500)
    let bc: BroadcastChannel | null = null
    try { bc = new BroadcastChannel(`present:${token}`); bc.onmessage = e => { const d = e.data as PresentState & { laser?: { x: number; y: number } | null }; if ('laser' in d && d.laser !== undefined) setLaser(d.laser); else apply(d) } } catch { }
    return () => { alive = false; clearInterval(id); bc?.close() }
  }, [token])

  const slides = useMemo(() => (report ? rewriteImages(buildSlides(report.snapshot.data, report.snapshot.notes, report.mode, report.theme), token) : []), [report, token])
  const index = Math.min(state.slide, Math.max(0, slides.length - 1))
  const spec = slides[index]

  useEffect(() => { document.title = report ? `${report.title} · Grupo Don` : 'Apresentação · Grupo Don' }, [report])

  if (error) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05050B', color: '#fff', padding: 24, textAlign: 'center' }}>{error}</div>
  return (
    <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#000', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      {spec ? <SlideView spec={spec} scale={scale} marks={state.marks[spec.id]}>{laser && <span aria-hidden="true" style={{ position: 'absolute', left: `${laser.x * 100}%`, top: `${laser.y * 100}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: '50%', background: 'radial-gradient(circle, #FF4D4D 0 35%, rgba(255,77,77,.35) 60%, transparent 70%)', pointerEvents: 'none' }} />}</SlideView> : <PulseLoader size={72} />}
    </div>
  )
}
