'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useLeads } from './useLeads'
import { apiFetch } from './apiFetch'
import { usePoll } from './usePoll'

type LeadsValue = ReturnType<typeof useLeads>
const Ctx = createContext<LeadsValue | null>(null)

const SYNC_EVERY_MS = 5 * 60_000

export function LeadsProvider({ children }: { children: React.ReactNode }) {
  const value = useLeads(30_000)
  const refetchRef = useRef(value.refetch)
  useEffect(() => { refetchRef.current = value.refetch }, [value.refetch])

  // Enquanto o painel está aberto, importa do Meta os leads recentes (cobre webhook que falhou ou ainda não foi ativado).
  const sync = useCallback(async (days = 7) => {
    try {
      const res = await apiFetch('/api/leads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      const json = await res.json() as { imported?: number }
      if ((json.imported ?? 0) > 0) refetchRef.current()
    } catch { }
  }, [])
  useEffect(() => { sync(7) }, [sync])
  usePoll(() => sync(7), SYNC_EVERY_MS)

  const valueRefetch = value.refetch
  const handleRefetch = useCallback(async () => {
    await sync(7)
    return valueRefetch()
  }, [sync, valueRefetch])

  const contextValue = useMemo(() => ({
    ...value,
    refetch: handleRefetch,
  }), [value, handleRefetch])

  return <Ctx.Provider value={contextValue}>{children}</Ctx.Provider>
}

export function useLeadsData(): LeadsValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLeadsData precisa estar dentro de LeadsProvider')
  return v
}
