'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface AnchorPos { top: number; right: number }

/**
 * Menu que abre junto de um botão e continua preso a ele: acompanha a rolagem da página e o redimensionamento da janela,
 * abre para cima quando não cabe embaixo e fecha se o botão sair da tela. Escape também fecha.
 * Uso: `const { pos, toggle, close, menuRef } = useAnchoredPopover()`; no botão `onClick={toggle}`; no menu `ref={menuRef}` e `style={{ position: 'fixed', top: pos.top, right: pos.right }}`.
 */
export function useAnchoredPopover(gap = 4) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<AnchorPos | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const place = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return } // o botão saiu da tela
    const h = menuRef.current?.offsetHeight ?? 0
    const below = r.bottom + gap
    const top = h && below + h > window.innerHeight - 8 && r.top - gap - h > 8 ? r.top - gap - h : below
    setPos({ top, right: Math.max(8, window.innerWidth - r.right) })
  }, [gap])

  // Coloca ao abrir e de novo quando o menu já existe na tela (só então dá para medir a altura e decidir se abre para cima).
  useLayoutEffect(() => {
    if (!open) return
    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const on = () => place()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('scroll', on, true) // captura: pega a rolagem de qualquer área, não só da janela
    window.addEventListener('resize', on)
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on); window.removeEventListener('keydown', k) }
  }, [open, place])

  const toggle = (e: React.MouseEvent<HTMLElement>) => { anchor.current = e.currentTarget; setOpen(o => !o) }
  return { pos: open ? pos : null, close: () => setOpen(false), toggle, menuRef }
}
