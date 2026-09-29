'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  User as UserIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  Shield,
  Sun,
  Moon,
  LogOut,
  Headset,
} from 'lucide-react'
import { useTheme } from '@/lib/useTheme'
import { apiFetch } from '@/lib/apiFetch'
import { ProfileModal, type Me, ROLE_LABEL } from '@/components/ProfileMenu'

export function UserMenu() {
  const router = useRouter()
  const { theme, toggle: toggleTheme } = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [open, setOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    apiFetch('/api/admin/profile', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: Me | null) => {
        if (alive && data?.role) setMe(data)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function handleSignOut() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    window.location.assign('/admin')
  }

  if (!me) {
    return (
      <div className="h-7 w-7 rounded-full bg-muted animate-pulse shrink-0" />
    )
  }

  const initials = me.name
    ? me.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(p => p[0])
        .join('')
        .toUpperCase()
    : 'U'

  const isAdmin = me.role === 'owner' || me.role === 'admin'

  return (
    <>
      <div className="relative inline-block text-left" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="flex items-center gap-2 p-0.5 rounded-full hover:ring-2 hover:ring-primary/40 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Menu do usuário"
          aria-expanded={open}
        >
          {me.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.avatar}
              alt={me.name || 'Avatar'}
              className="h-7 w-7 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold ring-1 ring-border">
              {initials}
            </div>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg p-1.5 z-50 text-foreground animate-in fade-in-0 zoom-in-95 duration-100">
            {/* User Header */}
            <div className="px-2 py-2 border-b border-border/60">
              <div className="font-semibold text-xs truncate text-foreground">
                {me.name || 'Colaborador'}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {me.email}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                  {isAdmin ? <ShieldCheck className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
                  {ROLE_LABEL[me.role] || me.role}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setProfileModalOpen(true)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted text-foreground transition-colors text-left"
              >
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Meu perfil</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  toggleTheme()
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-muted text-foreground transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  {theme === 'dark' ? (
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>Tema</span>
                </span>
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  {theme === 'dark' ? 'Escuro' : 'Claro'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  router.push('/admin/configuracoes')
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted text-foreground transition-colors text-left"
              >
                <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Configurações</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  window.open('https://wa.me/5511999999999', '_blank')
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-muted text-foreground transition-colors text-left"
              >
                <Headset className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Suporte</span>
              </button>
            </div>

            {/* Logout */}
            <div className="pt-1 border-t border-border/60">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors text-left font-medium"
              >
                <LogOut className="h-3.5 w-3.5 text-destructive" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {profileModalOpen && (
        <ProfileModal
          me={me}
          onClose={() => setProfileModalOpen(false)}
          onSaved={updated => {
            setMe(updated)
            setProfileModalOpen(false)
          }}
        />
      )}
    </>
  )
}
