'use client'

import { useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

/**
 * Conecta a extensão do navegador sozinha: quando ela avisa que está aqui, entrega o token de quem está logado.
 * Só age se a extensão pedir; sem a extensão instalada não faz nada (nem chama a API).
 */
export function ExtensionLink() {
  useEffect(() => {
    let busy = false
    const onMsg = async (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return
      const d = e.data as { source?: string; type?: string } | null
      if (!d || d.source !== 'don-ext' || d.type !== 'hello' || busy) return
      busy = true
      try {
        const r = await apiFetch('/api/admin/extension', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json() as { email: string; token: string }
        window.postMessage({ source: 'don-app', type: 'token', token: j.token, email: j.email }, window.location.origin)
      } catch { /* sem sessão: a extensão tenta de novo no próximo carregamento */ } finally { setTimeout(() => { busy = false }, 3000) }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])
  return null
}
