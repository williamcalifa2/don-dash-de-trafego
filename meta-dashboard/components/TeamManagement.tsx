'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Search, Trash2 } from 'lucide-react'
import type { MemberRole } from '@/lib/team'
import { StaffShell } from './StaffShell'
import { ProfileMenu } from './ProfileMenu'
import { PulseLoader } from './PulseLoader'
import { ModalShell } from './ModalShell'

type TeamRole = MemberRole
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

async function api<T = Record<string, unknown>>(url: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) as T & { error?: string } }
}

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

/** Escolha dos clientes que uma pessoa do nível Orgânico pode ver. */
function OrganicClientsModal({ email, initial, onClose, onSave }: { email: string; initial: string[]; onClose: () => void; onSave: (slugs: string[]) => void | Promise<void> }) {
  const [all, setAll] = useState<Array<{ slug: string; name: string }> | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(initial))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api<{ clients: Array<{ slug: string; name: string }> }>('/api/admin/clients/names').then(r => setAll(r.ok ? r.data.clients : [])) }, [])
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
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

function MemberTokenModal({ email, token, role, onClose }: { email: string; token: string; role: TeamRole; onClose: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <ModalShell title={`Acesso de ${email}`} onClose={onClose}>
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

/** Conteúdo da tela de equipe, sem o cabeçalho nem o StaffShell: dá pra encaixar dentro de outra tela (ex.: a aba "Equipe & Gestores" de Configurações). */
export function TeamManagementContent() {
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [canManageAdmins, setCanManageAdmins] = useState(false)
  const [role, setRole] = useState<TeamRole>('member')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [addClients, setAddClients] = useState<string[]>([])
  const [picking, setPicking] = useState<null | { email: string; clients: string[]; forNew?: boolean }>(null)
  const [issued, setIssued] = useState<{ email: string; token: string; role: TeamRole } | null>(null)

  const load = useCallback(async () => {
    const r = await api<{ members: TeamMember[]; canManageAdmins?: boolean }>('/api/admin/team')
    if (r.ok) { setMembers(r.data.members ?? []); setCanManageAdmins(!!r.data.canManageAdmins) } else setErr(r.data.error ?? 'Não foi possível carregar a equipe.')
  }, [])
  useEffect(() => { void load() }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy(true); setErr(null)
    const r = await api<{ email: string; token: string; role: TeamRole }>('/api/admin/team', 'POST', { email, role, ...(role === 'organic' ? { clients: addClients } : {}) })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível adicionar.')
    setEmail(''); setAddClients([])
    setIssued({ email: r.data.email, token: r.data.token, role: r.data.role })
    void load()
  }
  async function regenerate(m: TeamMember) {
    setBusy(true); setErr(null)
    const r = await api<{ token: string }>('/api/admin/team', 'PUT', { email: m.email })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível gerar a senha.')
    setIssued({ email: m.email, token: r.data.token, role: m.role })
  }
  async function changeRole(m: TeamMember, next: TeamRole) {
    setBusy(true); setErr(null)
    const r = await api('/api/admin/team', 'PATCH', { email: m.email, role: next })
    setBusy(false)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível mudar o nível.')
    void load()
  }
  async function remove(m: TeamMember) {
    setBusy(true); setErr(null)
    const r = await api('/api/admin/team?email=' + encodeURIComponent(m.email), 'DELETE')
    setBusy(false); setConfirm(null)
    if (!r.ok) return setErr(r.data.error ?? 'Não foi possível remover.')
    void load()
  }

  return (
    <>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
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
        {issued && <MemberTokenModal email={issued.email} token={issued.token} role={issued.role} onClose={() => setIssued(null)} />}
    </>
  )
}

/** Tela própria da equipe (rota /admin/membros): mesmo conteúdo acima, com cabeçalho e StaffShell. Antes era um popup em cima do Painel (perdia o lugar se desse F5). */
export function TeamManagement() {
  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Equipe</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Quem entra no painel da agência e com qual nível de acesso</p>
          </div>
          <ProfileMenu />
        </header>
        <TeamManagementContent />
      </main>
    </StaffShell>
  )
}
