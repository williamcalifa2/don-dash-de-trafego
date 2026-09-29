'use client'

import { PanelLeftClose, PanelLeftOpen, Menu } from 'lucide-react'
import { GlobalSearch } from './GlobalSearch'
import { UserMenu } from './UserMenu'

interface TopBarProps {
  collapsed?: boolean
  onToggleSidebar?: () => void
  onOpenMobileDrawer?: () => void
}

export function TopBar({ collapsed, onToggleSidebar, onOpenMobileDrawer }: TopBarProps) {
  return (
    <header className="h-11 shrink-0 border-b border-border bg-muted/40 backdrop-blur-md px-3 md:px-4 flex items-center justify-between gap-3 sticky top-0 z-30">
      {/* Mobile Drawer Trigger */}
      {onOpenMobileDrawer && (
        <button
          type="button"
          onClick={onOpenMobileDrawer}
          className="md:hidden h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          aria-label="Abrir menu mobile"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* Desktop Sidebar Toggle */}
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden md:inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
          title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Centered Global Search */}
      <div className="flex-1 flex justify-center">
        <GlobalSearch />
      </div>

      {/* User Menu */}
      <div className="flex items-center gap-2">
        <UserMenu />
      </div>
    </header>
  )
}
