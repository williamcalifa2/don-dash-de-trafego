'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { STALLED_DAYS, type StalledBy, type StalledRow } from '@/lib/stalled'
import { FilterField, FilterPicker, ListCard, PagedRows, RankRow, Thumb } from './UsageUi'

interface Data { setup: 'ready' | 'tables'; rows: Array<StalledRow & { clientLogo?: string | null }>; byManager: Array<{ id: string; name: string; n: number }>; lookbackDays: number }

const BY: Array<[StalledBy, string]> = [['any', 'Sem ação e sem abrir'], ['action', 'Sem ação'], ['access', 'Sem abrir (painel ou Gerenciador)']]
const DEFAULT_DAYS = 3
const dias = (d: number | null) => (d == null ? 'nunca' : d === 0 ? 'hoje' : `há ${d} d`)

/** Contas sem movimento, em card de lista paginado. O filtro (critério e dias) fica num botão, fora da vista. */
export function StalledAccounts({ onOpenManager }: { onOpenManager: (id: string) => void }) {
  const [days, setDays] = useState<number>(DEFAULT_DAYS)
  const [by, setBy] = useState<StalledBy>('any')
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch(`/api/admin/managers/stalled?days=${days}&by=${by}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject())).then((j: Data) => { if (alive) setData(j) })
      .catch(() => { })
    return () => { alive = false }
  }, [days, by])

  if (!data || data.setup !== 'ready') return null
  const n = data.rows.length
  const filters = (days !== DEFAULT_DAYS ? 1 : 0) + (by !== 'any' ? 1 : 0)
  const who = data.byManager.map(m => `${m.name} (${m.n})`).join(', ')

  return (
    <ListCard icon={<AlertTriangle size={18} strokeWidth={1.75} />} title="Contas sem movimento"
      hint={n ? `${n} ${n === 1 ? 'conta' : 'contas'} há ${days}+ dias · ${who}` : `Nenhuma conta parada há ${days}+ dias`}
      right={
        <FilterPicker active={filters} onClear={() => { setDays(DEFAULT_DAYS); setBy('any') }}>
          <FilterField label="O que conta como parada">
            <select className="field" value={by} onChange={e => setBy(e.target.value as StalledBy)}>{BY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </FilterField>
          <FilterField label="Há quantos dias">
            <select className="field" value={days} onChange={e => setDays(Number(e.target.value))}>{STALLED_DAYS.map(d => <option key={d} value={d}>{d} dias ou mais</option>)}</select>
          </FilterField>
        </FilterPicker>
      }>
      <PagedRows size={5} empty={<p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Todas as contas tiveram movimento recente.</p>}
        rows={data.rows.map(r => (
          <RankRow key={`${r.managerId}|${r.slug}`} lead={<Thumb name={r.clientName} src={r.clientLogo} />} title={r.clientName} valueTone="plain" chevron
            sub={<>{r.managerName}<br />Última ação {r.daysAction == null ? `nenhuma em ${data.lookbackDays} d` : dias(r.daysAction)} · Acesso {r.accessUnknown ? 'sem e-mail ligado' : r.daysAccess == null ? `nenhum em ${data.lookbackDays} d` : dias(r.daysAccess)}</>}
            value={<span style={{ color: (r.daysIdle ?? 99) >= 7 ? 'var(--red)' : 'var(--amber)' }}>{r.daysIdle == null ? '—' : `${r.daysIdle} d`}</span>}
            onClick={() => onOpenManager(r.managerId)} />
        ))} />
    </ListCard>
  )
}
