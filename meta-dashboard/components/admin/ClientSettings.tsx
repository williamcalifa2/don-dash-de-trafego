'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight, Plus, Search } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from '../PulseLoader'
import { Thumb } from '../UsageUi'

interface ClientRow { slug: string; name: string; logoUrl: string | null; hasAdAccount: boolean }

/**
 * Aba "Clientes" da tela de Configurações: lista todos os clientes (abole o popup separado que existia antes).
 * O cadastro em si (token, dados, vínculo de conta) ainda é feito no popup de sempre — clicar numa linha ou em
 * "Novo cliente" abre ele (mecanismo `?open=` que a sidebar já usa). O que muda aqui é o ponto de entrada: não tem
 * mais uma aba "Clientes" solta, é tudo dentro de Configurações, em lista.
 */
export function ClientSettings() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    apiFetch('/api/admin/clients/names', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { clients?: ClientRow[] } | null) => { if (j) setClients(j.clients ?? []); else setFailed(true) })
      .catch(() => setFailed(true))
  }, [])

  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const shown = useMemo(() => (clients ?? []).filter(c => !q.trim() || norm(c.name).includes(norm(q.trim()))), [clients, q])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="search" style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" />
        </label>
        <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => router.push('/admin?open=new')}>
          <Plus size={16} strokeWidth={1.75} /> Novo cliente
        </button>
      </div>

      {failed && <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar os clientes agora.</div>}
      {!clients && !failed && <PulseLoader size={40} />}
      {clients && shown.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>{clients.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nenhum cliente com esse nome.'}</div>
      )}
      {clients && shown.length > 0 && (
        <div className="card" style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
          {shown.map((c, i) => (
            <button key={c.slug} type="button" onClick={() => router.push('/admin?open=clients')}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 0', borderTop: i ? '1px solid var(--border-soft)' : 'none', background: 'none', border: 0, borderTopStyle: 'solid', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
              <Thumb name={c.name} src={c.logoUrl} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.slug}</div>
              </div>
              {!c.hasAdAccount && <span className="badge" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', flexShrink: 0 }}><AlertTriangle size={11} strokeWidth={2} /> Sem conta vinculada</span>}
              <ChevronRight size={16} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
