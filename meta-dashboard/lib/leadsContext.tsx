'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { useLeads } from './useLeads'
import { apiFetch } from './apiFetch'
import { usePoll } from './usePoll'

type LeadsValue = ReturnType<typeof useLeads>
const Ctx = createContext<LeadsValue | null>(null)

const SYNC_EVERY_MS = 5 * 60_000

export function LeadsProvider({ children }: { children: React.ReactNode }) {
  const value = useLeads(30_000)
  const refetchRef = useRef(value.refetch)
  useEffect(() => { refetchRef.current = value.refetch })

  // Enquanto o painel está aberto, importa do Meta os leads recentes (cobre webhook que falhou ou ainda não foi ativado).
  // O servidor limita a 1 reconferência a cada 2 min por cliente, então várias abas não multiplicam as consultas.
  const sync = useCallback(async () => {
    try {
      const res = await apiFetch('/api/leads/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: 2 }) })
      const json = await res.json() as { imported?: number }
      if ((json.imported ?? 0) > 0) refetchRef.current()
    } catch {}
  }, [])
  useEffect(() => { sync() }, [sync])
  usePoll(sync, SYNC_EVERY_MS)

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLeadsData(): LeadsValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLeadsData precisa estar dentro de LeadsProvider')
  return v
}
