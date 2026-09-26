'use client'

import { useState } from 'react'

/** Dica ao passar o mouse, na hora (o `title` do navegador demora quase 1 s). Uso: `const tip = useFastTip()`, `{...tip.bind('texto')}` no elemento e `{tip.node}` no fim do componente. */
export function useFastTip() {
  const [t, setT] = useState<{ x: number; y: number; text: string } | null>(null)
  const bind = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setT({ x: e.clientX, y: e.clientY, text }),
    onMouseMove: (e: React.MouseEvent) => setT(cur => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur)),
    onMouseLeave: () => setT(null),
  })
  const node = t ? (
    <div role="tooltip" data-hm-ignore style={{ position: 'fixed', left: Math.min(t.x + 12, (typeof window === 'undefined' ? 9999 : window.innerWidth) - 220), top: Math.max(8, t.y - 38), zIndex: 2000, pointerEvents: 'none', maxWidth: 240, padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, lineHeight: 1.3, background: 'var(--text-1)', color: 'var(--bg-card)', boxShadow: '0 4px 14px rgba(0,0,0,.25)' }}>{t.text}</div>
  ) : null
  return { bind, node }
}
