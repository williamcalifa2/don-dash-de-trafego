'use client'

import { ArrowLeft, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'
import { OrganicTab } from './OrganicTab'
import { Thumb } from './UsageUi'

/** O painel do cliente para quem tem o acesso "Orgânico": só a aba Orgânico, sem leads, campanhas, relatórios nem números pagos. */
export function OrganicOnly({ name, logoUrl, slug }: { name: string; logoUrl: string | null; slug: string }) {
  const { theme, toggle } = useTheme()
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { })
    window.location.href = '/admin'
  }
  return (
    <div className="page page-ready" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <a className="btn btn-outline btn-sm" href="/admin/organico"><ArrowLeft size={16} strokeWidth={1.75} /> Voltar</a>
        <Thumb name={name} src={logoUrl} size={40} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{name}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Orgânico · Instagram e Facebook</p>
        </div>
        <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={logout}><LogOut size={14} strokeWidth={1.75} /> Sair</button>
      </header>
      <OrganicTab preset="this_month" presetLabel="Este mês" isStaff canLink={false} slug={slug} />
    </div>
  )
}
