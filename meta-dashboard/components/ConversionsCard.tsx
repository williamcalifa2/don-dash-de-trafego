'use client'

import { useState } from 'react'
import type { ConversionItem } from '@/lib/meta'

const brl = (v: number, currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const num = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v))

/** Pílulas com TODAS as conversões e ações de uma campanha (nada fica de fora). Personalizadas em destaque. */
export function ConversionChips({ items, currency, limit = 12 }: { items: ConversionItem[]; currency: string; limit?: number }) {
  const [all, setAll] = useState(false)
  if (!items.length) return <div style={{ padding: '12px 24px', fontSize: 12, color: 'var(--text-3)' }}>Nenhuma conversão registrada neste período.</div>
  const shown = all ? items : items.slice(0, limit)
  return (
    <div style={{ padding: '12px 24px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-3)', marginRight: 4 }}>Conversões e ações</span>
      {shown.map(c => (
        <span key={c.type} title={c.cost != null ? `${c.label}: ${num(c.value)} · ${brl(c.cost, currency)} por ação` : c.label}
          style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '3px 10px', borderRadius: 999, fontSize: 12, background: c.custom ? 'var(--accent-soft)' : 'var(--bg-card2)', color: 'var(--text-1)', border: c.custom ? '1px solid var(--accent-glow)' : '1px solid transparent' }}>
          <span>{c.label}</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{num(c.value)}</strong>
          {c.cost != null && <span style={{ color: 'var(--text-3)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{brl(c.cost, currency)}</span>}
        </span>
      ))}
      {items.length > limit && (
        <button type="button" onClick={() => setAll(v => !v)} style={{ padding: 0, background: 'none', border: 'none', fontSize: 12, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {all ? 'ver menos' : `ver todas (${items.length})`}
        </button>
      )}
    </div>
  )
}
