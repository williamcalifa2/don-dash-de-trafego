'use client'

import { useEffect } from 'react'
import { currentClient, currentView, locateClick, type ClickSpot } from '@/lib/usageClient'
import { cleanError, type EventKind } from '@/lib/usage'
import { createRageDetector, createReadyProbe, createVitals, deadCandidate, errorSignal, scrollDepth, watchResponse } from '@/lib/usageSignals'

const BEAT_MS = 15_000
const IDLE_MS = 60_000
const MAX_CLICKS = 200
const MAX_EVENTS = 40
const MAX_ERRORS = 20
const MAX_DEAD = 10
const RETRY_MS = 60_000

interface Signal { kind: EventKind; view: string; client: string; sel?: string; rx?: number; ry?: number; n?: number; value?: number; label?: string | null; msg?: string; meta?: Record<string, number | string> }

/**
 * Coleta o uso do app para a análise da administração: presença, tempo ativo por tela e cliente, cliques (posição, nunca conteúdo)
 * e sinais de qualidade (cliques de raiva e mortos, rolagem, erros de tela, tempo até a tela ficar pronta).
 * Conta tempo só com a aba visível e a pessoa mexendo. Sem sessão (login, apresentação pública) o servidor recusa e o coletor desliga.
 */
export function UsageTracker() {
  useEffect(() => {
    // Olhando o mapa de calor (inclusive dentro do visualizador): não coleta, para a análise não contar os próprios cliques.
    if (new URLSearchParams(window.location.search).get('hm') === '1') return
    let sid = ''
    try { sid = sessionStorage.getItem('don_usage_sid') ?? '' } catch { /* sem sessionStorage */ }
    if (!sid) {
      sid = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('')
      try { sessionStorage.setItem('don_usage_sid', sid) } catch { /* segue só nesta página */ }
    }

    let off = false
    let retryAt = 0
    let lastInput = Date.now()
    const pending = new Map<string, { client: string; view: string; delta: number }>()
    let clicks: ClickSpot[] = []
    let events: Signal[] = []
    let lastFlush = 0
    let errorCount = 0
    let deadCount = 0
    const seenErrors = new Set<string>()
    const scroll = new Map<string, { view: string; client: string; max: number; sent: number }>()
    const rage = createRageDetector<ClickSpot>()
    const vitals = createVitals()

    const push = (s: Signal) => { if (events.length < MAX_EVENTS) events.push(s) }
    const probe = createReadyProbe(r => push({ kind: 'perf', view: r.view, client: r.client, value: r.value, meta: r.meta }), vitals)

    const touch = () => { lastInput = Date.now() }
    const onClick = (e: MouseEvent) => {
      touch()
      const spot = clicks.length >= MAX_CLICKS ? null : locateClick(e)
      if (spot) clicks.push(spot)
      const mouse = e.detail > 0 || e.clientX !== 0 || e.clientY !== 0
      if (spot && mouse) {
        rage.feed(e.clientX, e.clientY, Date.now(), spot)
        // Clique em algo que parece botão e que não muda nada na tela: espera a reação da página antes de decidir.
        const target = e.target instanceof Element ? e.target : null
        const el = target && deadCount < MAX_DEAD && spot.sel !== 'body' ? deadCandidate(target) : null
        if (el) watchResponse(el, responded => { if (!responded && deadCount < MAX_DEAD) { deadCount++; push({ kind: 'dead', view: spot.view, client: spot.client, sel: spot.sel, rx: spot.rx, ry: spot.ry, label: spot.label }) } })
      }
      if (clicks.length >= 30) flush() // rajada de cliques: manda já, para não perder nada se a pessoa sair da tela
    }

    const drainRage = (force = false) => {
      for (const b of rage.drain(Date.now(), force)) push({ kind: 'rage', view: b.first.view, client: b.first.client, sel: b.first.sel, rx: b.first.rx, ry: b.first.ry, n: b.n, label: b.first.label })
    }

    const sampleScroll = (view: string, client: string) => {
      const d = scrollDepth()
      if (d == null) return
      const key = `${client}|${view}`
      const cur = scroll.get(key) ?? { view, client, max: 0, sent: -1 }
      cur.max = Math.max(cur.max, d)
      scroll.set(key, cur)
    }
    const collectScroll = () => {
      for (const s of scroll.values()) {
        if (s.sent >= 0 && s.max - s.sent < 5) continue // só manda quando avançou pelo menos 5 pontos
        push({ kind: 'scroll', view: s.view, client: s.client, value: s.max })
        s.sent = s.max
      }
    }

    const tick = () => {
      const view = currentView()
      if (!view || document.visibilityState !== 'visible') return
      const client = currentClient()
      sampleScroll(view, client)
      if (Date.now() - lastInput > IDLE_MS) return
      const key = `${client}|${view}`
      const cur = pending.get(key) ?? { client, view, delta: 0 }
      cur.delta += 1
      pending.set(key, cur)
    }

    const onError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const view = currentView()
      if (!view || errorCount >= MAX_ERRORS) return
      const sig = errorSignal(e)
      const msg = sig ? cleanError(sig.msg) : null
      if (!sig || !msg) return
      const key = `${view}|${msg}`
      if (seenErrors.has(key)) return
      seenErrors.add(key); errorCount++
      push({ kind: 'error', view, client: currentClient(), msg, meta: { ...(sig.file ? { file: sig.file } : {}), ...(sig.line ? { line: sig.line } : {}) } })
    }

    const flush = (useBeacon = false) => {
      if (off || Date.now() < retryAt) return
      drainRage(useBeacon)
      collectScroll()
      const view = currentView()
      const entries = [...pending.values()].filter(e => e.delta > 0)
      // Cliques e sinais carregam a tela e o cliente do instante em que aconteceram, então mandar depois de trocar de tela não erra a atribuição.
      if (!view && !clicks.length && !events.length) return
      if (!entries.length && !clicks.length && !events.length && Date.now() - lastFlush < BEAT_MS - 1000) return
      const sending = { entries, clicks, events }
      const body = JSON.stringify({ sid, view: view || (clicks[0]?.view ?? events[0]?.view ?? 'admin'), client: currentClient(), w: window.innerWidth, entries, clicks, events })
      pending.clear(); clicks = []; events = []; lastFlush = Date.now()
      if (useBeacon && navigator.sendBeacon) { navigator.sendBeacon('/api/usage/beat', new Blob([body], { type: 'application/json' })); return }
      fetch('/api/usage/beat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
        .then(r => {
          if (r.status === 401) { off = true; return } // sem sessão (login, apresentação pública): desliga nesta página
          if (r.status >= 500) { retryAt = Date.now() + RETRY_MS; requeue(sending) } // banco fora do ar ou sem tabelas: guarda e tenta de novo em 1 min
        })
        .catch(() => { requeue(sending) })
    }
    const requeue = (b: { entries: Array<{ client: string; view: string; delta: number }>; clicks: ClickSpot[]; events: Signal[] }) => {
      for (const e of b.entries) { const k = `${e.client}|${e.view}`; const cur = pending.get(k); if (cur) cur.delta += e.delta; else pending.set(k, { ...e }) }
      clicks = [...b.clicks, ...clicks].slice(-MAX_CLICKS)
      events = [...b.events, ...events].slice(-MAX_EVENTS)
    }

    // Trocou de aba dentro do painel: manda o tempo da anterior na hora, para não atribuir ao lugar errado, e mede a nova.
    let lastKey = ''
    const watch = () => {
      const view = currentView()
      const k = `${currentClient()}|${view}`
      if (k === lastKey) return
      if (lastKey) flush()
      lastKey = k
      if (view) probe.begin(view, currentClient())
    }
    watch()

    const second = window.setInterval(() => { tick(); drainRage(); watch() }, 1000)
    const beat = window.setInterval(() => flush(), BEAT_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true) }
    const onPageHide = () => flush(true)
    const opts = { passive: true } as const
    document.addEventListener('click', onClick, true)
    for (const ev of ['mousemove', 'keydown', 'scroll', 'touchstart'] as const) window.addEventListener(ev, touch, opts)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onError)
    const first = window.setTimeout(() => flush(), 2000)

    return () => {
      off = true
      probe.stop()
      window.clearInterval(second); window.clearInterval(beat); window.clearTimeout(first)
      document.removeEventListener('click', onClick, true)
      for (const ev of ['mousemove', 'keydown', 'scroll', 'touchstart'] as const) window.removeEventListener(ev, touch)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onError)
    }
  }, [])
  return null
}
