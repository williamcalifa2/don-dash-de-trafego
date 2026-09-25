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

/** Cópia da última leitura na aba (sessionStorage): ao voltar ao painel os números aparecem na hora e são atualizados por baixo. Some ao fechar a aba. */
const cacheKey = (preset: string) => `metrics:${window.location.hostname}${window.location.pathname.split('/').slice(0, 3).join('/')}:${preset}`
function readCache(preset: string): MetricsResponse | null {
  try { const raw = sessionStorage.getItem(cacheKey(preset)); return raw ? JSON.parse(raw) as MetricsResponse : null } catch { return null }
}
function writeCache(preset: string, json: MetricsResponse) {
  try { sessionStorage.setItem(cacheKey(preset), JSON.stringify(json)) } catch { /* cheio ou bloqueado: segue sem cópia */ }
}

export function useMetricsRealtime(datePreset: DatePreset) {
  const [state, setState] = useState<State>({ data: null, isLoading: true, isValidating: false, error: null })
  const presetsRef = useRef(datePreset)
  presetsRef.current = datePreset

  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** `attempt`: quantas vezes já releu porque o período ainda não tinha dados (o servidor está buscando na Meta). */
  const fetchAndUpdate = useCallback(async (preset: DatePreset, attempt = 0) => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
    setState(s => ({ ...s, isValidating: true, error: null }))
    try {
      const res = await apiFetch(`/api/meta/metrics?date_preset=${preset}`)
      const json: MetricsResponse = await res.json()
      const waiting = (json as { freshness?: { pending?: boolean } }).freshness?.pending === true
      if (waiting && attempt < 8 && presetsRef.current === preset) {
        // Período novo: mantém a logo pulsando e relê a cada 7 s (até ~1 min) em vez de mostrar erro.
        setState(s => ({ ...s, isLoading: true, isValidating: false }))
        retryRef.current = setTimeout(() => { fetchAndUpdate(preset, attempt + 1) }, 7000)
        return
      }
      setState({ data: json, isLoading: false, isValidating: false, error: null })
      if (res.ok && (json as { summary?: unknown }).summary) writeCache(preset, json)
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
    await apiFetch('/api/meta/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: presetsRef.current }) }).catch(() => {})
    return fetchAndUpdate(presetsRef.current)
  }, [fetchAndUpdate])

  return { ...state, mutate }
}
