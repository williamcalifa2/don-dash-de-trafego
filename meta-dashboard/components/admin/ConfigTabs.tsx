'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'
import { ProfileMenu } from '../ProfileMenu'
import { StaffShell } from '../StaffShell'
import { SubTabs } from '../UsageUi'
import { ClientSettings } from './ClientSettings'
import { TeamSettings } from './TeamSettings'

type Tab = 'clientes' | 'equipe'
const TABS: Array<{ key: Tab; label: string }> = [{ key: 'clientes', label: 'Cadastro de Clientes' }, { key: 'equipe', label: 'Equipe & Gestores' }]

/** Tela unificada de Configurações: cadastro de clientes e equipe/gestores, cada um na sua aba. */
export function ConfigTabs() {
  const { theme, toggle } = useTheme()
  const router = useRouter()
  const params = useSearchParams()
  const tab: Tab = params.get('tab') === 'equipe' ? 'equipe' : 'clientes'
  const setTab = (t: Tab) => router.replace(`/admin/configuracoes?tab=${t}`)

  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Configurações</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Cadastro de clientes e equipe da agência, num lugar só</p>
          </div>
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
          <ProfileMenu />
        </header>

        <div style={{ marginBottom: 20 }}>
          <SubTabs value={tab} onChange={setTab} tabs={TABS} />
        </div>

        {tab === 'clientes' ? <ClientSettings /> : <TeamSettings />}
      </main>
    </StaffShell>
  )
}
