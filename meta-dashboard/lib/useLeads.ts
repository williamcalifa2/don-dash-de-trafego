'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Lead, LeadUpdate } from './leadTypes'
import { apiFetch } from './apiFetch'
import { selfCreated } from './manualLeads'

const COLUMN_ERROR = /schema cache|column .* does not exist|Could not find the/i
const DB_OUTDATED = 'O banco ainda não tem os campos novos (notas, motivo e último contato). Rode o SQL de atualização no Supabase.'

export function useLeads(pollMs?: number) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await apiFetch('/api/leads', { cache: 'no-store' })
      const json = await res.json() as { leads?: Lead[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar leads')
      setLeads(json.leads ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!pollMs) return
    const id = setInterval(() => load(true), pollMs)
    return () => clearInterval(id)
  }, [pollMs, load])

  async function send(id: string, body: LeadUpdate): Promise<string | null> {
    const res = await apiFetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return null
    const json = await res.json().catch(() => ({})) as { error?: string }
    return json.error ?? 'Erro ao salvar'
  }

  /** Retorna null se salvou, ou a mensagem de erro. */
  const patchLead = useCallback(async (id: string, updates: LeadUpdate): Promise<string | null> => {
    const current = leads.find(l => l.id === id)
    const body: LeadUpdate = { ...updates }
    if (current && updates.status && updates.status !== 'Novo' && !current.ultimo_contato && !('ultimo_contato' in updates)) {
      body.ultimo_contato = new Date().toISOString()
    }
    const autoContact = body.ultimo_contato !== undefined && !('ultimo_contato' in updates)
    const previous = leads
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...body } : l))
    let err: string | null
    try {
      err = await send(id, body)
      if (err && autoContact && COLUMN_ERROR.test(err)) {
        const { ultimo_contato: _drop, ...rest } = body
        void _drop
        err = await send(id, rest)
        if (!err) setLeads(prev => prev.map(l => l.id === id ? { ...l, ultimo_contato: null } : l))
      }
    } catch {
      err = 'Sem conexão. Tente de novo.'
    }
    if (err) {
      setLeads(previous)
      err = COLUMN_ERROR.test(err) ? DB_OUTDATED : err
      setSaveError(err)
    } else {
      setSaveError(null)
    }
    return err
  }, [leads])

  /** Cadastro manual. Devolve o erro (texto) ou null se salvou; `warning` quando salvou com ressalva. */
  const addLead = useCallback(async (input: { nome?: string; telefone?: string; email?: string; campanha?: string; conjunto?: string; ad_name?: string; notas?: string; atendido_por?: string; status?: string; valor_pedido?: string; motivo_perda?: string }): Promise<{ error: string | null; warning?: string }> => {
    try {
      const res = await apiFetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const json = await res.json().catch(() => ({})) as { lead?: Lead; warning?: string; error?: string }
      if (!res.ok || !json.lead) return { error: json.error ?? 'Não foi possível salvar o lead.' }
      selfCreated.add(json.lead.id)
      setLeads(prev => [json.lead!, ...prev])
      return { error: null, warning: json.warning }
    } catch {
      return { error: 'Sem conexão. Tente de novo.' }
    }
  }, [])

  const clearSaveError = useCallback(() => setSaveError(null), [])
  const refetch = useCallback(() => load(), [load])

  return useMemo(() => ({
    leads,
    loading,
    error,
    saveError,
    clearSaveError,
    refetch,
    patchLead,
    addLead,
  }), [leads, loading, error, saveError, clearSaveError, refetch, patchLead, addLead])
}
