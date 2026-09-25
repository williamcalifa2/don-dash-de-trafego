/** Sinais de qualidade coletados no navegador: cliques de raiva e mortos, rolagem, erros de tela e tempo até a tela ficar pronta. */

// ─── Cliques de raiva ────────────────────────────────────────────────────────

export const RAGE_MIN = 3
export const RAGE_GAP_MS = 1000
export const RAGE_RADIUS = 40

export interface RageBurst<T> { first: T; n: number }

/**
 * Detecta rajadas: 3 ou mais cliques quase no mesmo ponto, cada um até 1 s depois do anterior.
 * A rajada só é fechada quando a pessoa para (ou pelo `drain`), então sai uma vez, com o total de cliques.
 */
export function createRageDetector<T>(min = RAGE_MIN, gap = RAGE_GAP_MS, radius = RAGE_RADIUS) {
  let cur: { x: number; y: number; last: number; n: number; first: T } | null = null
  const done: Array<RageBurst<T>> = []
  const close = () => { if (cur && cur.n >= min) done.push({ first: cur.first, n: cur.n }); cur = null }
  return {
    feed(x: number, y: number, t: number, first: T) {
      if (cur && t - cur.last <= gap && Math.hypot(x - cur.x, y - cur.y) <= radius) { cur.n++; cur.last = t }
      else { close(); cur = { x, y, last: t, n: 1, first } }
    },
    /** Rajadas terminadas. `force` fecha também a que ainda está em andamento (a pessoa saiu da página). */
    drain(now: number, force = false): Array<RageBurst<T>> {
      if (cur && (force || now - cur.last > gap)) close()
      return done.splice(0)
    },
  }
}

// ─── Cliques mortos ──────────────────────────────────────────────────────────

const ACTION = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="link"], [role="switch"], [role="option"]'
const RESPONDS_BY_ITSELF = 'input, select, textarea, label, summary, video, audio, [contenteditable="true"], [data-hm-ignore]'

/** O elemento clicado parece botão ou link? Campos, seletores e coisas que já respondem sozinhas (foco, abrir/fechar) ficam de fora. */
export function deadCandidate(target: Element): Element | null {
  if (target.closest(RESPONDS_BY_ITSELF)) return null
  let el: Element | null = target.closest(ACTION)
  if (!el) {
    let a: Element | null = target
    for (let i = 0; a && a !== document.body && i < 4; i++, a = a.parentElement) {
      if (getComputedStyle(a).cursor === 'pointer') { el = a; break }
    }
  }
  if (!el) return null
  if (el.matches(':disabled, [aria-disabled="true"]')) return null
  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute('href') ?? ''
    // Abre outra aba, baixa arquivo ou chama outro app: a resposta acontece fora da página.
    if (el.target === '_blank' || el.hasAttribute('download') || /^(mailto:|tel:|whatsapp:|sms:)/i.test(href)) return null
  }
  return el
}

/**
 * Espera a página reagir a um clique. Reação = algo mudou na tela, o endereço mudou, o foco foi para outro lugar,
 * uma requisição saiu ou a janela perdeu o foco (nova aba, download). `done(false)` = ninguém respondeu.
 */
export function watchResponse(clicked: Element, done: (responded: boolean) => void, ms = 1500): void {
  const url = location.href
  const active = document.activeElement
  let responded = false
  let finished = false
  const hit = () => { responded = true }
  const mo = new MutationObserver(recs => {
    for (const r of recs) {
      const t = r.target instanceof Element ? r.target : r.target.parentElement
      if (t?.closest('[data-hm-ignore]')) continue
      if (r.type === 'attributes' && r.target === clicked) continue // efeito de "apertado" do próprio botão não conta como resposta
      responded = true; return
    }
  })
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
  let po: PerformanceObserver | null = null
  try {
    po = new PerformanceObserver(list => { if (list.getEntries().some(e => !e.name.includes('/api/usage/beat'))) hit() })
    po.observe({ type: 'resource' })
  } catch { po = null }
  window.addEventListener('blur', hit)
  document.addEventListener('visibilitychange', hit)
  window.setTimeout(() => {
    if (finished) return
    finished = true
    mo.disconnect(); po?.disconnect()
    window.removeEventListener('blur', hit); document.removeEventListener('visibilitychange', hit)
    done(responded || location.href !== url || document.activeElement !== active)
  }, ms)
}

// ─── Rolagem ─────────────────────────────────────────────────────────────────

/** Quanto da página a pessoa já viu (0–100), contando o pé da janela. Nulo se a página cabe na tela (não há o que rolar). */
export function scrollDepth(): number | null {
  const h = document.documentElement.scrollHeight
  const vh = window.innerHeight
  if (!h || h < vh * 1.2) return null
  return Math.min(100, Math.round(((window.scrollY + vh) / h) * 100))
}

// ─── Erros de tela ───────────────────────────────────────────────────────────

export interface ErrorSignal { msg: string; file: string | null; line: number | null }

const baseName = (u: string) => (u.split('?')[0].split('#')[0].split('/').pop() ?? '').slice(0, 60)

/** Erro de JavaScript da página (ou promessa rejeitada) já em forma de sinal. Erros de extensões do navegador e de outra origem sem detalhe ficam de fora. */
export function errorSignal(e: ErrorEvent | PromiseRejectionEvent): ErrorSignal | null {
  if ('reason' in e) {
    const r = e.reason as unknown
    const msg = r instanceof Error ? r.message : typeof r === 'string' ? r : ''
    return msg ? { msg, file: null, line: null } : null
  }
  if (/extension:\/\//i.test(e.filename ?? '')) return null
  const msg = e.message || (e.error instanceof Error ? e.error.message : '')
  if (!msg) return null
  const file = e.filename ? baseName(e.filename) : ''
  return { msg, file: /^[\w.@~-]{1,60}$/.test(file) ? file : null, line: Number.isFinite(e.lineno) && e.lineno > 0 ? e.lineno : null }
}

// ─── Desempenho ──────────────────────────────────────────────────────────────

export interface Vitals { lcp: () => number | null; cls: () => number }

/** LCP (quando o maior elemento apareceu) e CLS (quanto a tela "pulou") da página. Navegador sem suporte devolve nulo e zero. */
export function createVitals(): Vitals {
  let lcp: number | null = null
  let cls = 0
  try {
    new PerformanceObserver(list => { const e = list.getEntries(); if (e.length) lcp = Math.round(e[e.length - 1].startTime) }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch { /* sem suporte */ }
  try {
    new PerformanceObserver(list => { for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  } catch { /* sem suporte */ }
  return { lcp: () => lcp, cls: () => Math.round(cls * 1000) / 1000 }
}

export interface ReadyEvent { view: string; client: string; value: number; meta: Record<string, number | string> }

const READY_QUIET_MS = 700
const READY_CAP_MS = 15_000

/**
 * Mede quanto tempo a tela leva para ficar pronta: do momento em que ela entra (ou do início do carregamento da página)
 * até parar de receber elementos novos por 0,7 s. Tela que nunca assenta (passou de 15 s) ou aba escondida no meio: não conta.
 * Só elementos entrando ou saindo contam; contadores que trocam texto não seguram a medida.
 */
export function createReadyProbe(emit: (e: ReadyEvent) => void, vitals: Vitals) {
  let stop: (() => void) | null = null
  let emitted = false
  return {
    begin(view: string, client: string) {
      stop?.()
      const start = performance.now()
      const load = !emitted && start < 8000 // primeira tela da página: conta desde o início do carregamento
      const t0 = load ? 0 : start
      let last = start
      let timer: ReturnType<typeof setTimeout> | undefined
      let over = false
      const cleanup = () => { over = true; clearTimeout(timer); mo.disconnect(); document.removeEventListener('visibilitychange', onHide); stop = null }
      const onHide = () => { if (document.visibilityState === 'hidden') cleanup() }
      const check = () => {
        if (over) return
        if (load && document.readyState !== 'complete') { timer = setTimeout(check, READY_QUIET_MS); return }
        if (performance.now() - t0 > READY_CAP_MS + READY_QUIET_MS) { cleanup(); return }
        cleanup()
        const meta: Record<string, number | string> = { nav: load ? 'load' : 'tab' }
        if (load) {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
          if (nav && nav.responseStart > 0) meta.ttfb = Math.round(nav.responseStart)
          const lcp = vitals.lcp(); if (lcp != null) meta.lcp = lcp
          meta.cls = vitals.cls()
        }
        emitted = true
        emit({ view, client, value: Math.max(0, Math.round(last - t0)), meta })
      }
      const mo = new MutationObserver(recs => {
        if (over) return
        const structural = recs.some(r => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element && !n.closest('[data-hm-ignore]')))
        if (!structural) return
        last = performance.now()
        clearTimeout(timer); timer = setTimeout(check, READY_QUIET_MS)
      })
      mo.observe(document.documentElement, { childList: true, subtree: true })
      document.addEventListener('visibilitychange', onHide)
      timer = setTimeout(check, READY_QUIET_MS)
      stop = cleanup
    },
    stop() { stop?.() },
  }
}
