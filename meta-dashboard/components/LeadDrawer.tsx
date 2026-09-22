'use client'

import { useEffect, useRef, useState } from 'react'
import { X, MessageCircle, Clock } from 'lucide-react'
import { LOSS_REASONS, type Lead, type LeadStatus, type LeadUpdate } from '@/lib/leadTypes'
import { timeAgo, waLink, fmtPhone } from '@/lib/leadUtils'
import { useLeadsData } from '@/lib/leadsContext'

const STATUSES: LeadStatus[] = ['Novo', 'Em andamento', 'Convertido', 'Perdido']

interface Props {
  lead: Lead
  focus: 'motivo' | 'valor' | null
  onClose: () => void
  onPatch: (id: string, update: LeadUpdate) => Promise<string | null>
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 6,
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function LeadDrawer({ lead, focus, onClose, onPatch }: Props) {
  const [notas, setNotas] = useState(lead.notas ?? '')
  const [valor, setValor] = useState(lead.valor_pedido != null ? String(lead.valor_pedido) : '')
  const [saved, setSaved] = useState<string | null>(null)
  const [atendente, setAtendente] = useState(lead.atendido_por ?? '')
  // Nomes já usados neste cliente, para escolher sem digitar de novo.
  const { leads: allLeads } = useLeadsData()
  const nomes = [...new Set(allLeads.map(l => (l.atendido_por ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const motivoRef = useRef<HTMLSelectElement>(null)
  const valorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focus === 'motivo') motivoRef.current?.focus()
    if (focus === 'valor') valorRef.current?.focus()
  }, [focus])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save(update: LeadUpdate, label: string) {
    const err = await onPatch(lead.id, update)
    setSaved(err ? `Não foi possível salvar. ${err}` : label)
    setTimeout(() => setSaved(null), err ? 8000 : 2000)
  }

  const phoneDigits = lead.telefone?.replace(/\D/g, '')

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1499 }} onClick={onClose} />
      <aside
        role="dialog"
        aria-label={`Lead ${lead.nome ?? ''}`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1500,
          width: 'min(440px, 100vw)', overflowY: 'auto',
          background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-elegant)', padding: 24,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{lead.nome ?? 'Lead sem nome'}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Entrou em {fmtDateTime(lead.created_at)} · {timeAgo(lead.created_at)}</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><X size={16} strokeWidth={1.75} /></button>
        </header>

        <section style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {phoneDigits && (
            <a className="btn btn-outline btn-sm" href={waLink(lead.telefone!)} target="_blank" rel="noreferrer">
              <MessageCircle size={16} strokeWidth={1.75} color="var(--green)" /> {fmtPhone(lead.telefone)}
            </a>
          )}
          {lead.email && <span style={{ fontSize: 12, color: 'var(--text-2)', overflowWrap: 'anywhere' }}>{lead.email}</span>}
        </section>

        <section>
          <span style={labelStyle}>Origem</span>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 14 }}>
            {([['Campanha', lead.campanha], ['Conjunto', lead.conjunto], ['Anúncio', lead.ad_name]] as const).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--text-2)' }}>{k}</dt>
                <dd style={{ overflowWrap: 'anywhere' }}>{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <span style={labelStyle}>Status</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} role="group" aria-label="Status do lead">
            {STATUSES.map(st => (
              <button key={st} className="pill-btn" aria-pressed={lead.status === st}
                onClick={() => { if (lead.status !== st) save({ status: st }, 'Status atualizado') }}>
                {st}
              </button>
            ))}
          </div>
        </section>

        {lead.status === 'Convertido' && (
          <section>
            <label htmlFor="drawer-valor" style={labelStyle}>Valor do pedido (R$)</label>
            <input
              id="drawer-valor" ref={valorRef} type="number" min={0} step="0.01" className="field"
              value={valor} onChange={e => setValor(e.target.value)}
              onBlur={() => {
                const n = valor.trim() === '' ? null : parseFloat(valor.replace(',', '.'))
                if (n !== lead.valor_pedido && (n === null || (!isNaN(n) && n >= 0))) save({ valor_pedido: n }, 'Valor salvo')
              }}
            />
          </section>
        )}

        {lead.status === 'Perdido' && (
          <section>
            <label htmlFor="drawer-motivo" style={labelStyle}>Motivo da perda</label>
            <select
              id="drawer-motivo" ref={motivoRef} className="field" value={lead.motivo_perda ?? ''}
              onChange={e => save({ motivo_perda: e.target.value || null }, 'Motivo salvo')}
            >
              <option value="">Selecione o motivo…</option>
              {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {!lead.motivo_perda && <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>Informar o motivo ajuda a melhorar as campanhas.</p>}
          </section>
        )}

        <section>
          <span style={labelStyle}>Último contato</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, color: lead.ultimo_contato ? 'var(--text-1)' : 'var(--text-2)' }}>
              <Clock size={16} strokeWidth={1.75} />
              {lead.ultimo_contato ? `${fmtDateTime(lead.ultimo_contato)} · ${timeAgo(lead.ultimo_contato)}` : 'Nenhum contato registrado'}
            </span>
            <button className="btn btn-outline btn-sm" onClick={() => save({ ultimo_contato: new Date().toISOString() }, 'Contato registrado')}>
              Registrar contato agora
            </button>
          </div>
        </section>

        <section>
          <label htmlFor="drawer-atendente" style={labelStyle}>Atendido por</label>
          <input
            id="drawer-atendente" className="field" list="drawer-atendentes" maxLength={80} autoComplete="off"
            placeholder="Nome de quem atendeu"
            value={atendente} onChange={e => setAtendente(e.target.value)}
            onBlur={() => { const v = atendente.trim().replace(/\s+/g, ' '); if ((v || null) !== (lead.atendido_por ?? null)) { setAtendente(v); save({ atendido_por: v || null }, 'Atendente salvo') } }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
          <datalist id="drawer-atendentes">{nomes.map(n => <option key={n} value={n} />)}</datalist>
        </section>

        <section>
          <label htmlFor="drawer-notas" style={labelStyle}>Notas</label>
          <textarea
            id="drawer-notas" className="field" rows={5} maxLength={2000}
            style={{ height: 'auto', minHeight: 96, padding: 12, resize: 'vertical', lineHeight: 1.5 }}
            placeholder="Ex.: pediu orçamento de 200 unidades, retornar na sexta"
            value={notas} onChange={e => setNotas(e.target.value)}
            onBlur={() => { if ((notas.trim() || null) !== (lead.notas ?? null)) save({ notas: notas.trim() || null }, 'Nota salva') }}
          />
        </section>

        <div aria-live="polite" style={{ minHeight: 20, fontSize: 12, color: saved?.startsWith('Não') ? 'var(--red)' : 'var(--green)', fontWeight: 600, lineHeight: 1.4 }}>{saved}</div>
      </aside>
    </>
  )
}
