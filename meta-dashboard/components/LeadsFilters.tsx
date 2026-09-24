'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, SlidersHorizontal, X } from 'lucide-react'
import type { Lead, LeadStatus } from '@/lib/leadTypes'
import { activeCount, applyFilters, EMPTY_FILTERS, facets, leadOrigin, type Facet, type LeadFilters, type LeadPeriod } from '@/lib/leadFilters'
import { isStale } from '@/lib/leadUtils'

const STATUSES: LeadStatus[] = ['Novo', 'Em andamento', 'Convertido', 'Perdido']
const PERIODS: Array<[LeadPeriod, string]> = [['all', 'Todo o período'], ['today', 'Hoje'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['month', 'Este mês'], ['custom', 'Personalizado']]
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])

function Badge({ n }: { n: number }) {
  return n > 0 ? <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span> : null
}

function Section({ title, count, open, onToggle, children }: { title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border-soft)' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-1)', fontSize: 14, fontWeight: 600, textAlign: 'left' }}>
        {open ? <ChevronDown size={16} strokeWidth={1.75} color="var(--text-2)" /> : <ChevronRight size={16} strokeWidth={1.75} color="var(--text-2)" />}
        <span style={{ flex: 1 }}>{title}</span>
        <Badge n={count} />
      </button>
      {open && <div style={{ padding: '0 4px 12px 28px' }}>{children}</div>}
    </div>
  )
}

function Check({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, cursor: 'pointer', color: 'var(--text-1)' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
      {count != null && <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
    </label>
  )
}

/** Lista de opções com busca quando é comprida (campanhas e anúncios podem ser muitos). */
function Options({ items, selected, onToggle, label }: { items: Facet[]; selected: string[]; onToggle: (v: string) => void; label: string }) {
  const [q, setQ] = useState('')
  if (!items.length) return <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Nenhum lead com este dado.</p>
  const shown = items.filter(i => !q || i.value.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      {items.length > 7 && <input className="field" style={{ height: 32, fontSize: 12, marginBottom: 6 }} placeholder={`Buscar ${label}`} aria-label={`Buscar ${label}`} value={q} onChange={e => setQ(e.target.value)} />}
      <div style={{ maxHeight: 190, overflowY: 'auto', paddingRight: 4 }}>
        {shown.map(i => <Check key={i.value} label={i.value} count={i.count} checked={selected.includes(i.value)} onChange={() => onToggle(i.value)} />)}
        {!shown.length && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Nada encontrado.</p>}
      </div>
    </div>
  )
}

export function LeadsFilters({ leads, value, onChange }: { leads: Lead[]; value: LeadFilters; onChange: (f: LeadFilters) => void }) {
  const [open, setOpen] = useState(false)
  const [sec, setSec] = useState<string | null>('status')
  const root = useRef<HTMLDivElement>(null)
  const n = activeCount(value)
  const fx = useMemo(() => facets(leads), [leads])
  const statusCount = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, leads.filter(l => l.status === s).length])) as Record<LeadStatus, number>, [leads])
  const staleCount = useMemo(() => leads.filter(l => isStale(l)).length, [leads])
  const originCount = useMemo(() => ({ meta: leads.filter(l => leadOrigin(l) === 'meta').length, manual: leads.filter(l => leadOrigin(l) === 'manual').length }), [leads])
  const shownCount = useMemo(() => applyFilters(leads, value).length, [leads, value])
  const set = (patch: Partial<LeadFilters>) => onChange({ ...value, ...patch })
  const S = (k: string) => ({ open: sec === k, onToggle: () => setSec(sec === k ? null : k) })

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button type="button" className={`btn btn-sm ${n ? 'btn-soft' : 'btn-outline'}`} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog">
        <SlidersHorizontal size={15} strokeWidth={1.75} /> Filtros <Badge n={n} />
      </button>
      {open && (
        <div role="dialog" aria-label="Filtros de leads" className="popover" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 1000, width: 340, maxWidth: 'calc(100vw - 32px)', maxHeight: 'min(72vh, 620px)', overflowY: 'auto', padding: '10px 14px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
            <strong style={{ fontSize: 16 }}>Filtros</strong>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange(EMPTY_FILTERS)} disabled={!n}><X size={14} strokeWidth={1.75} /> Limpar</button>
          </div>

          <Section title="Status" count={value.status.length + (value.stale ? 1 : 0)} {...S('status')}>
            {STATUSES.map(s => <Check key={s} label={s} count={statusCount[s]} checked={value.status.includes(s)} onChange={() => set({ status: toggle(value.status, s) })} />)}
            <Check label="Sem contato (parados)" count={staleCount} checked={value.stale} onChange={() => set({ stale: !value.stale })} />
          </Section>

          <Section title="Data" count={value.period !== 'all' ? 1 : 0} {...S('data')}>
            {PERIODS.map(([p, l]) => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="lead-period" checked={value.period === p} onChange={() => set({ period: p })} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} /> {l}
              </label>
            ))}
            {value.period === 'custom' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, minWidth: 110 }}>De<input type="date" className="field" style={{ height: 34, fontSize: 12 }} value={value.from} max={value.to || undefined} onChange={e => set({ from: e.target.value })} /></label>
                <label style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, minWidth: 110 }}>Até<input type="date" className="field" style={{ height: 34, fontSize: 12 }} value={value.to} min={value.from || undefined} onChange={e => set({ to: e.target.value })} /></label>
              </div>
            )}
          </Section>

          <Section title="Campanha" count={value.campanhas.length} {...S('campanha')}><Options label="campanha" items={fx.campanhas} selected={value.campanhas} onToggle={v => set({ campanhas: toggle(value.campanhas, v) })} /></Section>
          <Section title="Conjunto" count={value.conjuntos.length} {...S('conjunto')}><Options label="conjunto" items={fx.conjuntos} selected={value.conjuntos} onToggle={v => set({ conjuntos: toggle(value.conjuntos, v) })} /></Section>
          <Section title="Anúncio" count={value.anuncios.length} {...S('anuncio')}><Options label="anúncio" items={fx.anuncios} selected={value.anuncios} onToggle={v => set({ anuncios: toggle(value.anuncios, v) })} /></Section>
          <Section title="DDD" count={value.ddds.length} {...S('ddd')}><Options label="DDD" items={fx.ddds} selected={value.ddds} onToggle={v => set({ ddds: toggle(value.ddds, v) })} /></Section>
          <Section title="Atendido por" count={value.atendentes.length} {...S('atendente')}><Options label="atendente" items={fx.atendentes} selected={value.atendentes} onToggle={v => set({ atendentes: toggle(value.atendentes, v) })} /></Section>
          <Section title="Origem do lead" count={value.origem.length} {...S('origem')}>
            <Check label="Formulário da Meta" count={originCount.meta} checked={value.origem.includes('meta')} onChange={() => set({ origem: toggle(value.origem, 'meta') })} />
            <Check label="Cadastrado à mão" count={originCount.manual} checked={value.origem.includes('manual')} onChange={() => set({ origem: toggle(value.origem, 'manual') })} />
          </Section>

          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '8px 4px 6px' }} aria-live="polite">{shownCount} de {leads.length} leads</p>
        </div>
      )}
    </div>
  )
}

/** Filtros ativos como etiquetas que se removem com um clique. */
export function ActiveFilterChips({ value, onChange }: { value: LeadFilters; onChange: (f: LeadFilters) => void }) {
  const chips: Array<{ key: string; label: string; clear: () => void }> = [
    ...value.status.map(s => ({ key: `s:${s}`, label: s, clear: () => onChange({ ...value, status: value.status.filter(x => x !== s) }) })),
    ...(value.stale ? [{ key: 'stale', label: 'Sem contato', clear: () => onChange({ ...value, stale: false }) }] : []),
    ...(value.period !== 'all' ? [{ key: 'p', label: value.period === 'custom' ? `${value.from || '…'} a ${value.to || '…'}` : (PERIODS.find(p => p[0] === value.period)?.[1] ?? ''), clear: () => onChange({ ...value, period: 'all', from: '', to: '' }) }] : []),
    ...value.campanhas.map(v => ({ key: `c:${v}`, label: v, clear: () => onChange({ ...value, campanhas: value.campanhas.filter(x => x !== v) }) })),
    ...value.conjuntos.map(v => ({ key: `j:${v}`, label: v, clear: () => onChange({ ...value, conjuntos: value.conjuntos.filter(x => x !== v) }) })),
    ...value.anuncios.map(v => ({ key: `a:${v}`, label: v, clear: () => onChange({ ...value, anuncios: value.anuncios.filter(x => x !== v) }) })),
    ...value.ddds.map(v => ({ key: `d:${v}`, label: `DDD ${v}`, clear: () => onChange({ ...value, ddds: value.ddds.filter(x => x !== v) }) })),
    ...value.atendentes.map(v => ({ key: `t:${v}`, label: v, clear: () => onChange({ ...value, atendentes: value.atendentes.filter(x => x !== v) }) })),
    ...value.origem.map(v => ({ key: `o:${v}`, label: v === 'meta' ? 'Formulário da Meta' : 'Cadastrado à mão', clear: () => onChange({ ...value, origem: value.origem.filter(x => x !== v) }) })),
  ]
  if (!chips.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 12px', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border-soft)' }}>
      {chips.map(c => (
        <button key={c.key} type="button" onClick={c.clear} title="Remover filtro" className="pill-btn" aria-pressed="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 260 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span><X size={12} strokeWidth={2} />
        </button>
      ))}
    </div>
  )
}
