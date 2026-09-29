'use client'

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ExtensionLink } from './ExtensionLink'
import {
  FileBarChart,
  LayoutGrid,
  Menu,
  MousePointerClick,
  Activity,
  Home,
  Gauge,
  Receipt,
  Radar,
  PanelLeftClose,
  Puzzle,
  PanelLeftOpen,
  Settings,
  Users,
  X,
  CheckSquare,
  Headset,
} from 'lucide-react'
import type { Me } from '@/components/ProfileMenu'
import { PulseLoader } from '@/components/PulseLoader'
import { TopBar } from '@/components/layout/TopBar'

/** Ações que a sidebar pede para a tela em que a pessoa está (a tela escuta o evento e abre o que for dela). */
export type StaffAction = 'clients' | 'new' | 'team' | 'sync' | 'reports' | 'access' | 'integracoes'
export const STAFF_EVENT = 'staff-open'
const ROLE_KEY = 'staff_role'
const COLLAPSE_KEY = 'staff_sidebar_collapsed'

function Item({
  icon,
  label,
  onClick,
  active,
  collapsed,
  badge,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  collapsed: boolean
  badge?: number
}) {
  return (
    <button
      type="button"
      className="staff-item"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      title={collapsed ? (badge ? `${label} (${badge})` : label) : undefined}
    >
      <span className="staff-icon" aria-hidden="true" style={{ position: 'relative' }}>
        {icon}
        {collapsed && !!badge && (
          <i
            style={{
              position: 'absolute',
              top: -2,
              right: -3,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'hsl(var(--warning))',
            }}
          />
        )}
      </span>
      <span className="staff-label">{label}</span>
      {!!badge && (
        <span
          className="staff-label"
          aria-label={`${badge} pendentes`}
          style={{
            marginLeft: 'auto',
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 999,
            background: 'hsl(var(--warning))',
            color: 'hsl(var(--warning-foreground))',
            fontSize: 10,
            fontWeight: 700,
            display: 'inline-grid',
            placeItems: 'center',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

let hydrated = false
function cachedRole(): string | null {
  try {
    return sessionStorage.getItem(ROLE_KEY)
  } catch {
    return null
  }
}

/**
 * Shell Pautta da equipe da agência: sidebar com o que é da agência e TopBar h-11.
 * O portal do cliente não ganha nada disso: para quem não é da equipe, devolve só o conteúdo.
 */
export function StaffShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [me, setMe] = useState<Me | null>(() => {
    const role = hydrated ? cachedRole() : null
    return role ? { role, name: '', email: '', avatar: null } : null
  })
  const [known, setKnown] = useState(() => hydrated && cachedRole() !== null)

  useLayoutEffect(() => {
    hydrated = true
    const role = cachedRole()
    if (role) {
      setMe(cur => cur ?? { role, name: '', email: '', avatar: null })
      setKnown(true)
    }
  }, [])

  const [collapsed, setCollapsed] = useState(false)
  const [tasks, setTasks] = useState<{ managerId: string | null; pending: number }>({ managerId: null, pending: 0 })
  const [drawer, setDrawer] = useState(false)
  const [navigating, setNavigating] = useState(false)

  useEffect(() => {
    setNavigating(false)
  }, [pathname])

  const go = useCallback((href: string) => {
    setNavigating(true)
    router.push(href)
  }, [router])

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {}
    let alive = true
    fetch('/api/admin/profile', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: Me | null) => {
        if (!alive) return
        setMe(j && j.role ? j : null)
        setKnown(true)
        try {
          if (j?.role) sessionStorage.setItem(ROLE_KEY, j.role)
          else sessionStorage.removeItem(ROLE_KEY)
        } catch {}
      })
      .catch(() => {
        if (alive) setKnown(true)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!known || !me) return
    let alive = true
    fetch('/api/admin/tasks/summary', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { managerId: string | null; pending: number } | null) => {
        if (!alive && j) return
        if (j) setTasks(j)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [known, me, pathname])

  const toggleCollapse = () =>
    setCollapsed(c => {
      const n = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0')
      } catch {}
      return n
    })

  const open = useCallback(
    (action: StaffAction) => {
      setDrawer(false)
      if (action === 'reports') {
        go('/admin/reports')
        return
      }
      if (action === 'team') {
        go('/admin/membros')
        return
      }
      if (pathname === '/admin') {
        window.dispatchEvent(new CustomEvent(STAFF_EVENT, { detail: action }))
        return
      }
      go(`/admin?open=${action}`)
    },
    [pathname, go]
  )

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
      <button
        type="button"
        className="staff-burger no-print btn btn-outline btn-icon btn-sm"
        onClick={() => setDrawer(true)}
        aria-label="Abrir menu"
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>
      {drawer && <div className="staff-backdrop no-print" onClick={() => setDrawer(false)} />}

      <aside className={`staff-sidebar no-print${drawer ? ' is-open' : ''}`}>
        <div className="staff-top">
          {collapsed ? (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm mx-auto">
              P
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
              <img
                src="/logo-grupo-don-dark.png"
                srcSet="/logo-grupo-don-dark.png 1x, /logo-grupo-don-dark@2x.png 2x"
                alt="Pautta"
                className="staff-logo staff-logo-light"
              />
              <img
                src="/logo-grupo-don-white.png"
                srcSet="/logo-grupo-don-white.png 1x, /logo-grupo-don@2x.png 2x"
                alt="Pautta"
                className="staff-logo staff-logo-dark"
              />
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider shrink-0">
                IA
              </span>
            </div>
          )}
          <button
            type="button"
            className="staff-collapse btn btn-ghost btn-icon btn-sm"
            onClick={toggleCollapse}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            className="staff-close btn btn-ghost btn-icon btn-sm"
            onClick={() => setDrawer(false)}
            aria-label="Fechar menu"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <nav aria-label="Menu da agência" className="staff-nav">
          <Item
            collapsed={collapsed}
            icon={<Home size={18} strokeWidth={1.75} />}
            label="Início"
            active={onPanel}
            onClick={() => {
              setDrawer(false)
              if (!onPanel) go('/admin')
              else window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
          <Item
            collapsed={collapsed}
            icon={<CheckSquare size={18} strokeWidth={1.75} />}
            label="Pauta"
            badge={tasks.pending}
            active={pathname.startsWith('/admin/tarefas')}
            onClick={() => {
              setDrawer(false)
              go('/admin/tarefas')
            }}
          />
          {canManage && (
            <Item
              collapsed={collapsed}
              icon={<Gauge size={18} strokeWidth={1.75} />}
              label="Performance"
              active={onPerformance}
              onClick={() => {
                setDrawer(false)
                go('/admin/equipe')
              }}
            />
          )}
          {canOperate && (
            <Item
              collapsed={collapsed}
              icon={<FileBarChart size={18} strokeWidth={1.75} />}
              label="Criação"
              active={onReports}
              onClick={() => {
                setDrawer(false)
                go('/admin/reports')
              }}
            />
          )}
          {canManage && (
            <Item
              collapsed={collapsed}
              icon={<Settings size={18} strokeWidth={1.75} />}
              label="Configurações"
              active={onConfig}
              onClick={() => {
                setDrawer(false)
                go('/admin/configuracoes')
              }}
            />
          )}

          <div className="staff-group">Ferramentas</div>
          {canOperate && (
            <Item
              collapsed={collapsed}
              icon={<Puzzle size={18} strokeWidth={1.75} />}
              label="Integrações"
              onClick={() => open('integracoes')}
            />
          )}
          {canOperate && (
            <Item
              collapsed={collapsed}
              icon={<Receipt size={18} strokeWidth={1.75} />}
              label="Faturamento"
              active={pathname.startsWith('/admin/faturamento')}
              onClick={() => {
                setDrawer(false)
                go('/admin/faturamento')
              }}
            />
          )}

          {canManage && (
            <>
              <div className="staff-group">Análise</div>
              <Item
                collapsed={collapsed}
                icon={<Activity size={18} strokeWidth={1.75} />}
                label="Uso do app"
                active={onUsage}
                onClick={() => {
                  setDrawer(false)
                  go('/admin/uso')
                }}
              />
              <Item
                collapsed={collapsed}
                icon={<MousePointerClick size={18} strokeWidth={1.75} />}
                label="Heatmap"
                active={onHeatmap}
                onClick={() => {
                  setDrawer(false)
                  go('/admin/heatmap')
                }}
              />
              <Item
                collapsed={collapsed}
                icon={<Radar size={18} strokeWidth={1.75} />}
                label="Consumo da Meta"
                active={pathname.startsWith('/admin/consumo-meta')}
                onClick={() => {
                  setDrawer(false)
                  go('/admin/consumo-meta')
                }}
              />
            </>
          )}
        </nav>
      </aside>

      {/* Main Area with TopBar and Content */}
      <div className="staff-main flex flex-col min-h-screen bg-gradient-to-br from-background to-muted/30">
        <TopBar
          collapsed={collapsed}
          onToggleSidebar={toggleCollapse}
          onOpenMobileDrawer={() => setDrawer(true)}
        />
        <div className="flex-1 p-3 md:p-6 overflow-auto min-h-0 min-w-0">
          {children}
        </div>
      </div>

      {/* Botão flutuante de Suporte Pautta */}
      <button
        type="button"
        onClick={() => window.open('https://wa.me/5511999999999', '_blank')}
        className="fixed bottom-5 right-5 z-40 h-10 w-10 rounded-full bg-card hover:bg-muted text-foreground border border-border shadow-soft flex items-center justify-center transition-all hover:scale-105 group"
        title="Suporte Pautta"
        aria-label="Suporte Pautta"
      >
        <Headset className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
      </button>

      {navigating && <PulseLoader fullscreen size={72} />}
    </div>
  )
}
