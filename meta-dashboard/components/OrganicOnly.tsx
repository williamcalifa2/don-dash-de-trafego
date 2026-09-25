'use client'

import { useState } from 'react'
import { ArrowLeft, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'
import { OrganicTab } from './OrganicTab'
import { AudienceTab } from './AudienceTab'
import { ReportStudioTab } from './ReportStudioTab'
import { Thumb } from './UsageUi'

type Tab = 'organic' | 'audience' | 'reports'
const TABS: Array<{ key: Tab; label: string }> = [{ key: 'organic', label: 'Orgânico' }, { key: 'audience', label: 'Público' }, { key: 'reports', label: 'Report Studio' }]
const PERIODS = [{ value: 'this_month', label: 'Este mês' }, { value: 'last_month', label: 'Mês passado' }, { value: 'last_7d', label: 'Últimos 7 dias' }, { value: 'last_30d', label: 'Últimos 30 dias' }]

/** O painel do cliente para quem tem o acesso "Social Media": Orgânico, Público e Report Studio (só leitura). Sem leads, campanhas nem números pagos. */
export function OrganicOnly({ name, logoUrl, slug }: { name: string; logoUrl: string | null; slug: string }) {
  const { theme, toggle } = useTheme()
  const initial = (): Tab => {
    if (typeof window === 'undefined') return 'organic'
    const t = new URLSearchParams(window.location.search).get('tab')
    return t === 'audience' || t === 'reports' ? t : 'organic'
  }
  const [tab, setTab] = useState<Tab>(initial)
  const [preset, setPreset] = useState('this_month')
  const presetLabel = PERIODS.find(p => p.value === preset)?.label ?? ''

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { })
    window.location.href = '/admin'
  }
  return (
    <div className="page page-ready" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <a className="btn btn-outline btn-sm" href="/admin/organico"><ArrowLeft size={16} strokeWidth={1.75} /> Voltar</a>
        <Thumb name={name} src={logoUrl} size={40} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{name}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Social Media</p>
        </div>
        <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={logout}><LogOut size={14} strokeWidth={1.75} /> Sair</button>
      </header>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" className="pill-btn" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
        {tab === 'audience' && (
          <select aria-label="Período" value={preset} onChange={e => setPreset(e.target.value)} style={{ marginLeft: 'auto' }}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        )}
      </div>
      {tab === 'organic' && <OrganicTab preset="this_month" presetLabel="Este mês" isStaff canLink={false} slug={slug} />}
      {tab === 'audience' && <AudienceTab preset={preset} presetLabel={presetLabel} kind="form" />}
      {tab === 'reports' && <ReportStudioTab clientSlug={slug} clientName={name} clientLogo={logoUrl} isStaff={false} />}
    </div>
  )
}
