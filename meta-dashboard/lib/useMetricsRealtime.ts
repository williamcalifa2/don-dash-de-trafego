'use client'

import { isAwaitingData, refreshReasonText, shouldCacheMetrics, type MetricsLike } from './metricsState'
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

/** Cópia da última leitura na aba (sessionStorage): ao voltar ao painel os números aparecem na hora e são atualizados por baixo. Some ao fechar a aba. */
const cacheKey = (preset: string) => `metrics:${window.location.hostname}${window.location.pathname.split('/').slice(0, 3).join('/')}:${preset}`
function readCache(preset: string): MetricsResponse | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(preset))
    const c = raw ? JSON.parse(raw) as MetricsResponse : null
    return c && !isAwaitingData(c as MetricsLike) ? c : null // cópia antiga com zeros de "sem leitura": descarta
  } catch { return null }
}
function writeCache(preset: string, json: MetricsResponse) {
  try { sessionStorage.setItem(cacheKey(preset), JSON.stringify(json)) } catch { /* cheio ou bloqueado: segue sem cópia */ }
}

export function useMetricsRealtime(datePreset: DatePreset) {
  const [state, setState] = useState<State>({ data: null, isLoading: true, isValidating: false, error: null })
  const presetsRef = useRef(datePreset)
  presetsRef.current = datePreset

  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [refreshWhy, setRefreshWhy] = useState<string | null>(null)

  /** `attempt`: quantas vezes já releu porque o período ainda não tinha dados (o servidor está buscando na Meta). */
  const fetchAndUpdate = useCallback(async (preset: DatePreset, attempt = 0) => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
    setState(s => ({ ...s, isValidating: true, error: null }))
    try {
      const res = await apiFetch(`/api/meta/metrics?date_preset=${preset}`)
      const json: MetricsResponse = await res.json()
      const waiting = isAwaitingData(json as MetricsLike)
      if (waiting && attempt < 8 && presetsRef.current === preset) {
        // Período novo: mantém a logo pulsando e relê a cada 7 s (até ~1 min) em vez de mostrar erro.
        setState(s => ({ ...s, isLoading: true, isValidating: false }))
        retryRef.current = setTimeout(() => { fetchAndUpdate(preset, attempt + 1) }, 7000)
        return
      }
      setState({ data: json, isLoading: false, isValidating: false, error: null })
      if (shouldCacheMetrics(json as MetricsLike, res.ok)) writeCache(preset, json) // resposta sem leitura vem com zeros: nunca vai para o cache
    } catch (e) {
      setState(s => ({ ...s, isLoading: false, isValidating: false, error: e as Error }))
    }
  }, [])

  useEffect(() => () => { if (retryRef.current) clearTimeout(retryRef.current) }, [])

  // Mostra a última leitura deste período na hora (só depois da hidratação, para o primeiro desenho continuar igual ao do servidor).
  useEffect(() => {
    const cached = readCache(datePreset)
    if (cached) setState(s => ({ ...s, data: cached, isLoading: false, error: null }))
  }, [datePreset])

  // Initial fetch
  useEffect(() => {
    fetchAndUpdate(datePreset)
  }, [datePreset, fetchAndUpdate])

  // A cada 5 min (com variação), só com a aba visível: aba esquecida em segundo plano não gasta consulta.
  usePoll(() => { fetchAndUpdate(presetsRef.current) }, 5 * 60 * 1000, { pauseWhenHidden: true })

  // "Atualizar": pede à fila (com resfriamento) e relê o banco. O painel nunca chama a Meta.
  const mutate = useCallback(async () => {
    const r = await apiFetch('/api/meta/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: presetsRef.current }) }).catch(() => null)
    const j = r ? await r.json().catch(() => null) as { refreshed?: boolean; queued?: boolean; reason?: string } | null : null
    setRefreshWhy(j && j.refreshed === false ? refreshReasonText(j.reason) : null)
    return fetchAndUpdate(presetsRef.current)
  }, [fetchAndUpdate])

  return { ...state, mutate, refreshWhy }
}
