'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from './apiFetch'

export interface AdPerfRow {
  ad_id: string
  ad_name: string
  adset_name: string
  campaign_id: string
  campaign_name: string
  spend: number
  meta_leads: number
}

export function usePerformance(preset: string) {
  const [rows, setRows] = useState<AdPerfRow[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'mock'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setState('loading')
    apiFetch(`/api/meta/performance?date_preset=${preset}`, { cache: 'no-store' })
      .then(async r => {
        const j = await r.json() as { rows?: AdPerfRow[]; error?: string; is_mock?: boolean }
        if (!alive) return
        if (!r.ok) { setError(j.error ?? 'Erro ao carregar'); setState('error'); return }
        setRows(j.rows ?? [])
        setState(j.is_mock ? 'mock' : 'ok')
      })
      .catch(() => { if (alive) { setError('Sem conexão'); setState('error') } })
    return () => { alive = false }
  }, [preset])

  return { rows, state, error }
}
