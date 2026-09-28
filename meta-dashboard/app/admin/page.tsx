'use client'

import MetaSyncPopover from '@/components/MetaSyncPopover'
import AdminOverview from '@/components/AdminOverview'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, UserPlus, Copy, Check, ExternalLink, Settings2, Pencil, KeyRound, Trash2, Ban, LockOpen, Link2, X, Moon, Sun, Search, GripVertical, Users, RefreshCw, CalendarDays, ChevronDown, TrendingUp, DollarSign, Clock, ArrowRight, Loader2, Webhook, LayoutGrid } from 'lucide-react'
import { Sparkline } from '@/components/Sparkline'
import { STATUS_META } from '@/components/LeadsTab'
import { timeAgo } from '@/lib/leadUtils'
import { fileToLogoDataUrl } from '@/lib/resizeLogo'
import { ALL_KEYS, CARD_METRICS, MAX_CARD_METRICS, cardSource, moveItem, resolveChoice, type CardChoice, type CardPeriod, type MetricKey } from '@/lib/adminCard'
import { ADMIN_PERIODS, parseAdminPeriod, type AdminPeriod, type PeriodDays } from '@/lib/periods'
import { type ResultKind } from '@/lib/resultKind'
import { platformsFor } from '@/lib/platforms'
import { PlatformBadges } from '@/components/PlatformBadges'
import { FilterField, FilterPicker } from '@/components/UsageUi'
import { useTheme } from '@/lib/useTheme'
import { StatusToggle } from '@/components/StatusToggle'
import { ClientConfigModal } from '@/components/ClientConfigModal'
import { ClientIntegrationsTab } from '@/components/ClientIntegrationsTab'
import { StaffShell, STAFF_EVENT, type StaffAction } from '@/components/StaffShell'
import { ProfileMenu } from '@/components/ProfileMenu'
import { PulseLoader } from '@/components/PulseLoader'
import type { LeadStatus } from '@/lib/leadTypes'
import { useAnchoredPopover } from '@/lib/useAnchoredPopover'

interface AdminClient {
  slug: string
  name: string
  logoUrl: string | null
  adAccountId: string | null
  pageId: string | null
  hasCode: boolean
  active?: boolean
  ecommerce?: boolean
  googleAdsCustomerId?: string
  ga4PropertyId?: string
  managerId?: string | null
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
interface MetaOption { id: string; name: string; currency?: string; page?: { id: string; name: string; picture: string | null } | null }

type ManagerTab = 'cadastro' | 'acessos' | 'metas' | 'integracoes'
type Modal =
  | { kind: 'new' }
  | { kind: 'edit'; client: AdminClient }
  | { kind: 'config'; client: AdminClient }
  | { kind: 'code'; client: { slug: string; name: string }; code: string; created: boolean }
  | { kind: 'confirm'; action: 'rotate' | 'revoke'; client: AdminClient }
  | { kind: 'delete'; client: AdminClient }
  | { kind: 'metrics'; client: AdminClient }
  | { kind: 'team' }
  | { kind: 'clients'; select: string | 'new' | 'all' | null; tab?: ManagerTab }
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
  useLockBodyScroll()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!onClose) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const content = (
    <div
      className="overlay"
      onClick={e => {
        if (e.target === e.currentTarget && onClose) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div
        className="card"
        role="dialog"
        aria-label={title}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: 'min(90vh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-elegant)',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h2>
          {onClose && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      </div>
    </div>
  )

  if (!mounted || typeof document === 'undefined') return null
  return createPortal(content, document.body)
}


type TeamRole = 'admin' | 'member' | 'reader' | 'organic'
interface TeamMember { email: string; createdAt: string; lastLoginAt: string | null; role: TeamRole; clients?: string[] }
const ROLE_INFO: Record<TeamRole, { label: string; text: string }> = {
  admin: { label: 'Administrador', text: 'Faz tudo: cria e edita clientes, gera tokens e gerencia a equipe.' },
  member: { label: 'Membro', text: 'Opera o dia a dia: atualiza números, trata leads e personaliza os cards. Não cria nem edita clientes.' },
  reader: { label: 'Leitor', text: 'Só olha: vê os painéis e os números, sem alterar nada.' },
  organic: { label: 'Social Media', text: 'Vê só Orgânico, Público e Report Studio dos clientes que você escolher. Não vê leads, campanhas nem números pagos.' },
}
const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** Mensagem pronta para mandar ao colega por WhatsApp: link, e-mail e token. */
function inviteMessage(email: string, token: string, role: TeamRole): string {
  return `Oi! Segue o seu acesso ao Painel de controle do Grupo Don:\n\nLink: ${window.location.origin}/admin\nE-mail: ${email}\nNível de acesso: ${ROLE_INFO[role].label}\nToken de acesso (é a sua senha): ${token}\n\nÉ só entrar com esse e-mail e colar o token no campo "Senha".`
}

/** Escolha dos clientes que uma pessoa do nível Orgânico pode ver. */
function OrganicClientsModal({ email, initial, onClose, onSave }: { email: string; initial: string[]; onClose: () => void; onSave: (slugs: string[]) => void | Promise<void> }) {
  const [all, setAll] = useState<Array<{ slug: string; name: string }> | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(initial))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api<{ clients: Array<{ slug: string; name: string }> }>('/api/admin/clients/names').then(r => setAll(r.ok ? r.data.clients : [])) }, [])
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const shown = (all ?? []).filter(c => !q.trim() || norm(c.name).includes(norm(q.trim())))
  const flip = (slug: string) => setPicked(p => { const n = new Set(p); if (n.has(slug)) n.delete(slug); else n.add(slug); return n })
  return (
    <ModalShell title="Clientes do Social Media" onClose={onClose} maxWidth={620}>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}><strong style={{ color: 'var(--text-1)' }}>{email}</strong> vai ver só Orgânico, Público e Report Studio destes clientes ({picked.size} escolhido{picked.size === 1 ? '' : 's'}).</p>
      <label className="search" style={{ height: 36 }}>
        <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" autoFocus />
      </label>
      <div className="acc-grid">
        {all === null && <PulseLoader size={28} inline />}
        {shown.map(c => {
          const on = picked.has(c.slug)
          return (
            <button key={c.slug} type="button" role="checkbox" aria-checked={on} onClick={() => flip(c.slug)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-soft)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-input)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{on && <Check size={12} strokeWidth={3} color="#fff" />}</span>
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await onSave([...picked]); setBusy(false) }}>Salvar clientes</button>
      </div>
    </ModalShell>
  )
}

function TeamModal({ onClose, onToken }: { onClose: () => void; onToken: (email: string, token: string, role: TeamRole) => void }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [canManageAdmins, setCanManageAdmins] = useState(false)
  const [role, setRole] = useState<TeamRole>('member')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [addClients, setAddClients] = useState<string[]>([])
  const [picking, setPicking] = useState<null | { email: string; clients: string[]; forNew?: boolean }>(null)

  const load = useCallback(async () => {
    const r = await api<{ members: TeamMember[]; canManageAdmins?: boolean }>('/api/admin/team')
    if (r.ok) { setMembers(r.data.members ?? []); setCanManageAdmins(!!r.data.canManageAdmins) } else setErr(r.data.error ?? 'Não foi possível carregar a equipe.')
  }, [])
  useEffect(() => { load() }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy(true); setErr(null)
    const r = await api<{ email: string; token: string; role: TeamRole }>('/api/admin/team', 'POST', { email, role, ...(role === 'organic' ? { clients: addClients } : {}) })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível adicionar.')
    onToken(r.data.email, r.data.token, r.data.role)
  }
  async function regenerate(m: TeamMember) {
    setBusy(true); setErr(null)
    const r = await api<{ token: string }>('/api/admin/team', 'PUT', { email: m.email })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível gerar a senha.')
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
    <ModalShell title="Equipe" onClose={onClose} maxWidth={780}>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
        Cada pessoa entra só com o e-mail cadastrado aqui e o token que você gerar, que funciona como senha. Escolha o nível de acesso dela.
      </p>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          id="team-email"
          type="email"
          className="field"
          style={{ flex: '1 1 240px', minWidth: 0 }}
          placeholder="email@colega.com"
          aria-label="E-mail do colega"
          autoComplete="off"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <select
          id="team-role"
          className="field"
          style={{ flex: '0 0 auto', width: 'auto' }}
          aria-label="Nível de acesso"
          value={role}
          onChange={e => setRole(e.target.value as TeamRole)}
        >
          {(Object.keys(ROLE_INFO) as TeamRole[]).map(r => (
            <option key={r} value={r} disabled={r === 'admin' && !canManageAdmins}>
              {ROLE_INFO[r].label}
            </option>
          ))}
        </select>
        {role === 'organic' && <button type="button" className="btn btn-outline" onClick={() => setPicking({ email: email || 'Novo acesso', clients: addClients, forNew: true })}>Clientes ({addClients.length})</button>}
        <button className="btn btn-primary" disabled={busy || !email.trim() || (role === 'organic' && addClients.length === 0)}>Adicionar</button>
      </form>
      <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: -6 }}>{ROLE_INFO[role].text}</p>
      {err && <p role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
          Membros da equipe ({members?.length ?? 0})
        </div>
        {members === null && !err && <PulseLoader size={32} inline />}
        {members?.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-2)', padding: '12px 0' }}>Ninguém na equipe ainda.</p>}
        {members && members.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 12,
              maxHeight: 'min(50vh, 420px)',
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {members.map(m => (
              <div
                key={m.email}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'var(--bg-card2, rgba(0,0,0,0.03))',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.email}>
                    {m.email}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {m.lastLoginAt ? `Último acesso em ${fmtShort(m.lastLoginAt)}` : 'Ainda não entrou'} · Criado em {fmtShort(m.createdAt)}
                  </div>
                  {m.role === 'organic' && (
                    <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8, height: 28, fontSize: 12 }} onClick={() => setPicking({ email: m.email, clients: m.clients ?? [] })}>{(m.clients?.length ?? 0) === 0 ? 'Escolher clientes' : `${m.clients!.length} cliente${m.clients!.length === 1 ? '' : 's'} · alterar`}</button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
                  <select
                    className="field"
                    style={{ width: 'auto', height: 30, fontSize: 12, padding: '0 8px', flex: 1, minWidth: 0 }}
                    aria-label={`Nível de ${m.email}`}
                    value={m.role}
                    disabled={busy || (m.role === 'admin' && !canManageAdmins)}
                    onChange={e => changeRole(m, e.target.value as TeamRole)}
                  >
                    {(Object.keys(ROLE_INFO) as TeamRole[]).map(r => (
                      <option key={r} value={r} disabled={r === 'admin' && !canManageAdmins}>
                        {ROLE_INFO[r].label}
                      </option>
                    ))}
                  </select>

                  {confirm === m.email ? (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-outline btn-sm" style={{ height: 30, padding: '0 8px', fontSize: 11 }} onClick={() => setConfirm(null)}>
                        Cancelar
                      </button>
                      <button className="btn btn-primary btn-sm" style={{ height: 30, padding: '0 8px', fontSize: 11 }} disabled={busy} onClick={() => remove(m)}>
                        Confirmar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ height: 30, width: 30 }}
                        disabled={busy}
                        onClick={() => regenerate(m)}
                        aria-label={`Gerar novo token para ${m.email}`}
                        title="Gerar novo token"
                      >
                        <KeyRound size={15} strokeWidth={1.75} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ height: 30, width: 30 }}
                        disabled={busy}
                        onClick={() => setConfirm(m.email)}
                        aria-label={`Remover ${m.email}`}
                        title="Remover da equipe"
                      >
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {picking && (
        <OrganicClientsModal email={picking.email} initial={picking.clients} onClose={() => setPicking(null)}
          onSave={async slugs => {
            if (picking.forNew) { setAddClients(slugs); setPicking(null); return }
            const r = await api('/api/admin/team', 'PATCH', { email: picking.email, clients: slugs })
            if (!r.ok) { setErr(r.data.error ?? 'Não foi possível salvar os clientes.'); return }
            setPicking(null); await load()
          }} />
      )}
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


/** Mensagem pronta para mandar ao cliente: nome do negócio, link, e-mail e token. */
function clientInviteMessage(business: string, url: string, email: string, token: string): string {
  return `Oi! Segue o seu acesso ao painel de resultados da ${business}:\n\nLink: ${url}\nE-mail: ${email}\nSenha: ${token}\n\nÉ só entrar com esse e-mail e essa senha.`
}

interface AccessEntry { email: string; createdAt: string; lastLoginAt: string | null }

/** Quem pode entrar no painel do cliente: e-mails cadastrados pela agência, cada um com a sua senha. */
function AccessPanel({ client, canManage, urlFor }: { client: AdminClient; canManage: boolean; urlFor: (slug: string) => string }) {
  const slug = client.slug
  const [list, setList] = useState<AccessEntry[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ email: string; token: string; business: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!slug) return
    setList(null)
    const r = await api<{ emails: AccessEntry[] }>(`/api/admin/clients/${slug}/access`)
    setList(r.ok ? r.data.emails : [])
  }, [slug])
  useEffect(() => { void load(); setIssued(null); setErr(null); setEmail(''); setConfirm(null) }, [load])

  async function issue(target: string) {
    setBusy(true); setErr(null)
    const r = await api<{ token: string; business: string }>(`/api/admin/clients/${slug}/access`, 'POST', { email: target })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível gerar a senha.')
    setIssued({ email: target.trim().toLowerCase(), token: r.data.token, business: r.data.business })
    setEmail('')
    void load()
  }
  async function remove(target: string) {
    setBusy(true); setErr(null)
    const r = await api(`/api/admin/clients/${slug}/access?email=${encodeURIComponent(target)}`, 'DELETE')
    setBusy(false); setConfirm(null)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível remover.')
    if (issued?.email === target) setIssued(null)
    void load()
  }
  const message = issued ? clientInviteMessage(issued.business, urlFor(slug), issued.email, issued.token) : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {issued && (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1.5px solid var(--accent)' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Acesso criado</div>
          {([['Link', urlFor(slug), false], ['E-mail', issued.email, false], ['Senha', issued.token, true]] as const).map(([label, value, big]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-card2)', borderRadius: 'var(--radius)' }}>
              <span style={{ width: 56, flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>{label}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: big ? 20 : 14, fontWeight: big ? 700 : 500, letterSpacing: big ? '0.12em' : undefined, userSelect: 'all', overflowWrap: 'anywhere' }}>{value}</span>
              <CopyIconButton value={value} label={`Copiar ${label.toLowerCase()}`} />
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>A senha só aparece agora. Depois, só dá para gerar outra.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { } }}>
              {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />} {copied ? 'Mensagem copiada' : 'Copiar mensagem pronta'}
            </button>
            <button className="btn btn-outline" onClick={() => setIssued(null)}>Fechar</button>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 8 }}>E-mails com acesso{list ? ` · ${list.length}` : ''}</div>
        {list === null ? <PulseLoader size={32} inline /> : list.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>Hoje entra pelo código de 6 dígitos. Ao cadastrar o primeiro e-mail, o código deixa de valer e o acesso passa a ser por e-mail e senha.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {list.map(a => (
              <li key={a.email} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{a.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.lastLoginAt ? `Último acesso ${new Date(a.lastLoginAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Ainda não entrou'}</div>
                </div>
                {canManage && (confirm === a.email
                  ? <><button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => remove(a.email)} disabled={busy}>Remover acesso</button><button className="btn btn-outline btn-sm" onClick={() => setConfirm(null)}>Cancelar</button></>
                  : <><button className="btn btn-outline btn-sm" onClick={() => issue(a.email)} disabled={busy} title="A senha não fica salva. Gera outra e a atual deixa de valer"><KeyRound size={14} strokeWidth={1.75} /> Nova senha</button><button className="btn btn-outline btn-icon btn-sm" onClick={() => setConfirm(a.email)} aria-label={`Remover ${a.email}`} title="Remover"><Trash2 size={14} strokeWidth={1.75} /></button></>)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <form onSubmit={e => { e.preventDefault(); if (email.trim()) void issue(email) }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="field" type="email" style={{ flex: '1 1 240px' }} placeholder="E-mail de quem vai entrar" value={email} onChange={e => setEmail(e.target.value)} aria-label="E-mail do cliente" />
          <button className="btn btn-primary" type="submit" disabled={busy || !email.trim() || !slug}>{busy ? 'Gerando…' : 'Cadastrar e gerar senha'}</button>
        </form>
      )}
      {err && <p role="alert" style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{err}</p>}
    </div>
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

/** Gestão de clientes: cadastro, acessos (e-mail e token) e metas num lugar só, com a lista de clientes ao lado. */
function ClientsManager({ clients, initial, initialTab, canManage, baseDomain, accounts, accountsError, accountsSavedAt, urlFor, onReload, onOpenPanel, onNotice, onConfigSaved, onClose }: {
  clients: AdminClient[]; initial: string | 'new' | 'all' | null; initialTab?: ManagerTab; canManage: boolean; baseDomain: string | null
  accounts: MetaOption[]; accountsError: string | null; accountsSavedAt: number | null; urlFor: (slug: string) => string
  onReload: () => Promise<void>; onOpenPanel: (slug: string) => void; onNotice: (t: string) => void; onConfigSaved: (slug: string, active: boolean | undefined) => void; onClose: () => void
}) {
  const [selected, setSelected] = useState<string | 'new' | 'all' | null>(initial ?? clients[0]?.slug ?? null)
  const [tab, setTab] = useState<ManagerTab>(initialTab ?? 'cadastro')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const client = selected && selected !== 'new' && selected !== 'all' ? clients.find(c => c.slug === selected) ?? null : null

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const q = query.trim().toLowerCase()
  const list = clients.filter(c => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q))
  const status = (c: AdminClient) => (c.locked ? { text: 'Bloqueado', dot: 'var(--red)' } : c.active === false ? { text: 'Pausado', dot: 'var(--amber)' } : { text: 'Ativo', dot: 'var(--green)' })
  const pick = (slug: string | 'new' | 'all') => { setSelected(slug); setTab(slug === 'new' ? 'cadastro' : tab) }
  const TABS: Array<[ManagerTab, string]> = [['cadastro', 'Cadastro'], ['acessos', 'Acessos'], ['metas', 'Metas e status'], ['integracoes', 'Integrações']]
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useLockBodyScroll()
  const [deleting, setDeleting] = useState<AdminClient | null>(null)

  const content = (
    <div role="dialog" aria-modal="true" aria-label="Clientes" className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={onClose}><ArrowLeft size={16} strokeWidth={1.75} /> Voltar</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Clientes</h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Cadastro, acessos e metas de cada cliente</p>
        </div>
        <button className="btn btn-outline btn-icon btn-sm" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><X size={16} strokeWidth={1.75} /></button>
      </header>

      <div className="cm-body">
        <aside className="cm-aside">
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="search" style={{ height: 36 }}>
              <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{list.length} de {clients.length} cliente{clients.length !== 1 ? 's' : ''}</div>
              <button
                type="button"
                onClick={() => setSelected('all')}
                style={{
                  background: selected === 'all' ? 'var(--accent-soft)' : 'none',
                  border: 'none',
                  color: selected === 'all' ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 8px',
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <LayoutGrid size={13} />
                <span>Ver todos</span>
              </button>
            </div>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 8px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {list.map(c => {
              const st = status(c)
              return (
                <li key={c.slug}>
                  <button type="button" onClick={() => pick(c.slug)} aria-current={selected === c.slug} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: 'none', borderRadius: 12, background: selected === c.slug ? 'var(--accent-soft)' : 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-1)' }}>
                    <Avatar name={c.name} logoUrl={c.logoUrl} size={34} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-3)' }}><i style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.text}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            {!list.length && <li style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>Nenhum cliente encontrado.</li>}
          </ul>
          {canManage && <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}><button className="btn btn-primary" style={{ width: '100%' }} onClick={() => pick('new')}><UserPlus size={16} strokeWidth={1.75} /> Novo cliente</button></div>}
        </aside>

        <section className="cm-main">
          <div style={{ maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {selected === 'all' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Todos os Clientes</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0 0' }}>
                    Visão geral dos {clients.length} clientes cadastrados na agência
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                  <div className="card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>Total</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', marginTop: 2 }}>{clients.length}</div>
                  </div>
                  <div className="card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>Ativos</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', marginTop: 2 }}>{clients.filter(c => c.active !== false && !c.locked).length}</div>
                  </div>
                  <div className="card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>Pausados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)', marginTop: 2 }}>{clients.filter(c => c.active === false && !c.locked).length}</div>
                  </div>
                  <div className="card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase' }}>Bloqueados</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)', marginTop: 2 }}>{clients.filter(c => c.locked).length}</div>
                  </div>
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Cliente</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Status</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Conta Meta</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)' }}>Plataformas</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-2)' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(c => {
                          const st = status(c)
                          const platforms = platformsFor({
                            adAccountId: c.adAccountId,
                            google: !!c.googleAdsCustomerId,
                            ecommerce: !!c.ecommerce,
                          })
                          return (
                            <tr key={c.slug} style={{ borderTop: '1px solid var(--border-soft)' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <Avatar name={c.name} logoUrl={c.logoUrl} size={32} />
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{c.name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.slug}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>
                                  <i style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />
                                  {st.text}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: 'var(--text-2)', fontSize: 12, fontFamily: 'monospace' }}>
                                {c.adAccountId || '—'}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <PlatformBadges platforms={platforms} height={14} />
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-xs"
                                    onClick={() => setSelected(c.slug)}
                                  >
                                    Gerenciar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-xs"
                                    onClick={() => onOpenPanel(c.slug)}
                                    title="Abrir painel"
                                  >
                                    <ExternalLink size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {selected === 'new' && (
              <>
                <div><h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Novo cliente</h2><p style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0 0' }}>Depois de salvar, você cadastra o e-mail de quem vai entrar e gera o token.</p></div>
                <div className="card" style={{ padding: 20 }}>
                  <ClientForm baseDomain={baseDomain} accounts={accounts} accountsError={accountsError} accountsSavedAt={accountsSavedAt} onCancel={() => setSelected(clients[0]?.slug ?? null)}
                    onDone={async r => { await onReload(); setSelected(r.slug); setTab('acessos'); onNotice(r.imported ? `${r.name} criado. ${r.imported} leads importados do Meta.` : `${r.name} criado. Cadastre o e-mail de quem vai entrar.`) }} />
                </div>
              </>
            )}

            {client && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <Avatar name={client.name} logoUrl={client.logoUrl} size={52} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{client.name}</h2>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', overflowWrap: 'anywhere' }}>{urlFor(client.slug)}</div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(urlFor(client.slug)); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { } }}>{copied ? <Check size={14} strokeWidth={1.75} /> : <Link2 size={14} strokeWidth={1.75} />} {copied ? 'Link copiado' : 'Copiar link'}</button>
                  <button className="btn btn-outline btn-sm" onClick={() => onOpenPanel(client.slug)}><ExternalLink size={14} strokeWidth={1.75} /> Abrir painel</button>
                </div>

                <div role="group" aria-label="Seções do cliente" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  {TABS.map(([k, l]) => <button key={k} className="pill-btn" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
                </div>

                {tab === 'cadastro' && (canManage
                  ? <div className="card" style={{ padding: 20 }}><ClientForm key={client.slug} initial={client} baseDomain={baseDomain} accounts={accounts} accountsError={accountsError} accountsSavedAt={accountsSavedAt} onCancel={() => setTab('acessos')} onDelete={() => setDeleting(client)} onDone={async r => { await onReload(); onNotice(r.imported ? `Cliente atualizado. ${r.imported} leads importados do Meta.` : 'Cliente atualizado.') }} /></div>
                  : <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Só administradores editam o cadastro.</p>)}
                {tab === 'acessos' && <div className="card" style={{ padding: 20 }}><AccessPanel key={client.slug} client={client} canManage={canManage} urlFor={urlFor} /></div>}
                {tab === 'metas' && <div className="card" style={{ padding: 20 }}><ClientConfigModal key={client.slug} embedded slug={client.slug} clientName={client.name} onClose={() => { }} onSaved={cfg => { onConfigSaved(client.slug, cfg.active); onNotice(`Configurações de ${client.name} salvas.`) }} /></div>}
                {tab === 'integracoes' && <div className="card" style={{ padding: 20 }}><ClientIntegrationsTab key={client.slug} slug={client.slug} clientName={client.name} baseDomain={baseDomain} onNotice={onNotice} /></div>}
              </>
            )}

            {!selected && <div style={{ padding: '60px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>{canManage ? 'Escolha um cliente na lista ou crie um novo.' : 'Escolha um cliente na lista.'}</div>}
          </div>
        </section>
      </div>
      {deleting && <DeleteClientModal client={deleting} onClose={() => setDeleting(null)} onDeleted={async () => { const name = deleting.name; setDeleting(null); setSelected(clients.find(c => c.slug !== deleting.slug)?.slug ?? null); await onReload(); onNotice(`Cliente ${name} excluído.`) }} />}
    </div>
  )

  if (!mounted || typeof document === 'undefined') return null
  return createPortal(content, document.body)
}


type MenuItem = { icon: React.ReactNode; text: string; onClick: () => void; danger?: boolean } | 'sep'

/** Um botão só com o período escolhido; abre a lista. Evita uma fila de botões no topo. */
function PeriodMenu({ value, onChange }: { value: AdminPeriod; onChange: (p: AdminPeriod) => void }) {
  const { pos, close, toggle, menuRef } = useAnchoredPopover()
  const current = ADMIN_PERIODS.find(p => p.v === value) ?? ADMIN_PERIODS[1]
  return (
    <>
      <button className="btn btn-outline btn-sm" aria-haspopup="listbox" aria-expanded={!!pos} aria-label={`Período: ${current.label}`}
        onClick={toggle}>
        <CalendarDays size={16} strokeWidth={1.75} /> {current.label} <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={close} />
          <div ref={menuRef} className="popover" role="listbox" aria-label="Período" style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 160 }}>
            {ADMIN_PERIODS.map(p => (
              <div key={String(p.v)} role="option" aria-selected={p.v === value} tabIndex={0} className="popover-item" style={p.v === value ? { background: 'var(--accent-soft)' } : undefined}
                onClick={() => { close(); onChange(p.v) }}
                onKeyDown={e => { if (e.key === 'Enter') { close(); onChange(p.v) } }}>
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
  const { pos, close, toggle, menuRef } = useAnchoredPopover()
  return (
    <>
      <button className="btn btn-outline btn-icon btn-sm" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} title="Mais opções"
        onClick={toggle}>
        <Settings2 size={16} strokeWidth={1.75} />
      </button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={close} />
          <div ref={menuRef} className="popover" role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 224 }}>
            {items.map((it, i) => it === 'sep' ? (
              <div key={i} style={{ height: 1, background: 'var(--border-soft)', margin: '4px 0' }} />
            ) : (
              <div key={i} role="menuitem" tabIndex={0} className="popover-item" style={{ color: it.danger ? 'var(--red)' : undefined }}
                onClick={() => { close(); it.onClick() }}
                onKeyDown={e => { if (e.key === 'Enter') { close(); it.onClick() } }}>
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

/** Trava a rolagem da página que está atrás de uma janela em tela cheia (senão aparece uma segunda barra de rolagem que não faz nada). */
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow
    const gap = window.innerWidth - document.documentElement.clientWidth
    const padPrev = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px` // a página não "pula" quando a barra some
    return () => { document.body.style.overflow = prev; document.body.style.paddingRight = padPrev }
  }, [])
}

/** Foto da página do Facebook ligada à conta; sem foto (ou se falhar carregar) mostra as iniciais. */
function PageImage({ page, size = 40, square }: { page: MetaOption['page']; size?: number; square?: boolean }) {
  const [broken, setBroken] = useState(false)
  if (page?.picture && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={page.picture} alt="" title={page.name} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: square ? 8 : '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--bg-card2)' }} />
  }
  return <span aria-hidden="true" title={page?.name} style={{ width: size, height: size, borderRadius: square ? 8 : '50%', background: 'var(--bg-card2)', color: 'var(--text-2)', display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.36), fontWeight: 700, flexShrink: 0 }}>{page?.name ? page.name.slice(0, 1).toUpperCase() : '—'}</span>
}

/** "Selecionar conta": abre uma janela com as contas de anúncios em duas colunas: caixinha, foto da página, nome e o número embaixo. */
function AccountPicker({ accounts, value, onPick }: { accounts: MetaOption[]; value: string; onPick: (a: MetaOption | null) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(value)
  const picked = accounts.find(a => a.id === value) ?? null
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const shown = accounts.filter(a => !q.trim() || norm(`${a.name} ${a.id} ${a.page?.name ?? ''}`).includes(norm(q.trim())))
  const confirm = () => { onPick(accounts.find(a => a.id === sel) ?? null); setOpen(false) }
  return (
    <>
      <button type="button" id="c-acc" className="btn btn-outline" onClick={() => { setQ(''); setSel(value); setOpen(true) }} aria-haspopup="dialog"
        style={{ width: '100%', justifyContent: 'flex-start', gap: 12, height: picked ? 56 : 40, textAlign: 'left' }}>
        {picked && <PageImage page={picked.page} size={32} />}
        <span style={{ flex: 1, minWidth: 0 }}>
          {picked
            ? <><span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked.name}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', fontWeight: 400 }}>{picked.id}</span></>
            : value ? <span style={{ fontSize: 14 }}>{value}</span> : <span style={{ color: 'var(--text-2)' }}>Selecionar conta</span>}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>{picked || value ? 'Trocar' : ''}</span>
      </button>
      {open && (
        <ModalShell title="Selecionar conta de anúncios" onClose={() => setOpen(false)} maxWidth={780}>
          <label className="search" style={{ height: 36 }}>
            <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, número ou página" aria-label="Buscar conta" />
          </label>
          <div role="listbox" aria-label="Contas de anúncios" className="acc-grid">
            {shown.map(a => {
              const on = a.id === sel
              return (
                <button key={a.id} type="button" role="option" aria-selected={on} onClick={() => setSel(on ? '' : a.id)} onDoubleClick={() => { onPick(a); setOpen(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-soft)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                  <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-input)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{on && <Check size={12} strokeWidth={3} color="#fff" />}</span>
                  <PageImage page={a.page} size={36} square />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{a.id}</span>
                  </span>
                </button>
              )
            })}
            {shown.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-2)', padding: 12, margin: 0, gridColumn: '1 / -1' }}>Nenhuma conta encontrada.</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            {value && <button type="button" className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }} onClick={() => { onPick(null); setOpen(false) }}>Limpar seleção</button>}
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Voltar</button>
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={!sel || sel === value}>Continuar</button>
          </div>
        </ModalShell>
      )}
    </>
  )
}

/** Exclusão de cliente: irreversível, então pede para digitar o nome. */
function DeleteClientModal({ client, onClose, onDeleted }: { client: { slug: string; name: string }; onClose: () => void; onDeleted: () => void | Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const ok = norm(text) === norm(client.name)
  async function go() {
    setBusy(true); setErr(null)
    const r = await api(`/api/admin/clients/${client.slug}`, 'DELETE', { confirm: text })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível excluir.')
    await onDeleted()
  }
  return (
    <ModalShell title="Excluir cliente" onClose={onClose}>
      <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>Você vai excluir <strong>{client.name}</strong> e tudo que é dele: leads, pedidos, dados da Meta, configurações, relatórios e acessos. <strong>Não tem como desfazer.</strong></p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>Digite o nome do cliente para confirmar
        <input className="field" value={text} onChange={e => setText(e.target.value)} placeholder={client.name} autoComplete="off" autoFocus />
      </label>
      {err && <p role="alert" style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
        <button className="btn" style={{ background: 'var(--red)', color: '#fff' }} disabled={!ok || busy} onClick={go}>{busy ? 'Excluindo…' : 'Excluir definitivamente'}</button>
      </div>
    </ModalShell>
  )
}

function ClientForm({ initial, baseDomain, accounts, accountsError, accountsSavedAt, onDone, onCancel, onDelete }: {
  initial?: AdminClient
  baseDomain: string | null
  accounts: MetaOption[]
  accountsError?: string | null
  accountsSavedAt?: number | null
  onDone: (r: { slug: string; name: string; code?: string; imported?: number | null }) => void
  onCancel: () => void
  /** só na edição de quem pode excluir */
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!!initial)
  const [adAccountId, setAdAccountId] = useState(initial?.adAccountId ?? '')
  const [pageId, setPageId] = useState(initial?.pageId ?? '')
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '')
  const [logoError, setLogoError] = useState<string | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Gestor responsável (obrigatório quando já existem gestores cadastrados)
  const [managers, setManagers] = useState<{ ready: boolean; list: Array<{ id: string; name: string }> } | null>(null)
  const [managerId, setManagerId] = useState('')
  useEffect(() => {
    let alive = true
    api<{ ready: boolean; managers: Array<{ id: string; name: string }>; byClient: Record<string, string> }>('/api/admin/managers/options').then(r => {
      if (!alive || !r.ok) return
      setManagers({ ready: r.data.ready, list: r.data.managers })
      if (initial?.slug && r.data.byClient[initial.slug]) setManagerId(r.data.byClient[initial.slug])
    })
    return () => { alive = false }
  }, [initial?.slug])
  const needsManager = !!managers?.ready && managers.list.length > 0

  // Status Ativo/Pausado da conta
  const [active, setActive] = useState<boolean>(initial?.active !== false)
  // "Tem e-commerce?": libera a aba E-commerce e a integração com a loja para este cliente
  const [ecommerce, setEcommerce] = useState<boolean>(initial?.ecommerce === true)
  const [googleId, setGoogleId] = useState(initial?.googleAdsCustomerId ?? '')
  const [ga4Id, setGa4Id] = useState(initial?.ga4PropertyId ?? '')
  const [ga4Email, setGa4Email] = useState<string | null>(null)
  const [ga4Test, setGa4Test] = useState<{ ok: boolean; message: string } | null>(null)
  const [ga4Busy, setGa4Busy] = useState(false)
  useEffect(() => { void api<{ serviceEmail: string | null }>('/api/admin/ga4').then(r => { if (r.ok) setGa4Email(r.data.serviceEmail) }) }, [])

  useEffect(() => {
    if (!initial?.slug) return
    let alive = true
    fetch(`/api/admin/clients/${initial.slug}/config`)
      .then(r => r.ok ? r.json() : null)
      .then((cfg: { active?: boolean; ecommerce?: boolean; googleAdsCustomerId?: string; ga4PropertyId?: string; integrations?: Record<string, unknown> } | null) => {
        if (!alive || !cfg) return
        if (cfg.active !== undefined) setActive(cfg.active !== false)
        if (typeof cfg.ecommerce === 'boolean') setEcommerce(cfg.ecommerce)
        if (typeof cfg.googleAdsCustomerId === 'string') setGoogleId(cfg.googleAdsCustomerId)
        if (typeof cfg.ga4PropertyId === 'string') setGa4Id(cfg.ga4PropertyId)
      })
      .catch(() => { })
    return () => { alive = false }
  }, [initial?.slug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    if (needsManager && !managerId) { setSaving(false); setError('Selecione o gestor responsável.'); return }
    const payload = { name, slug, adAccountId, pageId, logoUrl, ...(needsManager || managerId ? { managerId: managerId || null } : {}) }
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
    const cr = await api(`/api/admin/clients/${savedSlug}/config`, 'POST', { active, ecommerce, googleAdsCustomerId: googleId, ga4PropertyId: ga4Id }).catch(() => null)
    if (cr && !cr.ok) { setSaving(false); setError(cr.data.error ?? 'Não foi possível salvar o Google Ads.'); return }

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

      <div
        style={{
          padding: '12px 16px',
          borderRadius: 14,
          background: 'var(--bg-card2)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Tem e-commerce?</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {ecommerce ? 'Libera a aba E-commerce, o Live View e a integração com a loja para este cliente.' : 'Sem loja virtual: a aba E-commerce fica escondida.'}
          </div>
        </div>
        <StatusToggle checked={ecommerce} onChange={setEcommerce} />
      </div>

      <div>
        <label htmlFor="c-google" style={labelStyle}>Conta do Google Ads (opcional)</label>
        <input id="c-google" className="field" value={googleId} onChange={e => setGoogleId(e.target.value)} placeholder="123-456-7890" inputMode="numeric" autoComplete="off" />
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>ID de 10 dígitos da conta de anúncios (dentro da conta gerente). Libera a aba Google Ads.</div>
      </div>

      <div>
        <label htmlFor="c-ga4" style={labelStyle}>Google Analytics 4 (opcional)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="c-ga4" className="field" value={ga4Id} onChange={e => { setGa4Id(e.target.value); setGa4Test(null) }} placeholder="ID da propriedade (só números)" inputMode="numeric" autoComplete="off" style={{ flex: 1 }} />
          <button type="button" className="btn btn-outline" disabled={!ga4Id.trim() || ga4Busy} onClick={async () => { setGa4Busy(true); const r = await api<{ ok: boolean; message: string }>('/api/admin/ga4', 'POST', { propertyId: ga4Id }); setGa4Busy(false); setGa4Test({ ok: !!r.data.ok, message: r.data.message ?? 'Não foi possível testar.' }) }}>{ga4Busy ? 'Testando…' : 'Testar'}</button>
        </div>
        <div style={{ fontSize: 11, color: ga4Test ? (ga4Test.ok ? 'var(--green)' : 'var(--red)') : 'var(--text-3)', marginTop: 4 }}>
          {ga4Test ? ga4Test.message : ga4Email ? <>No GA4 do cliente: Admin → Acesso à propriedade → adicione <strong>{ga4Email}</strong> como Leitor. Libera a aba Site.</> : 'Libera a aba Site. A conta de serviço ainda não está configurada no app.'}
        </div>
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

      {managers?.ready && (
        <div>
          <label htmlFor="c-mgr" style={labelStyle}>Gestor responsável{needsManager ? '' : ' (opcional)'}</label>
          {managers.list.length > 0
            ? <select id="c-mgr" className="field" value={managerId} onChange={e => setManagerId(e.target.value)} required={needsManager}>
              <option value="">Selecione…</option>
              {managers.list.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            : <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>Nenhum gestor cadastrado ainda. Cadastre em Performance para escolher o responsável.</p>}
        </div>
      )}

      <div>
        <label htmlFor="c-acc" style={labelStyle}>Conta de anúncios do Meta</label>
        {accounts.length > 0 ? (
          <AccountPicker accounts={accounts} value={adAccountId} onPick={a => { setAdAccountId(a?.id ?? ''); if (a?.page?.id) setPageId(a.page.id) }} />
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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
        {onDelete && <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={onDelete}><Trash2 size={14} strokeWidth={1.75} /> Excluir cliente</button>}
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
  const [mgrFilter, setMgrFilter] = useState('')
  const [managerList, setManagerList] = useState<Array<{ id: string; name: string }>>([])
  const [scopeInfo, setScopeInfo] = useState<{ mode: 'mine' | 'all'; canToggle: boolean; restricted: boolean; manager: { id: string; name: string } | null } | null>(null)
  async function setScope(mode: 'mine' | 'all') {
    const r = await api('/api/admin/scope', 'POST', { mode })
    if (r.ok) await load()
    else setNotice(r.data.error ?? 'Não foi possível trocar a visão.')
  }
  const [baseDomain, setBaseDomain] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<MetaOption[]>([])
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [accountsSavedAt, setAccountsSavedAt] = useState<number | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [syncSignal, setSyncSignal] = useState(0)
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
  const [filter, setFilter] = useState<'todos' | 'ativos' | 'pausados' | 'bloqueados'>('todos')
  const [openingSlug, setOpeningSlug] = useState<string | null>(null)

  useEffect(() => { document.title = 'Painel · Grupo Don' }, [])

  const load = useCallback(async () => {
    const start = Date.now()
    const r = await api<{ scope?: { mode: 'mine' | 'all'; canToggle: boolean; restricted: boolean; manager: { id: string; name: string } | null }; clients: AdminClient[]; recent: RecentLead[]; managers?: Array<{ id: string; name: string }>; keyStatus?: string; baseDomain?: string | null; brandLogoUrl?: string | null; cardMetrics?: Record<string, unknown> }>(`/api/admin/clients?period=${period}`)
    if (r.status === 404) return setPhase('off')
    if (r.status === 401) return setPhase('login')
    if (r.status === 403) { window.location.replace('/admin/organico'); return } // nível Orgânico: não tem painel de clientes, vai para a lista dele
    const elapsed = Date.now() - start
    const wait = Math.max(0, 750 - elapsed)
    if (wait > 0) await new Promise(res => setTimeout(res, wait))
    if (r.ok) {
      setScopeInfo(r.data.scope ?? null); setManagerList(r.data.managers ?? []); setClients(r.data.clients); setBrandLogo(r.data.brandLogoUrl ?? null); setCardMetrics(r.data.cardMetrics ?? {}); setRecent(r.data.recent ?? []); setKeyStatus(r.data.keyStatus ?? 'service'); setBaseDomain(r.data.baseDomain ?? null); setPhase('ready')
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

  async function openPanel(slug: string) {
    setOpeningSlug(slug)
    const r = await api('/api/admin/view', 'POST', { slug })
    if (r.ok) window.location.assign(`/dashboard/${slug}`)
    else {
      setOpeningSlug(null)
      setNotice(r.data.error ?? 'Não foi possível abrir o painel.')
    }
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

  const stats = useMemo(() => {
    const activeCount = clients.filter(c => c.active !== false && !c.locked).length
    const pausedCount = clients.filter(c => c.active === false && !c.locked).length
    return {
      total: clients.length,
      activeCount,
      pausedCount,
      leadsP: clients.reduce((s, c) => s + (isResultsView(c) ? c.periods[period].results : c.periods[period].crmLeads), 0),
      leadsToday: clients.reduce((s, c) => s + c.leadsToday, 0),
      vendasP: clients.reduce((s, c) => s + c.periods[period].vendas, 0),
      receitaP: clients.reduce((s, c) => s + c.periods[period].receita, 0),
      parados: clients.reduce((s, c) => s + c.parados, 0),
    }
  }, [clients, period])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients.filter(c =>
      (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q)) &&
      (!mgrFilter || (mgrFilter === '_none' ? !c.managerId : c.managerId === mgrFilter)) &&
      (filter === 'todos' ||
        (filter === 'ativos' && c.active !== false && !c.locked) ||
        (filter === 'pausados' && c.active === false && !c.locked) ||
        (filter === 'bloqueados' && c.locked)))
  }, [clients, query, filter, mgrFilter])

  // A sidebar pede ações (novo cliente, equipe, sincronização, Report Studio); também vale o ?open= quando vem de outra tela.
  useEffect(() => {
    const run = (a: StaffAction) => {
      if (a === 'new' && canManage) setModal({ kind: 'clients', select: 'new' })
      else if (a === 'clients') setModal({ kind: 'clients', select: null })
      else if (a === 'team' && canManage) setModal({ kind: 'team' })
      else if (a === 'sync') setSyncSignal(n => n + 1)
      else if (a === 'access') setModal({ kind: 'clients', select: null, tab: 'acessos' })
      else if (a === 'integracoes') setModal({ kind: 'clients', select: null, tab: 'integracoes' })
    }
    const onEvent = (e: Event) => run((e as CustomEvent<StaffAction>).detail)
    window.addEventListener(STAFF_EVENT, onEvent)
    const q = new URLSearchParams(window.location.search).get('open') as StaffAction | null
    if (q && phase === 'ready') run(q)
    return () => window.removeEventListener(STAFF_EVENT, onEvent)
  }, [canManage, phase])

  // Mantém a tela reconhecível na URL enquanto a "página" (Clientes/Equipe) é, por dentro, um popup:
  // assim um F5 no meio de um cadastro reabre o mesmo popup em vez de cair de volta no Painel.
  useEffect(() => {
    if (phase !== 'ready') return
    const open = modal?.kind === 'clients' ? 'clients' : modal?.kind === 'team' ? 'team' : null
    window.history.replaceState(null, '', open ? `/admin?open=${open}` : '/admin')
  }, [modal, phase])

  const themeButton = (
    <button className="btn btn-outline btn-icon btn-sm" onClick={toggle} aria-label="Alternar tema" title="Alternar tema">
      {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
    </button>
  )

  if (phase === 'loading') return <PulseLoader fullscreen size={72} />

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
        padding: '32px 16px',
        position: 'relative',
        background: 'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99, 102, 241, 0.12), transparent 70%), var(--bg)',
      }}
    >
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="btn btn-outline btn-icon btn-sm"
        style={{ position: 'absolute', top: 20, right: 20, borderRadius: 10 }}
        aria-label="Alternar tema"
        title="Alternar tema"
      >
        {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
      </button>

      {/* Main Container */}
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        {/* Top Grupo Don Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <img
            src={theme === 'dark' ? '/logo-grupo-don-white.png' : '/logo-grupo-don-dark.png'}
            srcSet={theme === 'dark' ? '/logo-grupo-don-white.png 1x, /logo-grupo-don@2x.png 2x' : '/logo-grupo-don-dark.png 1x, /logo-grupo-don-dark@2x.png 2x'}
            alt="Grupo Don"
            style={{ height: 28, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Card de Login */}
        <form
          onSubmit={login}
          className="card"
          style={{
            width: '100%',
            padding: '32px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            background: 'var(--bg-card)',
            borderRadius: 20,
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-elegant)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Header Info - Clean title without shield */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-1)', margin: 0 }}>
              Acesso Administrativo
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              Digite suas credenciais para entrar no painel
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label
                htmlFor="admin-email"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-2)',
                  marginBottom: 6,
                }}
              >
                E-mail de Acesso
              </label>
              <input
                id="admin-email"
                type="email"
                className="field"
                autoFocus
                autoComplete="username"
                placeholder="seu@don.com.br"
                value={loginEmail}
                onChange={e => {
                  setLoginEmail(e.target.value)
                  if (loginError) setLoginError(null)
                }}
                disabled={busy}
                style={{ width: '100%', height: 42, borderRadius: 10, fontSize: 14 }}
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-2)',
                  marginBottom: 6,
                }}
              >
                Senha ou Token de Acesso
              </label>
              <input
                id="admin-password"
                type="password"
                className="field"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={loginPassword}
                onChange={e => {
                  setLoginPassword(e.target.value)
                  if (loginError) setLoginError(null)
                }}
                disabled={busy}
                style={{ width: '100%', height: 42, borderRadius: 10, fontSize: 14 }}
              />
            </div>

            {loginError && (
              <p role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, textAlign: 'center', fontWeight: 600 }}>
                {loginError}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !loginEmail || !loginPassword}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.28)',
            }}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Entrando no painel…</span>
              </>
            ) : (
              <>
                <span>Acessar Painel</span>
                <ArrowRight size={15} strokeWidth={2.2} />
              </>
            )}
          </button>

          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
            Acesso restrito à equipe e gestores do <strong>Grupo Don</strong>.
          </p>
        </form>

        {/* Footer */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
          Grupo Don © 2026 · Painel de Performance & Tráfego
        </div>
      </div>
    </main>
  )

  const kpis = [
    { icon: <Users size={16} strokeWidth={1.75} />, label: 'Clientes', value: String(stats.total), sub: `${stats.activeCount} ativos · ${stats.pausedCount} pausados`, warn: false },
    { icon: <TrendingUp size={16} strokeWidth={1.75} />, label: `Leads e conversas · ${periodNoun}`, value: String(stats.leadsP), sub: `${stats.leadsToday} hoje · do CRM`, warn: false },
    { icon: <DollarSign size={16} strokeWidth={1.75} />, label: `Vendas · ${periodNoun}`, value: String(stats.vendasP), sub: `${brl(stats.receitaP)} · do CRM`, warn: false },
    { icon: <Clock size={16} strokeWidth={1.75} />, label: 'Sem contato', value: String(stats.parados), sub: 'leads do CRM esperando retorno', warn: stats.parados > 0 },
  ]

  return (
    <StaffShell>
      {openingSlug && <PulseLoader fullscreen size={72} caption="Abrindo o painel" />}
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <MetaSyncPopover logoUrl={brandLogo} onLogoChange={canManage ? setBrandLogo : undefined} canEditBrand={canManage} openSignal={syncSignal} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>Painel</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Acompanhe os clientes, os leads e os acessos em um só lugar</p>
          </div>
          {themeButton}
          <ProfileMenu />
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

        <div className="kpi-grid-4" style={{ marginBottom: 24 }}>
          {kpis.map(k => (
            <div key={k.label} className="card" style={{ padding: 16, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>{k.icon}<span style={eyebrow}>{k.label}</span></div>
              <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 2px', lineHeight: 1.2, color: k.warn ? 'var(--amber)' : 'var(--text-1)' }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <AdminOverview refreshKey={refreshKey} days={period} clients={clients.map(c => ({ slug: c.slug, name: c.name }))} actions={
          <>
            <PeriodMenu value={period} onChange={setPeriod} />
            <FilterPicker active={(filter !== 'todos' ? 1 : 0) + (mgrFilter ? 1 : 0) + (scopeInfo?.canToggle && scopeInfo.mode === 'all' ? 1 : 0)} onClear={() => { setFilter('todos'); setMgrFilter(''); if (scopeInfo?.canToggle && scopeInfo.mode === 'all') setScope('mine') }}>
              {scopeInfo?.canToggle && (
                <FilterField label="Clientes">
                  <div role="group" aria-label="Quais clientes mostrar" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button type="button" className="pill-btn" aria-pressed={scopeInfo.mode === 'mine'} onClick={() => setScope('mine')} title="Só os clientes da sua carteira">Minhas contas</button>
                    <button type="button" className="pill-btn" aria-pressed={scopeInfo.mode === 'all'} onClick={() => setScope('all')} title="Todos os clientes da agência">Todas</button>
                  </div>
                </FilterField>
              )}
              {!scopeInfo?.restricted && managerList.length > 0 && (
                <FilterField label="Gestor">
                  <select className="field" aria-label="Filtrar por gestor" value={mgrFilter} onChange={e => setMgrFilter(e.target.value)}>
                    <option value="">Todos os gestores</option>
                    {managerList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    <option value="_none">Sem gestor</option>
                  </select>
                </FilterField>
              )}
              <FilterField label="Situação">
                <div role="group" aria-label="Situação do cliente" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {([['todos', 'Todos'], ['ativos', 'Ativos'], ['pausados', 'Pausados'], ['bloqueados', 'Bloqueados']] as const).map(([k, l]) => (
                    <button key={k} type="button" className="pill-btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
                  ))}
                </div>
              </FilterField>
            </FilterPicker>
            {canOperate && <button className="btn btn-outline btn-icon btn-sm" onClick={refreshAll} disabled={refreshing} aria-label="Atualizar todos os cards agora" title={refreshing ? 'Atualizando…' : 'Atualizar tudo: busca agora na Meta os números de todos os clientes'}>
              <RefreshCw size={16} strokeWidth={1.75} className={refreshing ? 'spin' : undefined} />
            </button>}
          </>
        } />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginRight: 4 }}>Clientes</h2>
          {scopeInfo?.restricted && <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--text-1)' }} title="Você vê os clientes da sua carteira">Carteira de {scopeInfo.manager?.name}</span>}
          <label className="search" style={{ flex: 1, minWidth: 200, maxWidth: 360, height: 36 }}>
            <Search size={16} color="var(--text-2)" strokeWidth={1.75} aria-hidden="true" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" />
          </label>
        </div>

        {clients.length === 0 ? (
          <div style={{ padding: '48px 16px', border: '1px dashed var(--border-input)', borderRadius: 'var(--radius-lg)', textAlign: 'center', color: 'var(--text-2)' }}>
            <Users size={32} strokeWidth={1.5} style={{ opacity: .5, margin: '0 auto 8px', display: 'block' }} aria-hidden="true" />
            {scopeInfo && (scopeInfo.mode === 'mine' || scopeInfo.restricted) ? 'Você ainda não tem clientes na sua carteira. Peça a um administrador para atribuir clientes a você em Performance.' : 'Nenhum cliente ainda. Crie o primeiro em “Novo cliente”.'}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Nenhum cliente encontrado.</div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {visible.map(c => {
              const badge = c.locked
                ? { bg: 'var(--red-soft)', dot: 'var(--red)', text: 'Bloqueado' }
                : c.active === false
                  ? { bg: 'rgba(245, 158, 11, 0.15)', dot: 'var(--amber)', text: 'Pausado' }
                  : { bg: 'var(--green-soft)', dot: 'var(--green)', text: 'Ativo' }
              const items: MenuItem[] = [
                ...(canManage ? [{ icon: <Pencil size={16} strokeWidth={1.75} />, text: 'Editar cliente e metas', onClick: () => setModal({ kind: 'clients', select: c.slug, tab: 'cadastro' }) }] : []),
                ...(canOperate ? [{ icon: <Webhook size={16} strokeWidth={1.75} />, text: 'Integrações', onClick: () => setModal({ kind: 'clients', select: c.slug, tab: 'integracoes' }) }] : []),
                ...(canOperate ? [{ icon: <Settings2 size={16} strokeWidth={1.75} />, text: 'Métricas do card', onClick: () => setModal({ kind: 'metrics', client: c }) }] : []),
                ...(canOperate ? [{ icon: <KeyRound size={16} strokeWidth={1.75} />, text: 'Acessos (e-mail e senha)', onClick: () => setModal({ kind: 'clients', select: c.slug, tab: 'acessos' }) }] : []),
                ...(canManage ? [{ icon: <KeyRound size={16} strokeWidth={1.75} />, text: c.hasCode ? 'Revogar código antigo' : 'Gerar código antigo', onClick: () => c.hasCode ? setModal({ kind: 'confirm', action: 'rotate', client: c }) : runAction('rotate', c) }] : []),
                { icon: <Link2 size={16} strokeWidth={1.75} />, text: 'Copiar link do painel', onClick: () => { navigator.clipboard?.writeText(clientUrl(c.slug)).then(() => setNotice('Link copiado.')).catch(() => setNotice(clientUrl(c.slug))) } },
              ]
              if (canManage && c.locked) items.push({ icon: <LockOpen size={16} strokeWidth={1.75} />, text: 'Desbloquear acesso', onClick: () => runAction('unlock', c) })
              if (canManage && c.hasCode) items.push('sep', { icon: <Ban size={16} strokeWidth={1.75} />, text: 'Desativar acesso', danger: true, onClick: () => setModal({ kind: 'confirm', action: 'revoke', client: c }) })
              if (canManage) items.push({ icon: <Trash2 size={16} strokeWidth={1.75} />, text: 'Excluir cliente', danger: true, onClick: () => setModal({ kind: 'delete', client: c }) })
              return (
                <article key={c.slug} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={c.name} logoUrl={c.logoUrl} />
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.3 }}>{c.name}</h3>
                      <PlatformBadges platforms={platformsFor({ adAccountId: c.adAccountId, ecommerce: c.ecommerce, google: Boolean(c.googleAdsCustomerId) })} height={10} />
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
                                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: tone === 'good' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={def.group === 'meta' && !c.resultsAt ? 'A Meta ainda não foi lida para este cliente' : undefined}>{def.group === 'meta' && !c.resultsAt ? '—' : def.value(c, p)}</div>
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
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      disabled={openingSlug === c.slug}
                      onClick={() => openPanel(c.slug)}
                    >
                      {openingSlug === c.slug ? (
                        <><Loader2 size={16} className="spin" /> Abrindo painel…</>
                      ) : (
                        <><ExternalLink size={16} strokeWidth={1.75} /> Acessar dashboard</>
                      )}
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

        {modal?.kind === 'clients' && (
          <ClientsManager clients={clients} initial={modal.select} initialTab={modal.tab} canManage={canManage} baseDomain={baseDomain} accounts={accounts} accountsError={accountsError} accountsSavedAt={accountsSavedAt} urlFor={clientUrl}
            onReload={load} onOpenPanel={openPanel} onNotice={setNotice} onConfigSaved={(slug, active) => setClients(prev => prev.map(cl => (cl.slug === slug ? { ...cl, active } : cl)))} onClose={() => setModal(null)} />
        )}
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
        {modal?.kind === 'delete' && <DeleteClientModal client={modal.client} onClose={() => setModal(null)} onDeleted={async () => { const name = modal.client.name; setModal(null); await load(); setNotice(`Cliente ${name} excluído.`) }} />}
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
    </StaffShell>
  )
}
