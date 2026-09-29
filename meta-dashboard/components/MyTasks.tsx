'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from './PulseLoader'
import { StaffShell } from './StaffShell'
import { HomeTasksView } from './home/HomeTasksView'

/**
 * Início do gestor / Minhas Tarefas (Pautta):
 * Painel pessoal diário com perfil, meta do ciclo, macros e justificativas de otimização.
 */
export function MyTasks() {
  const [me, setMe] = useState<{ managerId: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/admin/tasks/summary', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { managerId: null }))
      .then((j: { managerId: string | null }) => {
        setMe(j)
        setLoading(false)
      })
      .catch(() => {
        setMe({ managerId: null })
        setLoading(false)
      })
  }, [])

  return (
    <StaffShell>
      <main className="min-h-screen px-4 sm:px-6 md:px-10 py-6 md:py-8 w-full max-w-7xl mx-auto">
        {loading && (
          <div className="py-28 flex items-center justify-center">
            <PulseLoader size={44} caption="Carregando Início..." />
          </div>
        )}
        {!loading && <HomeTasksView managerId={me?.managerId ?? null} />}
      </main>
    </StaffShell>
  )
}
