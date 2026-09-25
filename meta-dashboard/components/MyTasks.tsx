'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { useTheme } from '@/lib/useTheme'
import { ProfileMenu } from './ProfileMenu'
import { PulseLoader } from './PulseLoader'
import { StaffShell } from './StaffShell'
import { TaskPanel } from './Tasks'

/** Espaço do gestor: as alterações que ele fez nas contas e ainda precisa explicar. Achado pelo e-mail de login dele. */
export function MyTasks() {
  const { theme, toggle } = useTheme()
  const [me, setMe] = useState<{ managerId: string | null } | null>(null)

  useEffect(() => {
    apiFetch('/api/admin/tasks/summary', { cache: 'no-store' }).then(r => (r.ok ? r.json() : { managerId: null })).then((j: { managerId: string | null }) => setMe(j)).catch(() => setMe({ managerId: null }))
  }, [])

  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Otimizações</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Explique por que cada alteração foi feita nas contas</p>
          </div>
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
          <ProfileMenu />
        </header>
        {!me && <PulseLoader size={44} />}
        {me && !me.managerId && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', lineHeight: 1.6 }}>O seu e-mail de login ainda não está ligado a um gestor. Peça a um administrador para informar o seu e-mail em Performance, no cadastro do gestor.</div>}
        {me?.managerId && <TaskPanel managerId={me.managerId} />}
      </main>
    </StaffShell>
  )
}
