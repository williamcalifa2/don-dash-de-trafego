'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
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
      const res = await fetch(`/api/meta/metrics?date_preset=${preset}`)
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

  // Subscribe to Supabase Realtime WebSocket
  useEffect(() => {
    const db = getSupabase()
    if (!db) return

    const accountId = 'act_4430467137184616'
    const channel = db
      .channel('metrics-live')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'metrics_cache',
          filter: `id=eq.${accountId}:${datePreset}`,
        },
        (payload) => {
          const incoming = payload.new as { data: MetricsResponse }
          setState(s => ({ ...s, data: incoming.data, isValidating: false }))
        }
      )
      .subscribe()

    return () => { db.removeChannel(channel) }
  }, [datePreset])

  const mutate = useCallback(() => fetchAndUpdate(presetsRef.current), [fetchAndUpdate])

  return { ...state, mutate }
}
