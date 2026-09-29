'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ExtensionLink } from './ExtensionLink'
import { Building2, FileBarChart, LayoutGrid, Menu, MousePointerClick, Activity, ClipboardCheck, Gauge, Receipt, Radar, PanelLeftClose, Puzzle, PanelLeftOpen, Settings, Users, X } from 'lucide-react'
import type { Me } from '@/components/ProfileMenu'
import { PulseLoader } from '@/components/PulseLoader'

/** Ações que a sidebar pede para a tela em que a pessoa está (a tela escuta o evento e abre o que for dela). */
export type StaffAction = 'clients' | 'new' | 'team' | 'sync' | 'reports' | 'access' | 'integracoes'
export const STAFF_EVENT = 'staff-open'
const ROLE_KEY = 'staff_role'
const COLLAPSE_KEY = 'staff_sidebar_collapsed'

function Item({ icon, label, onClick, active, collapsed, badge }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; collapsed: boolean; /** número de pendências ao lado do nome */ badge?: number }) {
  return (
    <button type="button" className="staff-item" aria-current={active ? 'page' : undefined} onClick={onClick} title={collapsed ? (badge ? `${label} (${badge})` : label) : undefined}>
      <span className="staff-icon" aria-hidden="true" style={{ position: 'relative' }}>{icon}{collapsed && !!badge && <i style={{ position: 'absolute', top: -2, right: -3, width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</span><span className="staff-label">{label}</span>
      {!!badge && <span className="staff-label" aria-label={`${badge} pendentes`} style={{ marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--amber)', color: '#000', fontSize: 11, fontWeight: 700, display: 'inline-grid', placeItems: 'center' }}>{badge}</span>}
    </button>
  )
}

let hydrated = false
function cachedRole(): string | null {
  try { return sessionStorage.getItem(ROLE_KEY) } catch { return null }
}

/**
 * Moldura da equipe da agência: sidebar com o que é da agência (administração e ferramentas). O portal do cliente não ganha nada disso:
 * para quem não é da equipe, devolve só o conteúdo, sem barra.
 */
export function StaffShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  // O primeiro desenho tem de ser igual ao do servidor (que não conhece o sessionStorage), senão o React descarta o HTML e refaz a tela (erro #418).
  // Depois da hidratação, as próximas telas já nascem com a barra, lendo o papel salvo.
  const [me, setMe] = useState<Me | null>(() => {
    const role = hydrated ? cachedRole() : null
    return role ? { role, name: '', email: '', avatar: null } : null
  })
  const [known, setKnown] = useState(() => hydrated && cachedRole() !== null)
  useLayoutEffect(() => {
    hydrated = true
    const role = cachedRole()
    if (role) { setMe(cur => cur ?? { role, name: '', email: '', avatar: null }); setKnown(true) }
  }, [])
  const [collapsed, setCollapsed] = useState(false)
  const [tasks, setTasks] = useState<{ managerId: string | null; pending: number }>({ managerId: null, pending: 0 })
  const [drawer, setDrawer] = useState(false)
  const [navigating, setNavigating] = useState(false)
  useEffect(() => { setNavigating(false) }, [pathname])
  const go = useCallback((href: string) => { setNavigating(true); router.push(href) }, [router])

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch { }
    let alive = true
    // fetch simples (não apiFetch): o painel do cliente também usa esta barra, e a sessão de cliente recebe 401 aqui. Isso não pode derrubar o login dele.
    fetch('/api/admin/profile', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: Me | null) => {
      if (!alive) return
      setMe(j && j.role ? j : null); setKnown(true)
      try { if (j?.role) sessionStorage.setItem(ROLE_KEY, j.role); else sessionStorage.removeItem(ROLE_KEY) } catch { }
    }).catch(() => { if (alive) setKnown(true) })
    return () => { alive = false }
  }, [])

  // Otimizações sem motivo de quem está logado (pelo e-mail de login do gestor): aparece como aviso no menu.
  useEffect(() => {
    if (!known || !me) return
    let alive = true
    fetch('/api/admin/tasks/summary', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: { managerId: string | null; pending: number } | null) => { if (alive && j) setTasks(j) }).catch(() => { })
    return () => { alive = false }
  }, [known, me, pathname])

  const toggleCollapse = () => setCollapsed(c => { const n = !c; try { localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0') } catch { } return n })

  const open = useCallback((action: StaffAction) => {
    setDrawer(false)
    if (action === 'reports') { go('/admin/reports'); return }
    if (action === 'team') { go('/admin/membros'); return }
    if (pathname === '/admin') { window.dispatchEvent(new CustomEvent(STAFF_EVENT, { detail: action })); return }
    go(`/admin?open=${action}`)
  }, [pathname, go])

  if (!known || !me) return <>{children}</>
  const canManage = me.role === 'owner' || me.role === 'admin'
  const canOperate = canManage || me.role === 'member'
  const onPanel = pathname === '/admin'
  const onReports = pathname.startsWith('/admin/reports')
  const onHeatmap = pathname.startsWith('/admin/heatmap')
  const onUsage = pathname.startsWith('/admin/uso')
  const onPerformance = pathname.startsWith('/admin/equipe')
  const onTeam = pathname.startsWith('/admin/membros')
  const onConfig = pathname.startsWith('/admin/configuracoes')

  return (
    <div className={`staff-shell${collapsed ? ' is-collapsed' : ''}`}>
      <ExtensionLink />
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
          <Item collapsed={collapsed} icon={<LayoutGrid size={18} strokeWidth={1.75} />} label="Painel" active={onPanel} onClick={() => { setDrawer(false); if (!onPanel) go('/admin'); else window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
          {tasks.managerId && <Item collapsed={collapsed} icon={<ClipboardCheck size={18} strokeWidth={1.75} />} label="Otimizações" badge={tasks.pending} active={pathname.startsWith('/admin/tarefas')} onClick={() => { setDrawer(false); go('/admin/tarefas') }} />}
          <div className="staff-group">Administração</div>
          {canManage && <Item collapsed={collapsed} icon={<Gauge size={18} strokeWidth={1.75} />} label="Performance" active={onPerformance} onClick={() => { setDrawer(false); go('/admin/equipe') }} />}
          {canOperate && <Item collapsed={collapsed} icon={<Building2 size={18} strokeWidth={1.75} />} label="Clientes" onClick={() => open('clients')} />}
          {canManage && <Item collapsed={collapsed} icon={<Users size={18} strokeWidth={1.75} />} label="Equipe" active={onTeam} onClick={() => open('team')} />}
          {canOperate && <Item collapsed={collapsed} icon={<Receipt size={18} strokeWidth={1.75} />} label="Faturamento" active={pathname.startsWith('/admin/faturamento')} onClick={() => { setDrawer(false); go('/admin/faturamento') }} />}
          {canManage && <Item collapsed={collapsed} icon={<Settings size={18} strokeWidth={1.75} />} label="Configurações" active={onConfig} onClick={() => { setDrawer(false); go('/admin/configuracoes') }} />}
          {canOperate && <>
            <div className="staff-group">Ferramentas</div>
            <Item collapsed={collapsed} icon={<FileBarChart size={18} strokeWidth={1.75} />} label="Report Studio" active={onReports} onClick={() => open('reports')} />
            <Item collapsed={collapsed} icon={<Puzzle size={18} strokeWidth={1.75} />} label="Integrações" onClick={() => open('integracoes')} />
          </>}
          {canManage && <>
            <div className="staff-group">Análise</div>
            <Item collapsed={collapsed} icon={<Activity size={18} strokeWidth={1.75} />} label="Uso do app" active={onUsage} onClick={() => { setDrawer(false); go('/admin/uso') }} />
            <Item collapsed={collapsed} icon={<MousePointerClick size={18} strokeWidth={1.75} />} label="Heatmap" active={onHeatmap} onClick={() => { setDrawer(false); go('/admin/heatmap') }} />
            <Item collapsed={collapsed} icon={<Radar size={18} strokeWidth={1.75} />} label="Consumo da Meta" active={pathname.startsWith('/admin/consumo-meta')} onClick={() => { setDrawer(false); go('/admin/consumo-meta') }} />
          </>}
        </nav>

      </aside>
      <div className="staff-main">{children}</div>
      {navigating && <PulseLoader fullscreen size={72} />}
    </div>
  )
}
