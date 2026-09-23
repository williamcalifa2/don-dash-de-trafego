'use client'

import MetaSyncPopover from '@/components/MetaSyncPopover'
import ClientCodesMenu from '@/components/ClientCodesMenu'
import AdminOverview from '@/components/AdminOverview'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Shield, Plus, Copy, Check, ExternalLink, Settings2, Pencil, KeyRound, UserPlus, Trash2, Ban, LockOpen, Link2, X, LogOut, Moon, Sun, Search, GripVertical, Users, RefreshCw, CalendarDays, ChevronDown, TrendingUp, DollarSign, Clock } from 'lucide-react'
import { Sparkline } from '@/components/Sparkline'
import { STATUS_META } from '@/components/LeadsTab'
import { timeAgo } from '@/lib/leadUtils'
import { fileToLogoDataUrl } from '@/lib/resizeLogo'
import { ALL_KEYS, CARD_METRICS, MAX_CARD_METRICS, cardSource, moveItem, resolveChoice, type CardChoice, type CardPeriod, type MetricKey } from '@/lib/adminCard'
import { ADMIN_PERIODS, parseAdminPeriod, type AdminPeriod, type PeriodDays } from '@/lib/periods'
import { type ResultKind } from '@/lib/resultKind'
import { platformsFor } from '@/lib/platforms'
import { PlatformBadges } from '@/components/PlatformBadges'
import { useTheme } from '@/lib/useTheme'
import { StatusToggle } from '@/components/StatusToggle'
import { ClientConfigModal } from '@/components/ClientConfigModal'
import type { LeadStatus } from '@/lib/leadTypes'

interface AdminClient {
  slug: string
  name: string
  logoUrl: string | null
  adAccountId: string | null
  pageId: string | null
  hasCode: boolean
  active?: boolean
  locked: boolean
  leadCount: number
  lastLeadAt: string | null
  leadsToday: number
  parados: number
  daily: number[]
  /** resultado real da conta na Meta; null = ainda sem dados */
  resultKind: ResultKind | null
  /** Meta + CRM por período (7, 14 e 30 dias) */
  periods: Record<AdminPeriod, CardPeriod>
  resultsSpanDays: number
  resultsDaily: number[] | null
  resultsAt: string | null
}

/** Cliente cujo padrão é mostrar o resultado da Meta (site, conversas, personalizada, misto). */
const isResultsView = (c: AdminClient) => !!c.resultKind && c.resultKind !== 'form'
interface RecentLead { client: string; slug: string; nome: string | null; campanha: string | null; status: string; createdAt: string }
interface MetaOption { id: string; name: string; currency?: string }

type Modal =
  | { kind: 'new' }
  | { kind: 'edit'; client: AdminClient }
  | { kind: 'config'; client: AdminClient }
  | { kind: 'code'; client: { slug: string; name: string }; code: string; created: boolean }
  | { kind: 'confirm'; action: 'rotate' | 'revoke'; client: AdminClient }
  | { kind: 'metrics'; client: AdminClient }
  | { kind: 'team' }
  | { kind: 'member-token'; email: string; token: string; role: TeamRole }
  | null

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

async function api<T = Record<string, unknown>>(url: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) as T & { error?: string } }
}

/** Botão de copiar só com ícone, discreto. */
function CopyIconButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="btn btn-ghost btn-icon btn-sm" title={done ? 'Copiado' : label} aria-label={label} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch { }
    }}>
      {done ? <Check size={16} strokeWidth={1.75} color="var(--green)" /> : <Copy size={16} strokeWidth={1.75} />}
    </button>
  )
}

function ModalShell({ title, onClose, children, maxWidth = 512 }: { title: string; onClose?: () => void; children: React.ReactNode; maxWidth?: number }) {
  useEffect(() => {
    if (!onClose) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div className="card" role="dialog" aria-label={title} style={{ width: '100%', maxWidth, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-elegant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
          {onClose && <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button>}
        </div>
        {children}
      </div>
    </div>
  )
}


type TeamRole = 'admin' | 'member' | 'reader'
interface TeamMember { email: string; createdAt: string; lastLoginAt: string | null; role: TeamRole }
const ROLE_INFO: Record<TeamRole, { label: string; text: string }> = {
  admin: { label: 'Administrador', text: 'Faz tudo: cria e edita clientes, gera tokens e gerencia a equipe.' },
  member: { label: 'Membro', text: 'Opera o dia a dia: atualiza números, trata leads e personaliza os cards. Não cria nem edita clientes.' },
  reader: { label: 'Leitor', text: 'Só olha: vê os painéis e os números, sem alterar nada.' },
}
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** Mensagem pronta para mandar ao colega por WhatsApp: link, e-mail e token. */
function inviteMessage(email: string, token: string, role: TeamRole): string {
  return `Oi! Segue o seu acesso ao Painel de controle do Grupo Don:\n\nLink: ${window.location.origin}/admin\nE-mail: ${email}\nNível de acesso: ${ROLE_INFO[role].label}\nToken de acesso (é a sua senha): ${token}\n\nÉ só entrar com esse e-mail e colar o token no campo "Senha".`
}

function TeamModal({ onClose, onToken }: { onClose: () => void; onToken: (email: string, token: string, role: TeamRole) => void }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [canManageAdmins, setCanManageAdmins] = useState(false)
  const [role, setRole] = useState<TeamRole>('member')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await api<{ members: TeamMember[]; canManageAdmins?: boolean }>('/api/admin/team')
    if (r.ok) { setMembers(r.data.members ?? []); setCanManageAdmins(!!r.data.canManageAdmins) } else setErr(r.data.error ?? 'Não foi possível carregar a equipe.')
  }, [])
  useEffect(() => { load() }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy(true); setErr(null)
    const r = await api<{ email: string; token: string; role: TeamRole }>('/api/admin/team', 'POST', { email, role })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível adicionar.')
    onToken(r.data.email, r.data.token, r.data.role)
  }
  async function regenerate(m: TeamMember) {
    setBusy(true); setErr(null)
    const r = await api<{ token: string }>('/api/admin/team', 'PUT', { email: m.email })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível gerar o token.')
    onToken(m.email, r.data.token, m.role)
  }
  async function changeRole(m: TeamMember, next: TeamRole) {
    setBusy(true); setErr(null)
    const r = await api('/api/admin/team', 'PATCH', { email: m.email, role: next })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível mudar o nível.')
    load()
  }
  async function remove(m: TeamMember) {
    setBusy(true); setErr(null)
    const r = await api('/api/admin/team?email=' + encodeURIComponent(m.email), 'DELETE')
    setBusy(false); setConfirm(null)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível remover.')
    load()
  }

  return (
    <ModalShell title="Equipe" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Cada pessoa entra só com o e-mail cadastrado aqui e o token que você gerar, que funciona como senha. Escolha o nível de acesso dela.</p>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id="team-email" type="email" className="field" style={{ flex: '1 1 200px', minWidth: 0 }} placeholder="email@colega.com" aria-label="E-mail do colega" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} />
        <select id="team-role" className="field" style={{ flex: '0 0 auto', width: 'auto' }} aria-label="Nível de acesso" value={role} onChange={e => setRole(e.target.value as TeamRole)}>
          {(Object.keys(ROLE_INFO) as TeamRole[]).map(r => <option key={r} value={r} disabled={r === 'admin' && !canManageAdmins}>{ROLE_INFO[r].label}</option>)}
        </select>
        <button className="btn btn-primary" disabled={busy || !email.trim()}>Adicionar</button>
      </form>
      <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: -6 }}>{ROLE_INFO[role].text}</p>
      {err && <p role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{err}</p>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {members === null && !err && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Carregando…</p>}
        {members?.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-2)', padding: '12px 0' }}>Ninguém na equipe ainda.</p>}
        {members?.map(m => (
          <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border-soft)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.lastLoginAt ? `Último acesso em ${fmtShort(m.lastLoginAt)}` : 'Ainda não entrou'} · adicionado em {fmtShort(m.createdAt)}</div>
            </div>
            <select className="field" style={{ width: 'auto', height: 32, fontSize: 12 }} aria-label={`Nível de ${m.email}`} value={m.role} disabled={busy || (m.role === 'admin' && !canManageAdmins)} onChange={e => changeRole(m, e.target.value as TeamRole)}>
              {(Object.keys(ROLE_INFO) as TeamRole[]).map(r => <option key={r} value={r} disabled={r === 'admin' && !canManageAdmins}>{ROLE_INFO[r].label}</option>)}
            </select>
            {confirm === m.email ? (
              <>
                <button className="btn btn-outline btn-sm" onClick={() => setConfirm(null)}>Cancelar</button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => remove(m)}>Remover</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-icon btn-sm" disabled={busy} onClick={() => regenerate(m)} aria-label={`Gerar novo token para ${m.email}`} title="Gerar novo token"><KeyRound size={16} strokeWidth={1.75} /></button>
                <button className="btn btn-ghost btn-icon btn-sm" disabled={busy} onClick={() => setConfirm(m.email)} aria-label={`Remover ${m.email}`} title="Remover da equipe"><Trash2 size={16} strokeWidth={1.75} /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

function MemberTokenModal({ email, token, role, onClose }: { email: string; token: string; role: TeamRole; onClose: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <ModalShell title={`Acesso de ${email}`}>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}><strong>{ROLE_INFO[role].label}</strong> · {ROLE_INFO[role].text}</p>
      <p style={{ fontSize: 13, color: 'var(--text-2)' }}>O token não aparece de novo depois de fechar. Copie a mensagem e envie para a pessoa.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-card2)', borderRadius: 'var(--radius)' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 22, fontWeight: 700, letterSpacing: '0.12em', userSelect: 'all', overflowWrap: 'anywhere' }}>{token}</span>
        <CopyIconButton value={token} label="Copiar token" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(inviteMessage(email, token, role)); setDone(true); setTimeout(() => setDone(false), 2000) } catch { } }}>
          {done ? <Check size={16} strokeWidth={1.75} color="var(--green)" /> : <Copy size={16} strokeWidth={1.75} />} {done ? 'Mensagem copiada' : 'Copiar mensagem'}
        </button>
        <button className="btn btn-primary" onClick={onClose}>Concluir</button>
      </div>
    </ModalShell>
  )
}

function Avatar({ name, logoUrl, size = 40 }: { name: string; logoUrl: string | null; size?: number }) {
  return logoUrl ? (
    <img src={logoUrl} alt="" style={{ width: size, height: size, borderRadius: 12, objectFit: 'contain', background: 'var(--bg-card2)', flexShrink: 0 }} />
  ) : (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}

type MenuItem = { icon: React.ReactNode; text: string; onClick: () => void; danger?: boolean } | 'sep'

/** Um botão só com o período escolhido; abre a lista. Evita uma fila de botões no topo. */
function PeriodMenu({ value, onChange }: { value: AdminPeriod; onChange: (p: AdminPeriod) => void }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (!pos) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [pos])
  const current = ADMIN_PERIODS.find(p => p.v === value) ?? ADMIN_PERIODS[1]
  return (
    <>
      <button className="btn btn-outline btn-sm" aria-haspopup="listbox" aria-expanded={!!pos} aria-label={`Período: ${current.label}`}
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPos(p => p ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }) }}>
        <CalendarDays size={16} strokeWidth={1.75} /> {current.label} <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setPos(null)} />
          <div className="popover" role="listbox" aria-label="Período" style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 160 }}>
            {ADMIN_PERIODS.map(p => (
              <div key={String(p.v)} role="option" aria-selected={p.v === value} tabIndex={0} className="popover-item" style={p.v === value ? { background: 'var(--accent-soft)' } : undefined}
                onClick={() => { setPos(null); onChange(p.v) }}
                onKeyDown={e => { if (e.key === 'Enter') { setPos(null); onChange(p.v) } }}>
                <span style={{ flex: 1 }}>{p.label}</span>{p.v === value && <Check size={14} strokeWidth={1.75} color="var(--accent)" />}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function GearMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (!pos) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [pos])
  return (
    <>
      <button className="btn btn-outline btn-icon btn-sm" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} title="Mais opções"
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPos(p => p ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }) }}>
        <Settings2 size={16} strokeWidth={1.75} />
      </button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setPos(null)} />
          <div className="popover" role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 224 }}>
            {items.map((it, i) => it === 'sep' ? (
              <div key={i} style={{ height: 1, background: 'var(--border-soft)', margin: '4px 0' }} />
            ) : (
              <div key={i} role="menuitem" tabIndex={0} className="popover-item" style={{ color: it.danger ? 'var(--red)' : undefined }}
                onClick={() => { setPos(null); it.onClick() }}
                onKeyDown={e => { if (e.key === 'Enter') { setPos(null); it.onClick() } }}>
                {it.icon}{it.text}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function ClientForm({ initial, baseDomain, accounts, accountsError, accountsSavedAt, onDone, onCancel }: {
  initial?: AdminClient
  baseDomain: string | null
  accounts: MetaOption[]
  accountsError?: string | null
  accountsSavedAt?: number | null
  onDone: (r: { slug: string; name: string; code?: string; imported?: number | null }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!!initial)
  const [adAccountId, setAdAccountId] = useState(initial?.adAccountId ?? '')
  const pageId = initial?.pageId ?? ''
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '')
  const [logoError, setLogoError] = useState<string | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Status Ativo/Pausado da conta
  const [active, setActive] = useState<boolean>(initial?.active !== false)

  useEffect(() => {
    if (!initial?.slug) return
    let alive = true
    fetch(`/api/admin/clients/${initial.slug}/config`)
      .then(r => r.ok ? r.json() : null)
      .then((cfg: { active?: boolean } | null) => {
        if (!alive || !cfg) return
        if (cfg.active !== undefined) setActive(cfg.active !== false)
      })
      .catch(() => { })
    return () => { alive = false }
  }, [initial?.slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = { name, slug, adAccountId, pageId, logoUrl }
    const r = initial
      ? await api(`/api/admin/clients/${initial.slug}`, 'PATCH', payload)
      : await api<{ slug: string; code: string }>('/api/admin/clients', 'POST', payload)

    if (!r.ok) {
      setSaving(false)
      setError(r.data.error ?? 'Não foi possível salvar.')
      return
    }

    const savedSlug = initial?.slug ?? (r.data as { slug: string }).slug

    // Salva status do cliente
    await api(`/api/admin/clients/${savedSlug}/config`, 'POST', { active }).catch(() => { })

    setSaving(false)
    onDone({ slug: savedSlug, name, code: (r.data as { code?: string }).code, imported: (r.data as { imported?: number | null }).imported })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Status Toggle Card */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 14,
          background: active ? 'var(--bg-card2)' : 'rgba(245, 158, 11, 0.08)',
          border: `1px solid ${active ? 'var(--border-soft)' : 'var(--amber)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
            Status: {active ? 'Cliente Ativo' : 'Cliente Pausado'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {active
              ? 'Sincroniza campanhas e leads normalmente em segundo plano.'
              : 'Pausado: não gasta requisições na Meta nem sincroniza em segundo plano.'}
          </div>
        </div>

        <StatusToggle checked={active} onChange={setActive} />
      </div>

      {/* Identidade */}
      <div>
        <label htmlFor="c-name" style={labelStyle}>Nome do cliente</label>
        <input id="c-name" className="field" value={name} required maxLength={80} autoFocus
          onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }} />
      </div>

      {!initial && (
        <div>
          <label htmlFor="c-slug" style={labelStyle}>Endereço do painel</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!baseDomain && <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{typeof window !== 'undefined' ? window.location.host : ''}/dashboard/</span>}
            <input id="c-slug" className="field" style={{ flex: 1, minWidth: 140 }} value={slug} required maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true) }} />
            {baseDomain && <span style={{ fontSize: 14, color: 'var(--text-2)' }}>.{baseDomain}</span>}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="c-acc" style={labelStyle}>Conta de anúncios do Meta</label>
        {accounts.length > 0 ? (
          <select id="c-acc" className="field" value={adAccountId} onChange={e => setAdAccountId(e.target.value)}>
            <option value="">Selecione…</option>
            {adAccountId && !accounts.some(a => a.id === adAccountId) && <option value={adAccountId}>{adAccountId}</option>}
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.id}{a.currency ? ` · ${a.currency}` : ''}</option>)}
          </select>
        ) : (
          <input id="c-acc" className="field" placeholder="act_123456789" value={adAccountId} onChange={e => setAdAccountId(e.target.value)} />
        )}
        {accountsError && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>{accounts.length > 0 ? `Mostrando a última lista salva${accountsSavedAt ? ` (${new Date(accountsSavedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''}. ` : 'Ainda não tenho uma lista salva. '}{accountsError} {accounts.length > 0 ? 'Se a conta não estiver aqui, tente de novo em alguns minutos.' : 'Você pode digitar o número da conta (act_…).'}</p>}
      </div>

      <div>
        <span style={labelStyle}>Logo (opcional)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={name || '?'} logoUrl={logoUrl || null} size={48} />
          <input id="c-logo" ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
            onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              setLogoError(null)
              try { setLogoUrl(await fileToLogoDataUrl(f)) } catch (err) { setLogoError(err instanceof Error ? err.message : 'Não foi possível usar essa imagem.') }
            }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => logoInput.current?.click()}>{logoUrl ? 'Trocar' : 'Escolher arquivo'}</button>
          {logoUrl && <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => setLogoUrl('')}>Remover</button>}
        </div>
        {logoError && <p role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{logoError}</p>}
      </div>

      {error && <p role="alert" style={{ fontSize: 14, color: 'var(--red)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={saving || !name || (!initial && !slug)}>
          {saving ? 'Salvando…' : initial ? 'Salvar' : 'Criar e gerar código'}
        </button>
      </div>
    </form>
  )
}

/** Escolha das métricas do card no estilo "Personalizar colunas": lista com busca à esquerda, escolhidas para arrastar à direita. */
function CardMetricsModal({ client, saved, days, onClose, onSaved }: { client: AdminClient; saved: unknown; days: PeriodDays; onClose: () => void; onSaved: (choice: CardChoice | null) => void }) {
  const kind = client.resultKind ?? 'form'
  const initial = resolveChoice(saved, client.resultKind)
  const [sel, setSel] = useState<MetricKey[]>(initial.metrics)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)

  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const toggle = (k: MetricKey) => setSel(cur => cur.includes(k) ? cur.filter(x => x !== k) : cur.length >= MAX_CARD_METRICS ? cur : [...cur, k])
  const move = (from: number, to: number) => setSel(cur => moveItem(cur, from, to))
  async function save(list: MetricKey[], d: PeriodDays) {
    setBusy(true); setErr(null)
    const r = await api('/api/admin/card-metrics', 'PUT', { slug: client.slug, metrics: list, days: d })
    setBusy(false)
    if (!r.ok) { setErr(r.data.error ?? 'Não foi possível salvar.'); return }
    onSaved(list.length ? { metrics: list, days: d } : null)
  }
  const groups: Array<[string, MetricKey[]]> = [
    ['Leads e vendas', ALL_KEYS.filter(k => CARD_METRICS[k].group === 'crm')],
    ['Meta · o que a conta gera', ALL_KEYS.filter(k => CARD_METRICS[k].group === 'meta')],
  ]
  const q = norm(query.trim())
  const full = sel.length >= MAX_CARD_METRICS

  return (
    <ModalShell title={`Personalizar card · ${client.name}`} onClose={onClose} maxWidth={860}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)', gap: 20, alignItems: 'stretch' }} className="card-metrics-grid">
        {/* Esquerda: catálogo */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="search" style={{ height: 36 }}>
            <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar métricas" aria-label="Pesquisar métricas" />
          </label>
          <div style={{ overflowY: 'auto', maxHeight: 'min(52vh, 440px)', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {groups.map(([title, keys]) => {
              const shown = keys.filter(k => !q || norm(CARD_METRICS[k].label(kind)).includes(q))
              if (!shown.length) return null
              return (
                <div key={title}>
                  <div style={{ ...eyebrow, marginBottom: 6 }}>{title}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: 2 }}>
                    {shown.map(k => {
                      const on = sel.includes(k)
                      return (
                        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, fontSize: 13, cursor: on || !full ? 'pointer' : 'not-allowed', opacity: !on && full ? .5 : 1, background: on ? 'var(--accent-soft)' : 'transparent' }}>
                          <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(k)} style={{ accentColor: 'var(--accent)' }} />
                          <span style={{ minWidth: 0 }}>{CARD_METRICS[k].label(kind)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {q && groups.every(([, keys]) => !keys.some(k => norm(CARD_METRICS[k].label(kind)).includes(q))) && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Nenhuma métrica com “{query}”.</p>}
          </div>
        </div>

        {/* Direita: escolhidas, arrastáveis */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, borderLeft: '1px solid var(--border-soft)', paddingLeft: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{sel.length} {sel.length === 1 ? 'métrica selecionada' : 'métricas selecionadas'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Arraste e solte para reordenar (máx. {MAX_CARD_METRICS})</div>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', maxHeight: 'min(40vh, 340px)', flex: 1 }}>
            {sel.length === 0 && <li style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>Escolha pelo menos uma métrica.</li>}
            {sel.map((k, i) => (
              <li
                key={k} draggable
                onDragStart={e => { setDrag({ from: i, over: i }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
                onDragOver={e => { e.preventDefault(); if (drag && drag.over !== i) setDrag({ ...drag, over: i }) }}
                onDrop={e => { e.preventDefault(); if (drag) move(drag.from, i); setDrag(null) }}
                onDragEnd={() => setDrag(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 6px', borderBottom: '1px solid var(--border-soft)', fontSize: 13, cursor: 'grab', background: drag?.from === i ? 'var(--bg-card2)' : 'transparent', borderTop: drag && drag.over === i && drag.from !== i ? '2px solid var(--accent)' : '2px solid transparent', opacity: drag?.from === i ? .6 : 1 }}
              >
                <button type="button" aria-label={`Mover ${CARD_METRICS[k].label(kind)}`} title="Arraste (ou use as setas ↑ ↓)"
                  onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1) } if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1) } }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'grab', padding: 0, lineHeight: 0 }}>
                  <GripVertical size={16} strokeWidth={1.75} />
                </button>
                <span style={{ flex: 1, minWidth: 0 }}>{CARD_METRICS[k].label(kind)}</span>
                <button type="button" onClick={() => toggle(k)} aria-label={`Remover ${CARD_METRICS[k].label(kind)}`} title="Remover" style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                  <X size={16} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {err && <p role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save([], 7)}>Voltar ao padrão</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={busy || !sel.length} onClick={() => save(sel, days)}>Salvar</button>
        </div>
      </div>
    </ModalShell>
  )
}

export default function AdminPage() {
  const { theme, toggle } = useTheme()
  const [phase, setPhase] = useState<'loading' | 'login' | 'off' | 'ready'>('loading')
  const [clients, setClients] = useState<AdminClient[]>([])
  const [recent, setRecent] = useState<RecentLead[]>([])
  const [baseDomain, setBaseDomain] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<MetaOption[]>([])
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [accountsSavedAt, setAccountsSavedAt] = useState<number | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  // Nível de quem está logado: dono, administrador, membro ou leitor. O servidor confere de novo; aqui só se esconde o que a pessoa não pode usar.
  const [role, setRole] = useState<'owner' | TeamRole | null>(null)
  const canManage = role === 'owner' || role === 'admin'
  const canOperate = canManage || role === 'member'
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [keyStatus, setKeyStatus] = useState<string>('service')
  const [brandLogo, setBrandLogo] = useState<string | null>(null)
  const [cardMetrics, setCardMetrics] = useState<Record<string, unknown>>({})
  // Período único do painel: muda a visão geral, os números do topo e os cards de todos os clientes.
  const [period, setPeriodState] = useState<AdminPeriod>(7)
  useEffect(() => { try { const v = parseAdminPeriod(localStorage.getItem('adminPeriod')); if (v) setPeriodState(v) } catch { } }, [])
  const setPeriod = (p: AdminPeriod) => { setPeriodState(p); try { localStorage.setItem('adminPeriod', String(p)) } catch { } }
  const periodNoun = ADMIN_PERIODS.find(x => x.v === period)?.noun ?? '7 dias'
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'todos' | 'ativos' | 'pausados' | 'acesso' | 'sem' | 'bloqueados'>('todos')

  useEffect(() => { document.title = 'Painel de controle' }, [])

  const load = useCallback(async () => {
    const r = await api<{ clients: AdminClient[]; recent: RecentLead[]; keyStatus?: string; baseDomain?: string | null; brandLogoUrl?: string | null; cardMetrics?: Record<string, unknown> }>(`/api/admin/clients?period=${period}`)
    if (r.status === 404) return setPhase('off')
    if (r.status === 401) return setPhase('login')
    if (r.ok) {
      setClients(r.data.clients); setBrandLogo(r.data.brandLogoUrl ?? null); setCardMetrics(r.data.cardMetrics ?? {}); setRecent(r.data.recent ?? []); setKeyStatus(r.data.keyStatus ?? 'service'); setBaseDomain(r.data.baseDomain ?? null); setPhase('ready')
    } else { setNotice(r.data.error ?? 'Erro ao carregar clientes'); setPhase('ready') }
  }, [period])

  useEffect(() => { load() }, [load])

  // "Atualizar tudo": busca na Meta os números de todos os cards e recarrega a tela.
  const [refreshing, setRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  async function refreshAll() {
    setRefreshing(true); setNotice(null)
    const r = await api<{ total: number; refreshed: number; skipped: number; failed: number; stopped?: string }>('/api/admin/refresh-all', 'POST')
    if (!r.ok) setNotice(r.data.error ?? 'Não foi possível atualizar agora.')
    else {
      const d = r.data
      setNotice(d.stopped
        ? `${d.refreshed} de ${d.total} atualizados. A Meta está em pausa por proteção (${d.stopped}); o resto volta sozinho.`
        : `${d.refreshed} de ${d.total} clientes atualizados${d.skipped ? ` · ${d.skipped} pausados` : ''}${d.failed ? ` · ${d.failed} com erro` : ''}.`)
    }
    await load(); setRefreshKey(k => k + 1)
    setRefreshing(false)
  }

  useEffect(() => {
    if (phase !== 'ready') return
    api<{ role: 'owner' | TeamRole }>('/api/admin/whoami').then(r => setRole(r.ok ? r.data.role : null))
    api<{ accounts: MetaOption[]; error?: string; cachedAt?: number | null }>('/api/admin/meta-accounts').then(r => {
      if (r.ok) { setAccounts(r.data.accounts ?? []); setAccountsError(r.data.error ?? null); setAccountsSavedAt(r.data.cachedAt ?? null) }
    })
  }, [phase])

  const clientUrl = (slug: string) => baseDomain ? `https://${slug}.${baseDomain}` : `${window.location.origin}/dashboard/${slug}`

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setLoginError(null)
    const r = await api('/api/admin/login', 'POST', { email: loginEmail, password: loginPassword })
    setBusy(false)
    if (!r.ok) return setLoginError(r.data.error ?? 'Não foi possível entrar.')
    setLoginPassword('')
    load()
  }

  async function logout() {
    await api('/api/auth/logout', 'POST')
    setPhase('login'); setClients([])
  }

  async function openPanel(slug: string) {
    const r = await api('/api/admin/view', 'POST', { slug })
    if (r.ok) window.location.assign(`/dashboard/${slug}`)
    else setNotice(r.data.error ?? 'Não foi possível abrir o painel.')
  }

  async function runAction(action: 'rotate' | 'revoke' | 'unlock', client: AdminClient) {
    setBusy(true)
    const r = action === 'rotate'
      ? await api<{ code: string }>(`/api/admin/clients/${client.slug}/code`, 'POST')
      : action === 'revoke'
        ? await api(`/api/admin/clients/${client.slug}/code`, 'DELETE')
        : await api(`/api/admin/clients/${client.slug}/unlock`, 'POST')
    setBusy(false)
    if (!r.ok) { setModal(null); return setNotice(r.data.error ?? 'Não foi possível concluir.') }
    await load()
    if (action === 'rotate') setModal({ kind: 'code', client, code: (r.data as { code: string }).code, created: false })
    else { setModal(null); setNotice(action === 'revoke' ? `Acesso de ${client.name} desativado.` : `${client.name} desbloqueado.`) }
  }

  const stats = useMemo(() => ({
    total: clients.length,
    withAccess: clients.filter(c => c.hasCode).length,
    leadsP: clients.reduce((s, c) => s + (isResultsView(c) ? c.periods[period].results : c.periods[period].crmLeads), 0),
    leadsToday: clients.reduce((s, c) => s + c.leadsToday, 0),
    vendasP: clients.reduce((s, c) => s + c.periods[period].vendas, 0),
    receitaP: clients.reduce((s, c) => s + c.periods[period].receita, 0),
    parados: clients.reduce((s, c) => s + c.parados, 0),
  }), [clients, period])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients.filter(c =>
      (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q)) &&
      (filter === 'todos' ||
        (filter === 'ativos' && c.active !== false) ||
        (filter === 'pausados' && c.active === false) ||
        (filter === 'acesso' && c.hasCode) ||
        (filter === 'sem' && !c.hasCode) ||
        (filter === 'bloqueados' && c.locked)))
  }, [clients, query, filter])

  const themeButton = (
    <button className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">
      {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
    </button>
  )

  if (phase === 'loading') return <main className="page" />

  if (phase === 'off') return (
    <main className="page"><div className="card" style={{ padding: 24, maxWidth: 480, margin: '80px auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Administração desativada</h1>
      <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 8 }}>Defina <code>ADMIN_EMAIL</code> e <code>ADMIN_PASSWORD</code> (mínimo 12 caracteres), além de <code>DASHBOARD_SESSION_SECRET</code>, no Vercel e faça um novo deploy.</p>
    </div></main>
  )

  if (phase === 'login') return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99, 102, 241, 0.18), transparent 70%), var(--bg)',
      }}
    >
      <div style={{ position: 'absolute', top: 20, right: 20 }}>{themeButton}</div>

      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        {/* Top Agency Branding & Logo with Radius */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(99, 102, 241, 0.05))',
              border: '1.5px solid rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px -4px rgba(99, 102, 241, 0.3)',
              overflow: 'hidden',
            }}
          >
            <img
              src="/brand-icon.png"
              alt="Don Digital"
              onError={e => {
                (e.currentTarget as HTMLImageElement).src = '/icon-192.png'
              }}
              style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase' }}>
              Don Digital
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              Painel Administrativo
            </div>
          </div>
        </div>

        {/* Card de Login */}
        <form
          onSubmit={login}
          className="card"
          style={{
            width: '100%',
            maxWidth: 440,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            borderRadius: 20,
            border: '1px solid var(--border)',
            boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)',
            background: 'var(--bg-card)',
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' }}>
              Entrar na Gestão
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Acesso exclusivo da equipe para controle de contas e clientes
            </p>
          </div>

          <div>
            <label htmlFor="admin-email" style={labelStyle}>E-mail</label>
            <input
              id="admin-email"
              type="email"
              className="field"
              autoFocus
              autoComplete="username"
              placeholder="seu@don.com.br"
              value={loginEmail}
              onChange={e => setLoginEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="admin-password" style={labelStyle}>Senha ou token de acesso</label>
            <input
              id="admin-password"
              type="password"
              className="field"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
            />
            {loginError && <p role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{loginError}</p>}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !loginEmail || !loginPassword}
            style={{ height: 44, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}
          >
            {busy ? 'Entrando…' : 'Acessar Painel'}
          </button>
        </form>
      </div>
    </main>
  )

  const kpis = [
    { icon: <Users size={16} strokeWidth={1.75} />, label: 'Clientes', value: String(stats.total), sub: `${stats.withAccess} com acesso`, warn: false },
    { icon: <TrendingUp size={16} strokeWidth={1.75} />, label: `Leads e conversas · ${periodNoun}`, value: String(stats.leadsP), sub: `${stats.leadsToday} hoje`, warn: false },
    { icon: <DollarSign size={16} strokeWidth={1.75} />, label: `Vendas · ${periodNoun}`, value: String(stats.vendasP), sub: brl(stats.receitaP), warn: false },
    { icon: <Clock size={16} strokeWidth={1.75} />, label: 'Sem contato', value: String(stats.parados), sub: 'leads esperando retorno', warn: stats.parados > 0 },
  ]

  return (
    <main className="page">
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <MetaSyncPopover logoUrl={brandLogo} onLogoChange={canManage ? setBrandLogo : undefined} canEditBrand={canManage} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>Painel de controle</h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Acompanhe os clientes, os leads e os acessos em um só lugar</p>
        </div>
        <PeriodMenu value={period} onChange={setPeriod} />
        {canOperate && <button className="btn btn-outline btn-sm" onClick={refreshAll} disabled={refreshing} aria-label="Atualizar todos os cards agora" title="Busca agora na Meta os números de todos os clientes">
          <RefreshCw size={16} strokeWidth={1.75} className={refreshing ? 'spin' : undefined} /> {refreshing ? 'Atualizando…' : 'Atualizar tudo'}
        </button>}
        {canManage && <ClientCodesMenu clients={clients} />}
        {canManage && <button className="btn btn-outline btn-icon btn-sm" onClick={() => setModal({ kind: 'team' })} aria-label="Equipe" title="Equipe"><UserPlus size={16} strokeWidth={1.75} /></button>}
        {themeButton}
        {canManage && <button className="btn btn-primary" onClick={() => setModal({ kind: 'new' })}><Plus size={16} strokeWidth={1.75} /> Novo cliente</button>}
        <button className="btn btn-outline btn-icon btn-sm" onClick={logout} aria-label="Sair" title="Sair"><LogOut size={16} strokeWidth={1.75} /></button>
      </header>

      {keyStatus !== 'service' && (
        <div role="alert" style={{ padding: 16, marginBottom: 16, background: 'var(--amber-soft)', border: '1px solid hsl(38 92% 50% / .4)', borderRadius: 'var(--radius-lg)', fontSize: 14, lineHeight: 1.6 }}>
          <strong style={{ fontWeight: 600 }}>A chave do Supabase não está correta.</strong>{' '}
          {keyStatus === 'missing' && 'A variável SUPABASE_SERVICE_ROLE_KEY não existe no Vercel. '}
          {keyStatus === 'anon' && 'A variável SUPABASE_SERVICE_ROLE_KEY tem a chave pública (anon/publishable), não a service_role. '}
          {keyStatus === 'unknown' && 'Não consegui reconhecer o formato da SUPABASE_SERVICE_ROLE_KEY. '}
          Por isso a lista de clientes pode aparecer vazia. Cole a chave <em>service_role</em> (ou <em>secret</em>) do Supabase no Vercel e faça um redeploy.
        </div>
      )}
      {notice && (
        <div role="status" className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>Fechar</button>
        </div>
      )}

      <div className="kpi-grid-4 stagger" style={{ marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ padding: 16, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>{k.icon}<span style={eyebrow}>{k.label}</span></div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 2px', lineHeight: 1.2, color: k.warn ? 'var(--amber)' : 'var(--text-1)' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <AdminOverview refreshKey={refreshKey} days={period} clients={clients.map(c => ({ slug: c.slug, name: c.name }))} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginRight: 4 }}>Clientes</h2>
        <label className="search" style={{ flex: 1, minWidth: 200, maxWidth: 360, height: 36 }}>
          <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" />
        </label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([['todos', 'Todos'], ['ativos', 'Ativos'], ['pausados', 'Pausados'], ['acesso', 'Com acesso'], ['sem', 'Sem acesso'], ['bloqueados', 'Bloqueados']] as const).map(([k, l]) => (
            <button key={k} className="pill-btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      {clients.length === 0 ? (
        <div style={{ padding: '48px 16px', border: '1px dashed var(--border-input)', borderRadius: 'var(--radius-lg)', textAlign: 'center', color: 'var(--text-2)' }}>
          <Users size={32} strokeWidth={1.5} style={{ opacity: .5, margin: '0 auto 8px', display: 'block' }} aria-hidden="true" />
          Nenhum cliente ainda. Crie o primeiro em “Novo cliente”.
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Nenhum cliente encontrado.</div>
      ) : (
        <div className="stagger" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {visible.map(c => {
            const badge = c.locked
              ? { bg: 'var(--red-soft)', dot: 'var(--red)', text: 'Bloqueado' }
              : c.active === false
                ? { bg: 'rgba(245, 158, 11, 0.15)', dot: 'var(--amber)', text: 'Pausado' }
                : c.hasCode
                  ? { bg: 'var(--green-soft)', dot: 'var(--green)', text: 'Com acesso' }
                  : { bg: 'var(--amber-soft)', dot: 'var(--amber)', text: 'Sem acesso' }
            const items: MenuItem[] = [
              ...(canManage ? [{ icon: <Pencil size={16} strokeWidth={1.75} />, text: 'Editar cliente e metas', onClick: () => setModal({ kind: 'edit', client: c }) }] : []),
              ...(canOperate ? [{ icon: <Settings2 size={16} strokeWidth={1.75} />, text: 'Métricas do card', onClick: () => setModal({ kind: 'metrics', client: c }) }] : []),
              ...(canManage ? [{ icon: <KeyRound size={16} strokeWidth={1.75} />, text: c.hasCode ? 'Revogar token' : 'Gerar token', onClick: () => c.hasCode ? setModal({ kind: 'confirm', action: 'rotate', client: c }) : runAction('rotate', c) }] : []),
              { icon: <Link2 size={16} strokeWidth={1.75} />, text: 'Copiar link do painel', onClick: () => { navigator.clipboard?.writeText(clientUrl(c.slug)).then(() => setNotice('Link copiado.')).catch(() => setNotice(clientUrl(c.slug))) } },
            ]
            if (canManage && c.locked) items.push({ icon: <LockOpen size={16} strokeWidth={1.75} />, text: 'Desbloquear acesso', onClick: () => runAction('unlock', c) })
            if (canManage && c.hasCode) items.push('sep', { icon: <Ban size={16} strokeWidth={1.75} />, text: 'Desativar acesso', danger: true, onClick: () => setModal({ kind: 'confirm', action: 'revoke', client: c }) })
            return (
              <article key={c.slug} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={c.name} logoUrl={c.logoUrl} />
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.3 }}>{c.name}</h3>
                    <PlatformBadges platforms={platformsFor(c)} height={10} />
                  </div>
                  <span className="badge" style={{ background: badge.bg, color: 'var(--text-1)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.dot }} />{badge.text}
                  </span>
                </div>

                {(() => {
                  const choice = resolveChoice(cardMetrics[c.slug], c.resultKind)
                  const keys = choice.metrics
                  const p = c.periods[period]
                  const source = cardSource(keys)
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px 12px' }}>
                        {keys.map(k => {
                          const def = CARD_METRICS[k]
                          const tone = def.tone?.(c, p)
                          return (
                            <div key={k} style={{ minWidth: 0 }}>
                              <div style={{ ...eyebrow, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={def.label(c.resultKind ?? 'form')}>{def.label(c.resultKind ?? 'form')}</div>
                              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: tone === 'good' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.value(c, p)}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {source === 'meta'
                            ? (c.resultsAt ? `${periodNoun} · Meta ${period === 'today' ? 'hoje' : 'até ontem'}, ${timeAgo(c.resultsAt)}${typeof period === 'number' && period > c.resultsSpanDays && c.resultsSpanDays > 0 ? ` · só ${c.resultsSpanDays} dias disponíveis` : ''}` : 'Sem dados da Meta ainda')
                            : `${periodNoun} · ${c.lastLeadAt ? `último lead ${timeAgo(c.lastLeadAt)}` : 'nenhum lead ainda'}`}
                        </span>
                        <Sparkline data={(source === 'meta' ? c.resultsDaily : null) ?? c.daily} width={112} height={32} />
                      </div>
                    </>
                  )
                })()}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => openPanel(c.slug)}>
                    <ExternalLink size={16} strokeWidth={1.75} /> Acessar dashboard
                  </button>
                  <GearMenu label={`Mais opções de ${c.name}`} items={items} />
                </div>
              </article>
            )
          })}
        </div>
      )}

      <section className="card" style={{ marginTop: 24, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-soft)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Atividade recente</h2>
          <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Últimos leads que chegaram, de todos os clientes</p>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>Nenhum lead nos últimos dias.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {recent.map((l, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '84px minmax(120px, 1fr) minmax(120px, 1.2fr) auto', gap: 16, alignItems: 'center', padding: '12px 24px', borderBottom: i < recent.length - 1 ? '1px solid var(--border-soft)' : 'none', fontSize: 14 }}>
                <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{timeAgo(l.createdAt)}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome ?? 'Sem nome'}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.client}</span>
                </span>
                <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.campanha ?? '—'}</span>
                <span className="badge" style={{ background: STATUS_META[l.status as LeadStatus]?.bg, color: 'var(--text-1)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_META[l.status as LeadStatus]?.dot }} />{l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal?.kind === 'new' && (
        <ModalShell title="Novo cliente" onClose={() => setModal(null)} maxWidth={560}>
          <ClientForm baseDomain={baseDomain} accounts={accounts} accountsError={accountsError} accountsSavedAt={accountsSavedAt} onCancel={() => setModal(null)}
            onDone={async r => { await load(); setModal(r.code ? { kind: 'code', client: { slug: r.slug, name: r.name }, code: r.code, created: true } : null); if (r.imported) setNotice(`${r.name}: ${r.imported} leads importados do Meta.`) }} />
        </ModalShell>
      )}
      {modal?.kind === 'edit' && (
        <ModalShell title={`Editar · ${modal.client.name}`} onClose={() => setModal(null)} maxWidth={560}>
          <ClientForm initial={modal.client} baseDomain={baseDomain} accounts={accounts} accountsError={accountsError} accountsSavedAt={accountsSavedAt} onCancel={() => setModal(null)} onDone={async r => { await load(); setModal(null); setNotice(r.imported ? `Cliente atualizado. ${r.imported} leads importados do Meta.` : 'Cliente atualizado.') }} />
        </ModalShell>
      )}
      {modal?.kind === 'config' && (
        <ClientConfigModal
          slug={modal.client.slug}
          clientName={modal.client.name}
          onClose={() => setModal(null)}
          onSaved={cfg => {
            setClients(prev => prev.map(cl => cl.slug === modal.client.slug ? { ...cl, active: cfg.active } : cl))
            setNotice(`Configurações de ${modal.client.name} salvas com sucesso.`)
          }}
        />
      )}
      {modal?.kind === 'metrics' && (
        <CardMetricsModal
          client={modal.client} saved={cardMetrics[modal.client.slug]} days={typeof period === 'number' ? period : 7} onClose={() => setModal(null)}
          onSaved={choice => { setCardMetrics(m => { const n = { ...m }; if (choice) n[modal.client.slug] = choice; else delete n[modal.client.slug]; return n }); setModal(null) }}
        />
      )}
      {modal?.kind === 'confirm' && (
        <ModalShell title={modal.action === 'rotate' ? 'Revogar token?' : 'Desativar acesso?'} onClose={() => setModal(null)}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {modal.action === 'rotate'
              ? `O token atual de ${modal.client.name} será revogado e um novo é criado na hora. Quem está logado será desconectado, e o cliente precisará do token novo.`
              : `${modal.client.name} não vai conseguir mais abrir o painel até você gerar um novo token.`}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => runAction(modal.action, modal.client)}>{modal.action === 'rotate' ? 'Revogar e gerar novo' : 'Desativar acesso'}</button>
          </div>
        </ModalShell>
      )}
      {modal?.kind === 'team' && <TeamModal onClose={() => setModal(null)} onToken={(email, token, role) => setModal({ kind: 'member-token', email, token, role })} />}
      {modal?.kind === 'member-token' && <MemberTokenModal email={modal.email} token={modal.token} role={modal.role} onClose={() => setModal(null)} />}
      {modal?.kind === 'code' && (
        <ModalShell title={modal.created ? `Cliente criado: ${modal.client.name}` : `Novo token de ${modal.client.name}`}>
          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>O token não aparece de novo depois de fechar.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-card2)', borderRadius: 'var(--radius)' }}>
            <span style={{ flex: 1, fontSize: 26, fontWeight: 700, letterSpacing: '0.3em', userSelect: 'all', fontVariantNumeric: 'tabular-nums' }}>{modal.code}</span>
            <CopyIconButton value={modal.code} label="Copiar token" />
          </div>
          {([['Painel', clientUrl(modal.client.slug)], ['TV, tela cheia', `${clientUrl(modal.client.slug)}?tv=1`]] as const).map(([label, url]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 92, flexShrink: 0, fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <code style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'all', color: 'var(--text-1)' }}>{url.replace(/^https?:\/\//, '')}</code>
              <CopyIconButton value={url} label={`Copiar endereço: ${label}`} />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setModal(null)}>Concluir</button>
          </div>
        </ModalShell>
      )}
    </main>
  )
}
