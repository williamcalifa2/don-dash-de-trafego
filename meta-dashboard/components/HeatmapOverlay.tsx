'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { currentView, docSize, pagePosition } from '@/lib/usageClient'
import { deviceOf, type HeatPoint } from '@/lib/usage'

interface HeatResponse { setup?: string; total?: number; users?: number; points?: HeatPoint[]; bands?: number[] }

const MODE_TEXT: Record<string, [string, string]> = { clicks: ['clique', 'cliques'], rage: ['clique de raiva', 'cliques de raiva'], dead: ['clique morto', 'cliques mortos'], scroll: ['visita', 'visitas'] }

const PERIODS: Array<[string, string]> = [['today', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']]
const RADIUS = 34

/** Paleta do calor (frio → quente), montada uma vez. */
function palette(): Uint8ClampedArray {
  const c = document.createElement('canvas'); c.width = 1; c.height = 256
  const g = c.getContext('2d') as CanvasRenderingContext2D
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0.0, 'rgb(40,80,255)'); grad.addColorStop(0.35, 'rgb(0,220,255)'); grad.addColorStop(0.55, 'rgb(60,230,90)')
  grad.addColorStop(0.75, 'rgb(255,230,40)'); grad.addColorStop(1.0, 'rgb(255,40,30)')
  g.fillStyle = grad; g.fillRect(0, 0, 1, 256)
  return g.getImageData(0, 0, 1, 256).data
}

/**
 * Mapa de calor sobre a própria tela. Abre com ?hm=1 (a página Heatmap monta o endereço): busca os cliques agrupados
 * e desenha o calor em cima de cada elemento, então acompanha a tela mesmo com tamanhos diferentes. Só administração.
 */
export function HeatmapOverlay() {
  const pathname = usePathname()
  const [params, setParams] = useState<URLSearchParams | null>(null)
  const [data, setData] = useState<HeatResponse | null>(null)
  const [period, setPeriod] = useState('7')
  const [missing, setMissing] = useState(0)
  const [denied, setDenied] = useState(false)
  const [embed, setEmbed] = useState(false)
  const [mode, setMode] = useState('clicks')
  const [liveView, setLiveView] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<HeatPoint[]>([])
  const bandsRef = useRef<number[]>([])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('hm') === '1') { setParams(p); setEmbed(p.get('hm_embed') === '1'); setPeriod(p.get('hm_period') ?? '7'); setMode(p.get('hm_mode') ?? 'clicks'); setDenied(false) } else setParams(null)
  }, [pathname])

  // A aba e a sub-aba do painel chegam depois da página (o painel troca de aba e a sub-aba monta quando os dados chegam),
  // então acompanha as mudanças em vez de olhar uma vez só. Sem isso o mapa buscava os cliques da tela errada.
  useEffect(() => {
    if (!params) return
    const read = () => setLiveView(currentView())
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-subview'] })
    return () => mo.disconnect()
  }, [params, pathname])

  // Tela a mostrar: a que o visualizador pediu (hm_view) ou, sem pedido, a que a página está mostrando agora.
  const view = params?.get('hm_view') || liveView

  // Busca os pontos quando a tela já publicou em que aba está (o painel do cliente demora um instante).
  useEffect(() => {
    if (!params || !view) return
    let alive = true
    setData(null)
    const q = new URLSearchParams({ view, period, mode, device: deviceOf(window.innerWidth) })
    const c = params.get('hm_client'), u = params.get('hm_user')
    if (c) q.set('client', c)
    if (u) q.set('user', u)
    fetch(`/api/admin/usage/heatmap?${q.toString()}`, { cache: 'no-store' }).then(async r => {
      if (!alive) return
      if (r.status === 401 || r.status === 403) { setDenied(true); return }
      const j = await r.json().catch(() => null) as HeatResponse | null
      if (!alive) return
      pointsRef.current = j?.points ?? []
      bandsRef.current = j?.bands ?? []
      setData(j ?? { setup: 'error' })
      if (window.parent !== window) window.parent.postMessage({ type: 'hm-data', total: j?.total ?? 0, users: j?.users ?? 0, setup: j?.setup ?? null }, window.location.origin)
    }).catch(() => { if (alive) setData({ setup: 'error' }) })
    return () => { alive = false }
  }, [params, period, mode, view])

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.width = '0'; canvas.style.height = '0' // sem isso o próprio mapa segura a altura da página e ela nunca encolhe
    const { w, h } = docSize()
    canvas.width = w; canvas.height = h
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    if (mode === 'scroll') {
      const bands = bandsRef.current
      if (!bands.length) return
      const pal = palette()
      bands.forEach((reach, i) => {
        const k = Math.round(Math.min(1, Math.max(0, reach)) * 255) * 4
        ctx.fillStyle = `rgba(${pal[k]},${pal[k + 1]},${pal[k + 2]},0.5)`
        ctx.fillRect(0, Math.round((i / bands.length) * h), w, Math.ceil(h / bands.length) + 1)
      })
      ctx.font = '600 12px system-ui, sans-serif'
      for (const at of [0.25, 0.5, 0.75]) {
        const y = Math.round(at * h)
        const pct = Math.round((bands[Math.min(bands.length - 1, Math.floor(at * bands.length))] ?? 0) * 100)
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, y - 1, w, 2)
        const text = `${pct}% chegam até aqui`
        const tw = ctx.measureText(text).width
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(8, y + 6, tw + 16, 22)
        ctx.fillStyle = '#fff'; ctx.fillText(text, 16, y + 21)
      }
      setMissing(0)
      if (window.parent !== window) window.parent.postMessage({ type: 'hm-stats', missing: 0 }, window.location.origin)
      return
    }
    const pts = pointsRef.current
    const maxN = Math.max(1, ...pts.map(p => p.n))
    let miss = 0
    for (const p of pts) {
      const pos = pagePosition(p)
      if (!pos) { miss += p.n; continue }
      const a = Math.min(1, 0.25 + 0.75 * (p.n / maxN))
      const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, RADIUS)
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(pos.x - RADIUS, pos.y - RADIUS, RADIUS * 2, RADIUS * 2)
    }
    setMissing(miss)
    if (window.parent !== window) window.parent.postMessage({ type: 'hm-stats', missing: miss }, window.location.origin)
    // Troca a intensidade acumulada (canal alpha) pela cor da paleta.
    const pal = palette()
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i]
      if (!a) continue
      const k = Math.min(255, a) * 4
      d[i - 3] = pal[k]; d[i - 2] = pal[k + 1]; d[i - 1] = pal[k + 2]; d[i] = Math.min(185, a + 15)
    }
    ctx.putImageData(img, 0, 0)
  }, [mode])

  // Redesenha quando a tela muda de tamanho ou de conteúdo (sem olhar o que o próprio mapa desenha).
  useEffect(() => {
    if (!data || (!data.points && !data.bands)) return
    paint()
    let t: ReturnType<typeof setTimeout> | undefined
    const later = () => { if (t) clearTimeout(t); t = setTimeout(paint, 500) }
    const mo = new MutationObserver(recs => { if (recs.some(r => !(r.target instanceof Element && r.target.closest('[data-hm-ignore]')))) later() })
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', later)
    return () => { mo.disconnect(); window.removeEventListener('resize', later); if (t) clearTimeout(t) }
  }, [data, paint])

  const close = () => {
    const p = new URLSearchParams(window.location.search)
    for (const k of [...p.keys()]) if (k.startsWith('hm')) p.delete(k)
    const qs = p.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    setParams(null); setData(null)
  }

  if (!params || denied) return null
  const total = data?.total ?? 0
  return (
    <div data-hm-ignore>
      <canvas ref={canvasRef} data-hm-ignore aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 9990 }} />
      {!embed && <div data-hm-ignore role="dialog" aria-label="Mapa de calor" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 9999, width: 300, background: 'var(--bg-card)', color: 'var(--text-1)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-elegant)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 14 }}>Mapa de calor</strong>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label="Fechar mapa de calor" title="Fechar"><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Período">
          {PERIODS.map(([k, l]) => (
            <button key={k} type="button" className="btn btn-sm" aria-pressed={period === k} onClick={() => setPeriod(k)} style={{ height: 30, background: period === k ? 'var(--accent-soft)' : 'var(--bg-card)', border: `1px solid ${period === k ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-1)', fontWeight: period === k ? 700 : 500 }}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {data == null ? 'Carregando…'
            : data.setup === 'tables' ? 'O banco ainda não tem as tabelas de uso. Rode o SQL supabase/2026-09-usage-analytics.sql.'
            : data.setup === 'events' ? 'O banco ainda não tem a tabela de sinais. Rode o SQL supabase/2026-09-usage-analytics-3.sql.'
            : total === 0 ? 'Nada registrado nesta tela, neste tamanho de janela e período.'
            : <>{total} {(MODE_TEXT[mode] ?? MODE_TEXT.clicks)[total === 1 ? 0 : 1]} de {data.users} pessoa{data.users === 1 ? '' : 's'} nesta tela. {missing > 0 && `${missing} em elementos que não estão nesta tela agora.`}</>}
        </div>
        <a href="/admin/heatmap" className="btn btn-outline btn-sm" style={{ justifyContent: 'center', textDecoration: 'none' }}>← Voltar ao Heatmap</a>
        <div aria-hidden="true" style={{ height: 8, borderRadius: 9999, background: 'linear-gradient(90deg, rgb(40,80,255), rgb(0,220,255), rgb(60,230,90), rgb(255,230,40), rgb(255,40,30))' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}><span>menos cliques</span><span>mais cliques</span></div>
      </div>}
    </div>
  )
}
