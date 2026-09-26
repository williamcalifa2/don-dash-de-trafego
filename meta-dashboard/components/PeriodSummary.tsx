'use client'

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { LEVELS, sumLevels, totalOf, type Counts } from '@/lib/periodSummary'
import type { RangePeriod } from '@/lib/usage'
import { useFastTip } from './FastTip'
import { ListCard, Thumb } from './UsageUi'

interface Row { id: string; name: string; img?: string | null; counts: Counts }
interface Data { setup: string; total?: Counts; byManager?: Array<{ id: string; name: string; avatarUrl: string | null; counts: Counts }>; byClient?: Array<{ slug: string; name: string; logoUrl: string | null; counts: Counts }> }

const COLS: Array<{ key: string; label: string; value: (c: Counts) => number; tip: (c: Counts) => string }> = [
  { key: 'criou', label: 'Criou', value: c => sumLevels(c.criou), tip: c => lv(c.criou) },
  { key: 'pausou', label: 'Pausou', value: c => sumLevels(c.pausou), tip: c => lv(c.pausou) },
  { key: 'ativou', label: 'Ativou', value: c => sumLevels(c.ativou), tip: c => lv(c.ativou) },
  { key: 'orcamento', label: 'Orçamentos', value: c => c.orcamento, tip: () => 'Orçamentos alterados' },
  { key: 'publico', label: 'Públicos', value: c => c.publico, tip: () => 'Públicos alterados' },
  { key: 'lance', label: 'Lances', value: c => c.lance, tip: () => 'Lances alterados' },
  { key: 'criativo', label: 'Criativos', value: c => c.criativo, tip: () => 'Criativos alterados' },
]
const PL: Record<string, [string, string]> = { campanha: ['campanha', 'campanhas'], conjunto: ['conjunto', 'conjuntos'], 'anúncio': ['anúncio', 'anúncios'] }
function lv(r: Record<(typeof LEVELS)[number], number>): string {
  const parts = LEVELS.filter(l => r[l] > 0).map(l => `${r[l]} ${PL[l][r[l] === 1 ? 0 : 1]}`)
  return parts.length ? parts.join(' · ') : 'Nenhum'
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 500, fontSize: 12, color: 'var(--text-2)', textAlign: 'right', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function Table({ rows, total, first }: { rows: Row[]; total: Counts; first: string }) {
  const tip = useFastTip()
  const cell = (c: Counts, col: (typeof COLS)[number], bold = false) => {
    const v = col.value(c)
    return <td key={col.key} {...(v > 0 ? tip.bind(`${col.label}: ${col.tip(c)}`) : {})} style={{ ...td, fontWeight: bold ? 700 : 500, color: v === 0 ? 'var(--text-3)' : 'var(--text-1)' }}>{v}</td>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr><th style={{ ...th, textAlign: 'left' }}>{first}</th>{COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
              <td style={{ padding: '10px', minWidth: 160 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Thumb name={r.name} src={r.img} size={28} /><span style={{ fontWeight: 600 }}>{r.name}</span></span></td>
              {COLS.map(c => cell(r.counts, c))}
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: '10px', fontWeight: 700 }}>Total</td>{COLS.map(c => cell(total, c, true))}</tr>
        </tbody>
      </table>
      {tip.node}
    </div>
  )
}

/** Resumo do período. Sem `manager`: uma linha por gestor. Com `manager`: uma linha por cliente. Passe o mouse num número para ver campanhas, conjuntos e anúncios. */
export function PeriodSummary({ period, manager, tick }: { period: RangePeriod; manager?: string; tick?: number }) {
  const [d, setD] = useState<Data | null>(null)
  useEffect(() => {
    let alive = true
    setD(null)
    apiFetch(`/api/admin/managers/summary?period=${period}${manager ? `&manager=${manager}` : ''}`, { cache: 'no-store' }).then(r => r.json()).then((j: Data) => { if (alive) setD(j) }).catch(() => { if (alive) setD({ setup: 'error' }) })
    return () => { alive = false }
  }, [period, manager, tick])

  const rows: Row[] = !d ? [] : manager ? (d.byClient ?? []).map(c => ({ id: c.slug, name: c.name, img: c.logoUrl, counts: c.counts })).sort((a, b) => totalOf(b.counts) - totalOf(a.counts)) : (d.byManager ?? []).map(m => ({ id: m.id, name: m.name, img: m.avatarUrl, counts: m.counts }))
  const empty = d?.total ? totalOf(d.total) === 0 : false
  return (
    <ListCard icon={<BarChart3 size={18} strokeWidth={1.75} />} title="Resumo do período" hint={manager ? 'O que ele fez em cada cliente' : 'O que cada gestor fez'}>
      {!d ? <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Carregando…</p>
        : d.setup !== 'ready' || !d.total ? <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Não foi possível carregar agora.</p>
        : empty ? <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Nenhuma otimização neste período.</p>
        : <Table rows={rows} total={d.total} first={manager ? 'Cliente' : 'Gestor'} />}
    </ListCard>
  )
}
