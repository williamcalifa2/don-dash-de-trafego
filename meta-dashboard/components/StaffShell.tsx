'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, FileBarChart, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Users, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { Me } from '@/components/ProfileMenu'
import { PulseLoader } from '@/components/PulseLoader'

/** Ações que a sidebar pede para a tela em que a pessoa está (a tela escuta o evento e abre o que for dela). */
export type StaffAction = 'clients' | 'new' | 'team' | 'sync' | 'reports' | 'access'
export const STAFF_EVENT = 'staff-open'
const ROLE_KEY = 'staff_role'
const COLLAPSE_KEY = 'staff_sidebar_collapsed'

function Item({ icon, label, onClick, active, collapsed }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; collapsed: boolean }) {
  return (
    <button type="button" className="staff-item" aria-current={active ? 'page' : undefined} onClick={onClick} title={collapsed ? label : undefined}>
      <span className="staff-icon" aria-hidden="true">{icon}</span><span className="staff-label">{label}</span>
    </button>
  )
}

/**
 * Moldura da equipe da agência: sidebar com o que é da agência (administração e ferramentas). O portal do cliente não ganha nada disso:
 * para quem não é da equipe, devolve só o conteúdo, sem barra.
 */
export function StaffShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [me, setMe] = useState<Me | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const role = sessionStorage.getItem(ROLE_KEY)
      return role ? { role, name: '', email: '', avatar: null } : null
    } catch { return null }
  })
  const [known, setKnown] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return Boolean(sessionStorage.getItem(ROLE_KEY))
    } catch { return false }
  })
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [navigating, setNavigating] = useState(false)
  useEffect(() => { setNavigating(false) }, [pathname])
  const go = useCallback((href: string) => { setNavigating(true); router.push(href) }, [router])

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch { }
    let alive = true
    apiFetch('/api/admin/profile', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: Me | null) => {
      if (!alive) return
      setMe(j && j.role ? j : null); setKnown(true)
      try { if (j?.role) sessionStorage.setItem(ROLE_KEY, j.role); else sessionStorage.removeItem(ROLE_KEY) } catch { }
    }).catch(() => { if (alive) setKnown(true) })
    return () => { alive = false }
  }, [])

  const toggleCollapse = () => setCollapsed(c => { const n = !c; try { localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0') } catch { } return n })

  const open = useCallback((action: StaffAction) => {
    setDrawer(false)
    if (action === 'reports') { go('/admin/reports'); return }
    if (pathname === '/admin') { window.dispatchEvent(new CustomEvent(STAFF_EVENT, { detail: action })); return }
    go(`/admin?open=${action}`)
  }, [pathname, go])

  if (!known || !me) return <>{children}</>
  const canManage = me.role === 'owner' || me.role === 'admin'
  const canOperate = canManage || me.role === 'member'
  const onPanel = pathname === '/admin'
  const onReports = pathname.startsWith('/admin/reports')

  return (
    <div className={`staff-shell${collapsed ? ' is-collapsed' : ''}`}>
      <button type="button" className="staff-burger no-print btn btn-outline btn-icon btn-sm" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Menu size={18} strokeWidth={1.75} /></button>
      {drawer && <div className="staff-backdrop no-print" onClick={() => setDrawer(false)} />}
      <aside className={`staff-sidebar no-print${drawer ? ' is-open' : ''}`}>
        <div className="staff-top">
          <img src="/logo-grupo-don-dark.png" srcSet="/logo-grupo-don-dark.png 1x, /logo-grupo-don-dark@2x.png 2x" alt="Grupo Don" className="staff-logo staff-logo-light" />
          <img src="/logo-grupo-don-white.png" srcSet="/logo-grupo-don-white.png 1x, /logo-grupo-don@2x.png 2x" alt="Grupo Don" className="staff-logo staff-logo-dark" />
          <button type="button" className="staff-collapse btn btn-ghost btn-icon btn-sm" onClick={toggleCollapse} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          </button>
          <button type="button" className="staff-close btn btn-ghost btn-icon btn-sm" onClick={() => setDrawer(false)} aria-label="Fechar menu"><X size={16} strokeWidth={1.75} /></button>
        </div>

        <nav aria-label="Menu da agência" className="staff-nav">
          <Item collapsed={collapsed} icon={<LayoutGrid size={18} strokeWidth={1.75} />} label="Painel de clientes" active={onPanel} onClick={() => { setDrawer(false); if (!onPanel) go('/admin'); else window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
          <div className="staff-group">Administração</div>
          {canOperate && <Item collapsed={collapsed} icon={<Building2 size={18} strokeWidth={1.75} />} label="Clientes" onClick={() => open('clients')} />}
          {canManage && <Item collapsed={collapsed} icon={<Users size={18} strokeWidth={1.75} />} label="Equipe" onClick={() => open('team')} />}
          {canOperate && <>
            <div className="staff-group">Ferramentas</div>
            <Item collapsed={collapsed} icon={<FileBarChart size={18} strokeWidth={1.75} />} label="Report Studio" active={onReports} onClick={() => open('reports')} />
          </>}
        </nav>

      </aside>
      <div className="staff-main">{children}</div>
      {navigating && <PulseLoader fullscreen size={72} />}
    </div>
  )
}
