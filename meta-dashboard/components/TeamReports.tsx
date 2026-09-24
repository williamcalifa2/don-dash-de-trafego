'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Download, ExternalLink, FileBarChart, Loader2, Pencil, Play, Plus, Presentation, Trash2, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { ReportMode, ReportPreset, SavedReport } from '@/lib/report'
import type { TeamClient, TeamReport } from '@/lib/reportsLibrary'
import { ReportStudio } from '@/components/ReportStudio'
import { StaffShell } from '@/components/StaffShell'
import { PulseLoader } from '@/components/PulseLoader'
import { buildSlides } from '@/lib/reportSlides'

const PRESET_LABEL: Record<string, string> = { last_month: 'Mês passado', this_month: 'Este mês', last_7d: 'Últimos 7 dias' }
const MODE_LABEL: Record<ReportMode, string> = { standard: 'Padrão', advanced: 'Avançado', organic: 'Orgânico' }
const MODE_DESC: Record<ReportMode, string> = { standard: 'Visão executiva com KPIs e criativos', advanced: 'Completo, com público, plataformas e funil', organic: 'Só orgânico (Instagram e Facebook)' }
const day = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

function ClientChip({ c }: { c: TeamClient }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {c.logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={c.logoUrl} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'contain', background: 'var(--bg-card2)', flexShrink: 0 }} />
        : <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{c.name.slice(0, 1).toUpperCase()}</span>}
      <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
    </span>
  )
}

/** Report Studio da equipe: os relatórios de todos os clientes num lugar só, sem entrar na conta de cada um. */
export function TeamReports() {
  const [reports, setReports] = useState<TeamReport[]>([])
  const [clients, setClients] = useState<TeamClient[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading')
  const [role, setRole] = useState<string | null>(null)
  const [clientFilter, setClientFilter] = useState('')
  const [presetFilter, setPresetFilter] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newClient, setNewClient] = useState('')
  const [newPreset, setNewPreset] = useState<ReportPreset>('last_month')
  const [newMode, setNewMode] = useState<ReportMode>('standard')
  const [studio, setStudio] = useState<null | { saved: SavedReport | null; preset: ReportPreset; mode: ReportMode }>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  const load = useCallback(async () => {
    const r = await apiFetch('/api/admin/reports', { cache: 'no-store' }).catch(() => null)
    if (!r) return setState('error')
    if (r.status === 401) return setState('denied')
    if (!r.ok) return setState('error')
    const j = await r.json() as { reports: TeamReport[]; clients: TeamClient[] }
    setReports(j.reports); setClients(j.clients); setState('ready')
  }, [])
  useEffect(() => { void load(); apiFetch('/api/admin/profile').then(r => (r.ok ? r.json() : null)).then((j: { role?: string } | null) => setRole(j?.role ?? null)).catch(() => { }) }, [load])

  const canWrite = role === 'owner' || role === 'admin' || role === 'member'
  const filtered = useMemo(() => reports.filter(r => (!clientFilter || r.client.slug === clientFilter) && (!presetFilter || r.preset === presetFilter)), [reports, clientFilter, presetFilter])
  const flash = (t: string) => { setNotice(t); setTimeout(() => setNotice(null), 3500) }

  /** O estúdio trabalha com o cliente "em vista": escolhe o cliente sem levar a equipe para a tela dele. */
  async function viewClient(slug: string) {
    const r = await apiFetch('/api/admin/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) }).catch(() => null)
    return !!r?.ok
  }

  async function openSaved(rep: TeamReport) {
    setBusy(rep.id)
    try {
      const [ok, full] = await Promise.all([viewClient(rep.client.slug), apiFetch(`/api/admin/reports/${rep.client.slug}/${rep.id}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() as Promise<SavedReport> : null)).catch(() => null)])
      if (!ok || !full) return flash('Não foi possível abrir este relatório.')
      setStudio({ saved: full, preset: full.preset, mode: full.mode })
    } finally { setBusy(null) }
  }

  async function startNew() {
    if (!newClient) return
    setBusy('new')
    if (!(await viewClient(newClient))) { setBusy(null); return flash('Não foi possível abrir este cliente.') }
    setBusy(null); setNewOpen(false)
    setStudio({ saved: null, preset: newPreset, mode: newMode })
  }

  async function pptx(rep: TeamReport) {
    setBusy(`pptx:${rep.id}`)
    try {
      const full = await apiFetch(`/api/admin/reports/${rep.client.slug}/${rep.id}`).then(r => (r.ok ? r.json() as Promise<SavedReport> : null))
      if (!full) throw new Error('Falha ao ler o relatório')
      const slides = buildSlides(full.snapshot.data, full.snapshot.notes, full.mode, full.theme)
      const { downloadPptx } = await import('@/lib/reportPptx')
      await downloadPptx(slides, `Relatorio-${full.mode}-${full.periodKey}-${rep.client.name.replace(/[^\w]/g, '_')}`)
    } catch { flash('Não foi possível gerar o PowerPoint.') } finally { setBusy(null) }
  }

  async function copyLink(rep: TeamReport) {
    setBusy(`link:${rep.id}`)
    try {
      const t = await apiFetch('/api/admin/present', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: rep.client.slug, id: rep.id }) }).then(r => r.json()) as { token?: string }
      if (!t.token) throw new Error()
      await navigator.clipboard.writeText(`${window.location.origin}/apresentacao/${t.token}`)
      flash('Link da tela do cliente copiado.')
    } catch { flash('Não foi possível copiar o link.') } finally { setBusy(null) }
  }

  async function remove(rep: TeamReport) {
    setBusy(`del:${rep.id}`)
    const r = await apiFetch(`/api/admin/reports/${rep.client.slug}/${rep.id}`, { method: 'DELETE' }).catch(() => null)
    setBusy(null); setConfirmDelete(null)
    if (r?.ok) setReports(p => p.filter(x => x.id !== rep.id)); else flash('Não foi possível excluir.')
  }

  const btn = 'btn btn-outline btn-sm'
  return (
    <StaffShell>
      {leaving && <PulseLoader fullscreen size={72} caption="Abrindo a apresentação" />}
      <main className="page">
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}><Presentation size={26} strokeWidth={1.75} /></span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Report Studio</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Relatórios e apresentações de todos os clientes, num lugar só</p>
          </div>
          {canWrite && <button className="btn btn-primary" onClick={() => { setNewClient(clientFilter || clients[0]?.slug || ''); setNewOpen(true) }}><Plus size={16} strokeWidth={1.75} /> Novo relatório</button>}
        </header>

        {notice && <div role="status" className="card" style={{ padding: 12, marginBottom: 16, fontSize: 14 }}>{notice}</div>}
        {state === 'loading' && <PulseLoader size={44} />}
        {state === 'denied' && <div className="card" style={{ padding: 32, textAlign: 'center' }}><p style={{ margin: '0 0 12px' }}>Entre na administração para ver os relatórios.</p><Link href="/admin" className="btn btn-primary btn-sm">Entrar</Link></div>}
        {state === 'error' && <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar os relatórios. Tente de novo em instantes.</div>}

        {state === 'ready' && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
              <select className="field" style={{ height: 36, width: 'auto', minWidth: 200 }} value={clientFilter} onChange={e => setClientFilter(e.target.value)} aria-label="Filtrar por cliente">
                <option value="">Todos os clientes</option>
                {clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {([['', 'Todos'], ['last_month', 'Mês passado'], ['this_month', 'Este mês'], ['last_7d', '7 dias']] as const).map(([k, l]) => <button key={k} className="pill-btn" aria-pressed={presetFilter === k} onClick={() => setPresetFilter(k)}>{l}</button>)}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-2)' }}>{filtered.length} relatório{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {filtered.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                <FileBarChart size={28} strokeWidth={1.5} color="var(--text-3)" />
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '10px 0 4px' }}>Nenhum relatório ainda</h3>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{canWrite ? 'Clique em "Novo relatório" para criar o primeiro.' : 'Os relatórios criados pela equipe aparecem aqui.'}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {filtered.map(r => (
                  <article key={`${r.client.slug}:${r.id}`} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <ClientChip c={r.client} />
                      <span className="badge" style={{ background: 'var(--bg-card2)', color: 'var(--text-2)', fontSize: 11, flexShrink: 0 }}>{MODE_LABEL[r.mode]}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 title={r.title} style={{ fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{r.title}</h3>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Criado em {day(r.createdAt)}{r.author ? ` por ${r.author}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', marginTop: 'auto' }}>
                      <Link className="btn btn-primary btn-sm" href={`/admin/reports/${r.client.slug}/${r.id}/present`} onClick={() => setLeaving(true)} style={{ flex: 1, justifyContent: 'center', whiteSpace: 'nowrap' }}><Play size={14} strokeWidth={1.75} /> Apresentar</Link>
                      <button className={`${btn} btn-icon`} onClick={() => openSaved(r)} disabled={busy === r.id} aria-label="Editar relatório" title="Editar">{busy === r.id ? <Loader2 size={14} className="spin" /> : <Pencil size={14} strokeWidth={1.75} />}</button>
                      <button className={`${btn} btn-icon`} onClick={() => copyLink(r)} disabled={busy === `link:${r.id}`} aria-label="Copiar link da tela do cliente" title="Copiar link da tela do cliente"><Copy size={14} strokeWidth={1.75} /></button>
                      <button className={`${btn} btn-icon`} onClick={() => pptx(r)} disabled={busy === `pptx:${r.id}`} aria-label="Baixar PowerPoint" title="Baixar PowerPoint">{busy === `pptx:${r.id}` ? <Loader2 size={14} className="spin" /> : <Download size={14} strokeWidth={1.75} />}</button>
                      {canWrite && (confirmDelete === r.id
                        ? <><button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', whiteSpace: 'nowrap' }} onClick={() => remove(r)} disabled={busy === `del:${r.id}`}>Excluir</button><button className="btn btn-outline btn-icon btn-sm" onClick={() => setConfirmDelete(null)} aria-label="Cancelar" title="Cancelar"><X size={14} strokeWidth={1.75} /></button></>
                        : <button className={`${btn} btn-icon`} onClick={() => setConfirmDelete(r.id)} aria-label="Excluir relatório" title="Excluir"><Trash2 size={14} strokeWidth={1.75} /></button>)}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {newOpen && (
        <div role="dialog" aria-modal="true" aria-label="Novo relatório" style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', padding: 16 }} onMouseDown={e => { if (e.target === e.currentTarget) setNewOpen(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}><h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, flex: 1 }}>Novo relatório</h2><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setNewOpen(false)} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button></div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>Cliente
              <select className="field" value={newClient} onChange={e => setNewClient(e.target.value)}>{clients.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Período</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{(['last_month', 'this_month', 'last_7d'] as const).map(p => <button key={p} className="pill-btn" aria-pressed={newPreset === p} onClick={() => setNewPreset(p)}>{PRESET_LABEL[p]}</button>)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Formato</span>
              <div style={{ display: 'grid', gap: 6 }}>{(['standard', 'advanced', 'organic'] as const).map(m => <button key={m} type="button" className="card" aria-pressed={newMode === m} onClick={() => setNewMode(m)} style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${newMode === m ? 'var(--accent)' : 'var(--border)'}` }}><strong style={{ fontSize: 13 }}>{MODE_LABEL[m]}</strong><div style={{ fontSize: 12, color: 'var(--text-2)' }}>{MODE_DESC[m]}</div></button>)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn btn-outline" onClick={() => setNewOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={startNew} disabled={!newClient || busy === 'new'}>{busy === 'new' ? 'Abrindo…' : <><ExternalLink size={14} strokeWidth={1.75} /> Criar</>}</button></div>
          </div>
        </div>
      )}

      {studio && <ReportStudio onClose={() => { setStudio(null); void load() }} initialPreset={studio.preset} initialMode={studio.mode} savedReport={studio.saved} onSaveSuccess={() => void load()} readOnly={!canWrite} />}
    </StaffShell>
  )
}
