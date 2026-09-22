'use client'

import { useCallback, useEffect, useState } from 'react'

/** Tema claro/escuro: usa a escolha salva, senão a preferência do sistema. */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem('theme') } catch {}
    const initial = saved === 'dark' || saved === 'light' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      try { localStorage.setItem('theme', next) } catch {}
      return next
    })
  }, [])

  return { theme, toggle }
}
