'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, LogOut, Moon, Sun } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { useTheme } from '@/lib/useTheme'
import { PulseLoader } from './PulseLoader'
import { Thumb } from './UsageUi'

interface Client { slug: string; name: string; logoUrl: string | null }

/** Página inicial de quem tem o acesso "Orgânico": os clientes que ele pode abrir, e só a aba Orgânico de cada um. */
export function OrganicHome() {
  const { theme, toggle } = useTheme()
  const [data, setData] = useState<{ clients: Client[]; email: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    apiFetch('/api/admin/organic/clients', { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject())).then((j: { clients: Client[]; email: string }) => setData(j)).catch(() => setFailed(true))
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { })
    window.location.href = '/admin'
  }

  return (
    <main className="page page-ready" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-grupo-don-dark.png" alt="Grupo Don" className="staff-logo-light" style={{ height: 28 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-grupo-don-white.png" alt="Grupo Don" className="staff-logo-dark" style={{ height: 28 }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Orgânico</h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Escolha o cliente para ver o Instagram e o Facebook dele</p>
        </div>
        <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={logout}><LogOut size={14} strokeWidth={1.75} /> Sair</button>
      </header>

      {!data && !failed && <PulseLoader size={44} />}
      {failed && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar seus clientes agora. Entre de novo em <a href="/admin" style={{ textDecoration: 'underline' }}>/admin</a>.</div>}
      {data && data.clients.length === 0 && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', lineHeight: 1.6 }}>Você ainda não tem clientes atribuídos. Peça a um administrador para escolher os seus clientes em Acessos.</div>}
      {data && data.clients.length > 0 && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {data.clients.map(c => (
            <article key={c.slug} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Thumb name={c.name} src={c.logoUrl} size={40} />
                <h3 title={c.name} style={{ fontSize: 16, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</h3>
              </div>
              <a className="btn btn-primary btn-sm" href={`/dashboard/${c.slug}?tab=organic`}><ArrowRight size={16} strokeWidth={1.75} /> Abrir orgânico</a>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
