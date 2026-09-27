'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Trava o scroll da página por trás enquanto um modal está aberto (compensa a barra de rolagem pra tela não "pular"). */
export function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow
    const gap = window.innerWidth - document.documentElement.clientWidth
    const padPrev = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px` // a página não "pula" quando a barra some
    return () => { document.body.style.overflow = prev; document.body.style.paddingRight = padPrev }
  }, [])
}

/** Popup padrão do painel: cartão centralizado com título e fechar, sobre um overlay. */
export function ModalShell({ title, onClose, children, maxWidth = 512 }: { title: string; onClose?: () => void; children: React.ReactNode; maxWidth?: number }) {
  useLockBodyScroll()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!onClose) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const content = (
    <div
      className="overlay"
      onClick={e => {
        if (e.target === e.currentTarget && onClose) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div
        className="card"
        role="dialog"
        aria-label={title}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: 'min(90vh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-elegant)',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h2>
          {onClose && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      </div>
    </div>
  )

  if (!mounted || typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
