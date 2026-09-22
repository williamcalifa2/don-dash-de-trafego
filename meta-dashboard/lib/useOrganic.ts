'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { usePoll } from '@/lib/usePoll'
import type { OrganicView } from '@/lib/meta/organicRead'

/** Orgânico do cliente: lê do banco (nunca da Meta) e atualiza sozinho a cada 5 min com a aba visível. */
export function useOrganic(preset: string) {
  const [view, setView] = useState<OrganicView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/meta/organic?date_preset=${preset}`, { cache: 'no-store' })
      const j = await r.json() as OrganicView & { error?: string }
      if (!r.ok) { setError(j.error ?? 'Não foi possível carregar o orgânico.'); return }
      setView(j); setError(null)
    } catch { setError('Sem conexão. Tente de novo.') }
  }, [preset])

  useEffect(() => { load() }, [load])
  usePoll(load, 5 * 60_000, { pauseWhenHidden: true })

  /** Só administrador e equipe: busca de novo na Meta e relê. */
  const refresh = useCallback(async () => {
    const r = await apiFetch('/api/meta/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organic: true }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) as { refreshed?: boolean; reason?: string } : {}
    await load()
    return j
  }, [load])

  return { view, error, refresh, reload: load }
}
