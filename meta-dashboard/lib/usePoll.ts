'use client'

import { useEffect, useRef } from 'react'

/**
 * Repete `fn` a cada `everyMs`, com uma variação aleatória (±10%) para várias telas não baterem no servidor no mesmo instante.
 * Com `pauseWhenHidden`, aba escondida não consulta; ao voltar, atualiza na hora se já passou o intervalo.
 */
export function usePoll(fn: () => void, everyMs: number, opts: { pauseWhenHidden?: boolean } = {}) {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  const pause = opts.pauseWhenHidden ?? false

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = Date.now()
    const next = () => everyMs * (0.9 + Math.random() * 0.2)
    const tick = () => {
      if (pause && document.hidden) { timer = setTimeout(tick, next()); return }
      last = Date.now(); ref.current(); timer = setTimeout(tick, next())
    }
    const onVisible = () => {
      if (!pause || document.hidden || Date.now() - last < everyMs) return
      clearTimeout(timer); tick()
    }
    timer = setTimeout(tick, next())
    if (pause) document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); if (pause) document.removeEventListener('visibilitychange', onVisible) }
  }, [everyMs, pause])
}
