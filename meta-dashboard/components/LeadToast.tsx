'use client'

import { UserPlus, X } from 'lucide-react'
import type { Lead } from '@/lib/leadTypes'

interface Props {
  lead: Lead
  extra: number
  scale?: number
  onView?: () => void
  onDismiss: () => void
}

export function LeadToast({ lead, extra, scale = 1, onView, onDismiss }: Props) {
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 2100, zoom: scale }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, maxWidth: 360, boxShadow: 'var(--shadow-elegant)', animation: 'fade-up .3s ease both' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <UserPlus size={20} color="var(--accent)" strokeWidth={1.75} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {extra > 0 ? `Novo lead (+${extra} ${extra === 1 ? 'outro' : 'outros'})` : 'Novo lead'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.nome ?? 'Sem nome'}</div>
          {lead.campanha && <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.campanha}</div>}
        </div>
        {onView && <button className="btn btn-soft btn-sm" onClick={onView}>Ver</button>}
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onDismiss} aria-label="Fechar aviso" title="Fechar"><X size={16} strokeWidth={1.75} /></button>
      </div>
    </div>
  )
}
