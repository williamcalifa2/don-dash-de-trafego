'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { usePoll } from '@/lib/usePoll'
import type { MetricsResponse, DatePreset } from '@/lib/meta'

interface State {
  data: MetricsResponse | null
  isLoading: boolean
  isValidating: boolean
  error: Error | null
}

export function useMetricsRealtime(datePreset: DatePreset) {
  const [state, setState] = useState<State>({ data: null, isLoading: true, isValidating: false, error: null })
  const presetsRef = useRef(datePreset)
  presetsRef.current = datePreset

  const fetchAndUpdate = useCallback(async (preset: DatePreset) => {
    setState(s => ({ ...s, isValidating: true, error: null }))
    try {
      const res = await apiFetch(`/api/meta/metrics?date_preset=${preset}`)
      const json: MetricsResponse = await res.json()
      setState({ data: json, isLoading: false, isValidating: false, error: null })
    } catch (e) {
      setState(s => ({ ...s, isLoading: false, isValidating: false, error: e as Error }))
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchAndUpdate(datePreset)
  }, [datePreset, fetchAndUpdate])

  // A cada 5 min (com variação), só com a aba visível: aba esquecida em segundo plano não gasta consulta.
  usePoll(() => { fetchAndUpdate(presetsRef.current) }, 5 * 60 * 1000, { pauseWhenHidden: true })

  // "Atualizar": pede à fila (com resfriamento) e relê o banco. O painel nunca chama a Meta.
  const mutate = useCallback(async () => {
    await apiFetch('/api/meta/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: presetsRef.current }) }).catch(() => {})
    return fetchAndUpdate(presetsRef.current)
  }, [fetchAndUpdate])

  return { ...state, mutate }
}
