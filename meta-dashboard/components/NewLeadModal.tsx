'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useLeadsData } from '@/lib/leadsContext'
import { apiFetch } from '@/lib/apiFetch'
import { LOSS_REASONS } from '@/lib/leadTypes'
import type { TreeCampaign } from '@/lib/structureTree'
import { samePhone } from '@/lib/leadUtils'

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }
const STATUSES = ['Novo', 'Em andamento', 'Convertido', 'Perdido'] as const
const OTHER_SOURCES = ['Indicação', 'Balcão / loja', 'WhatsApp direto', 'Instagram orgânico', 'Google', 'Site', 'Telefone', 'Evento']

/** Cadastro manual de lead: origem (campanha, conjunto e anúncio da Meta, ou outra fonte digitada), status, valor e motivo. */
export function NewLeadModal({ onClose }: { onClose: () => void }) {
  const { leads, addLead } = useLeadsData()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [atendido, setAtendido] = useState('')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('Novo')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupOk, setDupOk] = useState(false)

  // Origem
  const [origem, setOrigem] = useState<'meta' | 'outra'>('meta')
  const [tree, setTree] = useState<TreeCampaign[] | null>(null)
  const [treeState, setTreeState] = useState<'loading' | 'ok' | 'empty'>('loading')
  const [campId, setCampId] = useState('')
  const [setId, setSetId] = useState('')
  const [adId, setAdId] = useState('')
  const [outra, setOutra] = useState('')
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => { first.current?.focus() }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  useEffect(() => {
    let alive = true
    apiFetch('/api/meta/structure', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: { campaigns?: TreeCampaign[] }) => {
        if (!alive) return
        const c = j.campaigns ?? []
        setTree(c); setTreeState(c.length ? 'ok' : 'empty')
        if (!c.length) setOrigem('outra')
      })
      .catch(() => { if (alive) { setTreeState('empty'); setOrigem('outra') } })
    return () => { alive = false }
  }, [])

  const camp = tree?.find(c => c.id === campId)
  const adset = camp?.adsets.find(s => s.id === setId)
  const ad = adset?.ads.find(a => a.id === adId)

  const uniq = (xs: Array<string | null | undefined>) => [...new Set(xs.map(x => (x ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const atendentes = uniq(leads.map(l => l.atendido_por))
  const fontes = useMemo(() => uniq([...OTHER_SOURCES, ...leads.filter(l => !l.meta_lead_id && !l.conjunto).map(l => l.campanha)]), [leads])

  const opt = (label: string, active: boolean) => `${label}${active ? '' : ' · pausada'}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() && !telefone.trim()) { setError('Informe pelo menos o nome ou o telefone.'); return }
    if (status === 'Convertido' && !valor.trim()) { setError('Informe o valor do pedido, para entrar nas contas de retorno.'); return }
    const dup = telefone.trim() && !dupOk ? leads.find(l => samePhone(l.telefone, telefone)) : undefined
    if (dup) { setDupOk(true); setError(`Já existe um lead com esse telefone${dup.nome ? ` (${dup.nome})` : ''}. Toque em Salvar de novo para cadastrar mesmo assim.`); return }
    setSaving(true); setError(null)
    const r = await addLead({
      nome, telefone, email, atendido_por: atendido, status, notas,
      campanha: origem === 'meta' ? (camp?.name ?? '') : outra.trim(),
      conjunto: origem === 'meta' ? (adset?.name ?? '') : '',
      ad_name: origem === 'meta' ? (ad?.name ?? '') : '',
      valor_pedido: status === 'Convertido' ? valor : undefined,
      motivo_perda: status === 'Perdido' ? motivo : undefined,
    })
    setSaving(false)
    if (r.error) { setError(r.error); return }
    if (r.warning) { setError(r.warning); return }
    onClose()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1499, background: 'hsl(0 0% 0% / .35)' }} onClick={onClose} />
      <form
        onSubmit={submit} role="dialog" aria-label="Novo lead"
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1500, width: 'min(440px, 100vw)', overflowY: 'auto', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-elegant)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ flex: 1, fontSize: 18, fontWeight: 600 }}>Novo lead</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button>
        </header>

        <div>
          <label htmlFor="nl-nome" style={labelStyle}>Nome</label>
          <input id="nl-nome" ref={first} className="field" value={nome} maxLength={120} onChange={e => setNome(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="nl-tel" style={labelStyle}>WhatsApp / telefone</label>
          <input id="nl-tel" className="field" inputMode="tel" placeholder="(00) 00000-0000" value={telefone} maxLength={40} onChange={e => { setTelefone(e.target.value); setDupOk(false) }} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="nl-mail" style={labelStyle}>E-mail (opcional)</label>
          <input id="nl-mail" className="field" type="email" value={email} maxLength={160} onChange={e => setEmail(e.target.value)} autoComplete="off" />
        </div>

        {/* Origem */}
        <div>
          <span style={labelStyle}>De onde veio</span>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }} role="group" aria-label="Tipo de origem">
            <button type="button" className="pill-btn" aria-pressed={origem === 'meta'} disabled={treeState === 'empty'} onClick={() => setOrigem('meta')} aria-describedby={treeState === 'empty' ? 'nl-tree-hint' : undefined}>Campanha do Meta</button>
            <button type="button" className="pill-btn" aria-pressed={origem === 'outra'} onClick={() => setOrigem('outra')}>Outra fonte</button>
          </div>

          {origem === 'meta' ? (
            treeState === 'loading' ? (
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Carregando campanhas…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select className="field" aria-label="Campanha" value={campId} onChange={e => { setCampId(e.target.value); setSetId(''); setAdId('') }}>
                  <option value="">Campanha (opcional)</option>
                  {tree?.map(c => <option key={c.id} value={c.id}>{opt(c.name, c.active)}</option>)}
                </select>
                {camp && (
                  <select className="field" aria-label="Conjunto" value={setId} onChange={e => { setSetId(e.target.value); setAdId('') }}>
                    <option value="">Conjunto de anúncios (opcional){camp.adsets.length ? '' : ' · nenhum'}</option>
                    {camp.adsets.map(s => <option key={s.id} value={s.id}>{opt(s.name, s.active)}</option>)}
                  </select>
                )}
                {adset && (
                  <select className="field" aria-label="Anúncio" value={adId} onChange={e => setAdId(e.target.value)}>
                    <option value="">Anúncio (opcional){adset.ads.length ? '' : ' · nenhum'}</option>
                    {adset.ads.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </div>
            )
          ) : (
            <>
              <input id="nl-outra" className="field" list="nl-fontes" placeholder="Digite a fonte: indicação, balcão, Google…" value={outra} maxLength={300} onChange={e => setOutra(e.target.value)} autoComplete="off" />
              <datalist id="nl-fontes">{fontes.map(f => <option key={f} value={f} />)}</datalist>
              {treeState === 'empty' && <p id="nl-tree-hint" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>As campanhas do Meta não carregaram agora. Você pode digitar a origem ou tentar de novo mais tarde.</p>}
            </>
          )}
        </div>

        <div>
          <label htmlFor="nl-atend" style={labelStyle}>Atendido por (opcional)</label>
          <input id="nl-atend" className="field" list="nl-atendentes" value={atendido} maxLength={80} onChange={e => setAtendido(e.target.value)} autoComplete="off" />
          <datalist id="nl-atendentes">{atendentes.map(a => <option key={a} value={a} />)}</datalist>
        </div>

        <div>
          <span style={labelStyle}>Status</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} role="group" aria-label="Status">
            {STATUSES.map(st => <button type="button" key={st} className="pill-btn" aria-pressed={status === st} onClick={() => setStatus(st)}>{st}</button>)}
          </div>
        </div>

        {status === 'Convertido' && (
          <div>
            <label htmlFor="nl-valor" style={labelStyle}>Valor do pedido (R$)</label>
            <input id="nl-valor" className="field" inputMode="decimal" placeholder="0,00" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, ''))} autoComplete="off" />
          </div>
        )}
        {status === 'Perdido' && (
          <div>
            <label htmlFor="nl-motivo" style={labelStyle}>Motivo da perda</label>
            <select id="nl-motivo" className="field" value={motivo} onChange={e => setMotivo(e.target.value)}>
              <option value="">Selecione o motivo…</option>
              {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="nl-notas" style={labelStyle}>Notas (opcional)</label>
          <textarea id="nl-notas" className="field" rows={3} maxLength={2000} value={notas} onChange={e => setNotas(e.target.value)}
            style={{ height: 'auto', minHeight: 72, padding: 12, resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        {error && <p role="alert" style={{ fontSize: 13, color: 'var(--red)', lineHeight: 1.5 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'auto' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </>
  )
}
