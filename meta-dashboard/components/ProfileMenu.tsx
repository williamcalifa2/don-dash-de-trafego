'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut, Moon, Settings, Sun, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { fileToLogoDataUrl } from '@/lib/resizeLogo'
import { useTheme } from '@/lib/useTheme'

export const ROLE_LABEL: Record<string, string> = { owner: 'Administrador principal', admin: 'Administrador', member: 'Membro', reader: 'Leitor' }

export interface Me { role: string; email: string; name: string; avatar: string | null }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'

export function Avatar({ me, size = 32 }: { me: Me; size?: number }) {
  return me.avatar
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={me.avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--text-1)', fontSize: size * 0.4, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{initials(me.name)}</span>
}

/** Configurações de quem está logado: nome, foto e tema. */
export function ProfileModal({ me, onClose, onSaved }: { me: Me; onClose: () => void; onSaved: (m: Me) => void }) {
  const { theme, toggle } = useTheme()
  const [name, setName] = useState(me.name)
  const [avatar, setAvatar] = useState<string | null>(me.avatar)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  async function pick(f: File | undefined) {
    if (!f) return
    setErr(null)
    try { setAvatar(await fileToLogoDataUrl(f)) } catch (e) { setErr(e instanceof Error ? e.message : 'Não consegui usar essa foto.') }
  }
  async function save() {
    setBusy(true); setErr(null)
    const r = await apiFetch('/api/admin/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, avatar }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) as { name?: string; avatar?: string | null; error?: string } : {}
    setBusy(false)
    if (!r?.ok) return setErr(j.error ?? 'Não foi possível salvar.')
    onSaved({ ...me, name: j.name ?? name, avatar: j.avatar ?? null })
    onClose()
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Configurações" className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}><h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, flex: 1 }}>Configurações</h2><button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar me={{ ...me, name, avatar }} size={72} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>Trocar foto</button>
            {avatar && <button className="btn btn-ghost btn-sm" onClick={() => setAvatar(null)}>Remover foto</button>}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>Seu nome
          <input className="field" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        </label>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{me.email} · {ROLE_LABEL[me.role] ?? me.role}</div>
        <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }} onClick={toggle}>{theme === 'dark' ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />} Tema {theme === 'dark' ? 'claro' : 'escuro'}</button>
        {err && <p role="alert" style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn btn-outline" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
      </div>
    </div>
  )
}


/** Foto de quem está logado: ao clicar abre o menu com Configurações e Sair. */
export function ProfileMenu({ align = 'right' }: { align?: 'left' | 'right' }) {
  const [me, setMe] = useState<Me | null>(null)
  const [menu, setMenu] = useState(false)
  const [profile, setProfile] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    apiFetch('/api/admin/profile', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: Me | null) => { if (alive && j?.role) setMe(j) }).catch(() => { })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    if (!menu) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [menu])

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    window.location.assign('/admin')
  }

  if (!me) return null
  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'none', textAlign: 'left' }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label={`Perfil de ${me.name}`} title={me.name} style={{ border: 'none', background: 'none', padding: 0, borderRadius: '50%', cursor: 'pointer', display: 'inline-flex' }}>
        <Avatar me={me} size={36} />
      </button>
      {menu && (
        <div role="menu" className="popover" style={{ position: 'absolute', [align]: 0, top: 'calc(100% + 8px)', minWidth: 200, padding: 4, zIndex: 300 }}>
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border-soft)', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ROLE_LABEL[me.role] ?? me.role}</div>
          </div>
          <button role="menuitem" className="popover-item" style={item} onClick={() => { setMenu(false); setProfile(true) }}><Settings size={15} strokeWidth={1.75} /> Configurações</button>
          <button role="menuitem" className="popover-item" style={item} onClick={logout}><LogOut size={15} strokeWidth={1.75} /> Sair</button>
        </div>
      )}
      {profile && <ProfileModal me={me} onClose={() => setProfile(false)} onSaved={setMe} />}
    </div>
  )
}
