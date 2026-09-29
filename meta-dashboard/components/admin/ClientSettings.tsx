'use client'

import { useRouter } from 'next/navigation'
import { Building2, ExternalLink } from 'lucide-react'

/**
 * Aba "Cadastro de Clientes" da tela de Configurações.
 * O cadastro completo (token, dados, vínculos de conta) ainda mora no popup de Clientes em app/admin/page.tsx —
 * esse arquivo é enorme e outra sessão está mexendo nele agora, então em vez de duplicar/arriscar quebrar,
 * essa aba abre o mesmo popup (o mecanismo `?open=clients` já existe e é o que a sidebar usa). Quando o
 * page.tsx estabilizar, dá pra trazer o formulário pra dentro desta aba de verdade.
 */
export function ClientSettings() {
  const router = useRouter()
  return (
    <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent-dim)' }}>
        <Building2 size={22} strokeWidth={1.75} />
      </span>
      <div style={{ maxWidth: 420 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>Cadastro de clientes</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          Token de acesso, dados cadastrais e vínculo com a conta de anúncios — por enquanto isso ainda abre no popup de sempre. Em breve entra direto aqui.
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => router.push('/admin?open=clients')}>
        <ExternalLink size={16} strokeWidth={1.75} /> Abrir cadastro de clientes
      </button>
    </div>
  )
}
