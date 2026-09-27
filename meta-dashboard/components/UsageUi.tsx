'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFastTip } from './FastTip'
import { useAnchoredPopover } from '@/lib/useAnchoredPopover'
import { CalendarDays, Check, ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { fmtDuration } from '@/lib/usage'

/** Peças visuais das páginas Uso do app e Heatmap, no mesmo desenho dos cards do E-commerce: título com ícone, linhas com barra e valor à direita. */

export type Period = 'today' | '7' | '30'
export const PERIODS: Array<[Period, string]> = [['today', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']]

const usePopover = () => useAnchoredPopover(6)

/** Botão com o ícone de calendário: mostra o período e abre a lista. */
export function PeriodPicker<T extends string = Period>({ value, onChange, options }: { value: T; onChange: (p: T) => void; /** lista própria de períodos (padrão: hoje, 7 e 30 dias) */ options?: Array<[T, string]> }) {
  const { pos, close, toggle, menuRef } = usePopover()
  const list = (options ?? PERIODS) as Array<[T, string]>
  const current = list.find(p => p[0] === value) ?? list[0]
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" aria-haspopup="listbox" aria-expanded={!!pos} aria-label={`Período: ${current[1]}`} onClick={toggle}>
        <CalendarDays size={16} strokeWidth={1.75} /> {current[1]} <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={close} data-hm-ignore />
          <div ref={menuRef} className="popover" role="listbox" aria-label="Período" data-hm-ignore style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, minWidth: 160 }}>
            {list.map(([k, l]) => (
              <div key={k} role="option" aria-selected={k === value} tabIndex={0} className="popover-item" style={k === value ? { background: 'var(--accent-soft)' } : undefined}
                onClick={() => { close(); onChange(k) }} onKeyDown={e => { if (e.key === 'Enter') { close(); onChange(k) } }}>
                <span style={{ flex: 1 }}>{l}</span>{k === value && <Check size={14} strokeWidth={1.75} color="var(--accent)" />}
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

/** Botão só com o ícone de filtro; o número mostra quantos filtros estão ligados. Os campos ficam dentro do popover. */
export function FilterPicker({ active, onClear, children }: { active: number; onClear: () => void; children: React.ReactNode }) {
  const { pos, close, toggle, menuRef } = usePopover()
  return (
    <>
      <button type="button" className="btn btn-outline btn-icon btn-sm" aria-haspopup="dialog" aria-expanded={!!pos} aria-label={active ? `Filtros (${active} ligados)` : 'Filtros'} title="Filtros" onClick={toggle} style={{ position: 'relative', borderColor: active ? 'var(--accent)' : undefined }}>
        <Filter size={16} strokeWidth={1.75} color={active ? 'var(--accent)' : undefined} />
        {active > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 9999, background: 'var(--accent-solid)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 4px' }}>{active}</span>}
      </button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={close} data-hm-ignore />
          <div ref={menuRef} className="popover filter-pop" role="dialog" aria-label="Filtros" data-hm-ignore style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000, width: 280, maxWidth: 'calc(100vw - 16px)', padding: 16, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Filtros</span>
              {active > 0 && <button type="button" onClick={() => { onClear(); close() }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Limpar filtros</button>}
            </div>
            {children}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{label}{children}</label>
}

/** Card de lista: título com ícone colorido à esquerda e ação opcional à direita, como "Produtos mais vendidos". */
export function ListCard({ icon, tone = 'accent', title, hint, right, children }: { icon: React.ReactNode; tone?: 'accent' | 'green'; title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', color: tone === 'green' ? 'var(--green)' : 'var(--accent)', flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>
            {hint && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>{hint}</p>}
          </div>
        </div>
        {right}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </section>
  )
}

/** Uma linha do card: miniatura, nome e apoio; valor em destaque à direita; barra proporcional embaixo. */
export function RankRow({ lead, title, sub, value, valueTone = 'green', bar, extra, onClick, active, chevron, wrap }: {
  lead?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; valueTone?: 'green' | 'accent' | 'plain'
  bar?: number; extra?: React.ReactNode; onClick?: () => void; active?: boolean; chevron?: boolean; /** deixa o título quebrar em mais de uma linha */ wrap?: boolean
}) {
  const body = (
    <>
      {lead}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', ...(wrap ? { overflowWrap: 'anywhere' } : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>{title}</span>
            {sub && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{sub}</span>}
          </span>
          {value != null && <span style={{ fontSize: 14, fontWeight: 700, color: valueTone === 'green' ? 'var(--green)' : valueTone === 'accent' ? 'var(--accent)' : 'var(--text-1)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</span>}
        </span>
        {bar != null && <span aria-hidden="true" style={{ display: 'block', height: 6, borderRadius: 9999, background: 'var(--bg-card2)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.max(2, Math.min(100, bar))}%`, height: '100%', background: 'var(--accent)', borderRadius: 9999 }} /></span>}
        {extra}
      </span>
      {chevron && <ChevronRight size={16} color="var(--text-3)" aria-hidden="true" style={{ flexShrink: 0 }} />}
    </>
  )
  const box: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`, background: active ? 'var(--accent-soft)' : 'transparent', color: 'inherit', font: 'inherit' }
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={active} style={{ ...box, cursor: 'pointer' }}>{body}</button>
    : <div style={box}>{body}</div>
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'

/** Miniatura redonda com a foto ou as iniciais (pessoa), ou quadrada com ícone (tela). */
export function Thumb({ name, icon, src, size = 40 }: { name?: string; icon?: React.ReactNode; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--accent-soft)' }} />
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: icon ? 12 : '50%', background: 'var(--accent-soft)', color: icon ? 'var(--accent)' : 'var(--text-1)', display: 'grid', placeItems: 'center', fontSize: Math.max(11, Math.round(size * 0.33)), fontWeight: 700, flexShrink: 0 }}>{icon ?? initials(name ?? '')}</span>
  )
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
export const dur = fmtDuration

/** Abas em cápsula pequenas, as mesmas dos filtros do Report Studio (pill-btn). */
export function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: string }>; value: T; onChange: (k: T) => void }) {
  return (
    <div role="group" aria-label="Seções" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {tabs.map(t => <button key={t.key} type="button" className="pill-btn" aria-pressed={t.key === value} onClick={() => onChange(t.key)}>{t.label}</button>)}
    </div>
  )
}

/** Bolinhas de página, no rodapé do card: cada página mostra 5 linhas e as bolinhas levam ao resto. */
export function Pager({ pages, page, onChange }: { pages: number; page: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div role="group" aria-label="Páginas" style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 4 }}>
      {Array.from({ length: pages }, (_, i) => (
        <button key={i} type="button" onClick={() => onChange(i)} aria-label={`Página ${i + 1} de ${pages}`} aria-current={i === page}
          style={{ width: 8, height: 8, padding: 0, borderRadius: '50%', border: 0, cursor: 'pointer', background: i === page ? 'var(--accent)' : 'var(--border)', transition: 'background .2s' }} />
      ))}
    </div>
  )
}

/** Mostra a lista em páginas de `size` linhas, com as bolinhas embaixo. */
export function PagedRows({ rows, size = 5, empty }: { rows: React.ReactNode[]; size?: number; empty?: React.ReactNode }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const cur = Math.min(page, pages - 1)
  if (!rows.length) return <>{empty}</>
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{rows.slice(cur * size, cur * size + size)}</div>
      <div style={{ marginTop: 'auto' }}><Pager pages={pages} page={cur} onChange={setPage} /></div>
    </>
  )
}

/** Gráfico de barras simples: a maior barra em destaque, rótulos só em alguns pontos para não poluir. */
export function BarChart({ bars, labelEvery, height = 132, summary }: { bars: Array<{ label: string; value: number; title: string }>; labelEvery: number; height?: number; summary: string }) {
  const max = Math.max(1, ...bars.map(b => b.value))
  const top = bars.reduce((m, b, i) => (b.value > bars[m].value ? i : m), 0)
  const gap = bars.length > 16 ? 3 : 6
  const tip = useFastTip()
  return (
    <div role="img" aria-label={summary} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height }}>
        {bars.map((b, i) => (
          <div key={i} {...tip.bind(b.title)} style={{ flex: 1, minWidth: 0, height: `${Math.max(b.value > 0 ? 4 : 2, Math.round((b.value / max) * 100))}%`, borderRadius: '4px 4px 2px 2px', background: b.value > 0 ? 'var(--accent)' : 'var(--bg-card2)', opacity: b.value > 0 && i !== top ? 0.5 : 1 }} />
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap }}>
        {bars.map((b, i) => <span key={i} style={{ flex: 1, minWidth: 0, fontSize: 10, color: 'var(--text-3)', textAlign: 'center', whiteSpace: 'nowrap' }}>{i % labelEvery === 0 ? b.label : ''}</span>)}
      </div>
      {tip.node}
    </div>
  )
}
