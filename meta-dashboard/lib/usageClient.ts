import { cleanLabel } from './usage'

/** Peças do navegador para a análise de uso: em que tela a pessoa está e onde ela clicou (só estrutura, nunca conteúdo). */

/**
 * Tela atual. O painel do cliente publica a aba em <body data-view> (e a sub-aba em data-subview); a administração é reconhecida pelo endereço.
 * Vazio = não rastrear: login, apresentação pública e a própria página Heatmap (olhar o mapa não pode gerar cliques no mapa).
 */
export function currentView(): string {
  const p = window.location.pathname
  const tab = document.body.dataset.view
  if (tab) { const sub = document.body.dataset.subview; return sub ? `${tab}/${sub}` : tab }
  if (p.startsWith('/dashboard/')) return 'dashboard'
  if (p === '/admin' || p === '/admin/') return 'admin'
  if (p.startsWith('/admin/reports')) return /present/.test(p) ? 'admin/apresentar' : 'admin/reports'
  if (p.startsWith('/admin/uso')) return 'admin/uso'
  return ''
}

export function currentClient(): string {
  return /^\/dashboard\/([a-z0-9]+(?:-[a-z0-9]+)*)/.exec(window.location.pathname)?.[1] ?? ''
}

/** Tamanho da página inteira, sem a barra de rolagem (é a mesma conta ao gravar o clique e ao desenhar o calor). */
export function docSize(): { w: number; h: number } {
  const el = document.documentElement
  return { w: Math.max(el.scrollWidth, el.clientWidth), h: Math.max(el.scrollHeight, el.clientHeight) }
}

const INTERACTIVE = 'button,a,[role="tab"],[role="button"],input,select,textarea,label,summary,th,td'

function segment(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const parent = el.parentElement
  if (!parent) return tag
  const same = Array.from(parent.children).filter(c => c.tagName === el.tagName)
  return same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(el) + 1})` : tag
}

/** Caminho do elemento até o <body>. Só tags e posição, sem texto: nada da tela (nomes, valores) vai para o banco. */
export function pathOf(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur !== document.body && cur !== document.documentElement) {
    if (/^[A-Za-z][\w-]{0,30}$/.test(cur.id) && document.querySelectorAll(`#${CSS.escape(cur.id)}`).length === 1) { parts.push(`#${cur.id}`); return parts.reverse().join('>') }
    parts.push(segment(cur))
    cur = cur.parentElement
  }
  return `body>${parts.reverse().join('>')}`
}

export interface ClickSpot { sel: string; rx: number; ry: number; view: string; client: string; label: string | null }

const slugOf = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)

/** Nome da janela (modal, gaveta, menu) em que o clique aconteceu, ou null se foi na própria tela. O nome vem do rótulo da janela, sem dado pessoal. */
export function layerOf(el: Element): string | null {
  const dlg = el.closest('[role="dialog"], [aria-modal="true"], [data-hm-layer]')
  if (dlg && !dlg.closest('[data-hm-ignore]')) {
    const raw = dlg.getAttribute('data-hm-layer') ?? dlg.getAttribute('aria-label') ?? ''
    const ok = raw && !/@|\d{3,}/.test(raw) && !/^lead\b/i.test(raw)
    return (ok ? slugOf(raw) : '') || 'janela'
  }
  for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
    if (getComputedStyle(a).position !== 'fixed') continue
    if (a.closest('.staff-sidebar, .staff-burger, [data-hm-ignore]')) return null
    const r = a.getBoundingClientRect()
    if (r.width * r.height > 0.15 * window.innerWidth * window.innerHeight) return 'janela'
  }
  return null
}

/** Rótulo curto de botões, abas e links ("Novo lead"). Células e linhas de tabela ficam sem rótulo: é onde aparecem nomes de pessoas. */
function labelOf(anchor: Element): string | null {
  if (!anchor.matches('button, a, [role="tab"], [role="button"], summary, label')) return null
  const t = anchor.getAttribute('aria-label') || anchor.getAttribute('title') || (anchor.textContent ?? '')
  return cleanLabel(t)
}

/** Onde foi o clique: elemento interativo mais próximo + posição dentro dele (0 a 1). Áreas enormes viram posição na página inteira. */
export function locateClick(e: MouseEvent): ClickSpot | null {
  const target = e.target instanceof Element ? e.target : null
  if (!target || target.closest('[data-hm-ignore]')) return null
  const base = currentView()
  if (!base) return null
  const layer = layerOf(target)
  const view = layer ? `${base}/${layer}` : base
  const client = currentClient()
  const anchor = target.closest(INTERACTIVE) ?? target
  const r = anchor.getBoundingClientRect()
  const label = labelOf(anchor)
  const big = r.width * r.height > 0.4 * window.innerWidth * window.innerHeight
  if (big || r.width < 1 || r.height < 1) {
    const { w, h } = docSize()
    return { sel: 'body', rx: (e.clientX + window.scrollX) / w, ry: (e.clientY + window.scrollY) / h, view, client, label: null }
  }
  const sel = pathOf(anchor)
  if (sel.length > 300) return null
  // Clique pelo teclado (Enter/Espaço) vem sem coordenada: conta no centro do elemento.
  const keyboard = e.detail === 0 && e.clientX === 0 && e.clientY === 0
  return { sel, rx: keyboard ? 0.5 : (e.clientX - r.left) / r.width, ry: keyboard ? 0.5 : (e.clientY - r.top) / r.height, view, client, label }
}

/** Posição (na página) de um ponto do mapa de calor; nulo se o elemento não existe mais. */
export function pagePosition(p: { sel: string; rx: number; ry: number }): { x: number; y: number } | null {
  if (p.sel === 'body') {
    const { w, h } = docSize()
    return { x: p.rx * w, y: p.ry * h }
  }
  let el: Element | null = null
  try { el = document.querySelector(p.sel) } catch { return null }
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  return { x: r.left + window.scrollX + p.rx * r.width, y: r.top + window.scrollY + p.ry * r.height }
}
