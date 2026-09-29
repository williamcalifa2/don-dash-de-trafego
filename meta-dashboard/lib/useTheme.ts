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
    document.documentElement.classList.toggle('dark', initial === 'dark')
  }, [])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      try { localStorage.setItem('theme', next) } catch {}
      return next
    })
  }, [])

  return { theme, toggle }
}
