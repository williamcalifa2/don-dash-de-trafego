'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Layers, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { UsageType } from '@/lib/metaUsage'
import { StaffShell } from './StaffShell'
import { ProfileMenu } from './ProfileMenu'
import { PulseLoader } from './PulseLoader'
import { MetricTile } from './MetricTile'
import { ChartCard, DonutChart, paletteAt, type Slice } from './Donut'
import { ListCard, PagedRows, RankRow, SubTabs, Thumb } from './UsageUi'

interface Data {
  setup: 'ready' | 'sql' | 'error'; hours: number; cap: number; calls: number; rateLimitErrors: number; peakAppPct: number; peakAccountPct: number
  byType: Array<{ type: UsageType; label: string; calls: number }>
  byClient: Array<{ clientId: string; name: string; logoUrl: string | null; calls: number }>
}

/** Quanto do app está sendo gasto na Meta, e em quê. */
export function MetaUsage() {
  const [win, setWin] = useState<'1h' | '24h'>('1h')
  const [d, setD] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setBusy(true)
    try { const r = await apiFetch(`/api/admin/meta/usage?window=${win}`, { cache: 'no-store' }); setD(r.ok ? await r.json() as Data : { setup: 'error' } as Data) } catch { setD({ setup: 'error' } as Data) } finally { setBusy(false) }
  }, [win])
  useEffect(() => { setD(null); void load() }, [load])

  const pct = d?.setup === 'ready' && d.hours === 1 ? Math.round((d.calls / d.cap) * 100) : null
  const slices: Slice[] = (d?.byType ?? []).map((t, i) => ({ key: t.type, label: t.label, value: t.calls, color: paletteAt(i) }))
  return (
    <StaffShell>
      <main className="page page-ready">
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Consumo da Meta</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Chamadas à API e onde elas são gastas</p>
          </div>
          <SubTabs value={win} onChange={setWin} tabs={[{ key: '1h', label: 'Última hora' }, { key: '24h', label: '24 horas' }]} />
          <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={load} disabled={busy} aria-label="Atualizar"><RefreshCw size={16} strokeWidth={1.75} className={busy ? 'spin' : undefined} /></button>
          <ProfileMenu />
        </header>

        {!d && <PulseLoader size={44} />}
        {d?.setup === 'sql' && <div className="card" style={{ padding: 24 }}>Rode o SQL <code>supabase/2026-09-meta-sync.sql</code> no Supabase para registrar o consumo.</div>}
        {d?.setup === 'error' && <div className="card" style={{ padding: 24, color: 'var(--text-2)' }}>Não foi possível carregar agora.</div>}
        {d?.setup === 'ready' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <MetricTile label={d.hours === 1 ? `Chamadas (teto ${d.cap})` : 'Chamadas'} value={pct == null ? String(d.calls) : `${d.calls} · ${pct}%`} />
              <MetricTile label="Uso do app na Meta" value={`${Math.round(d.peakAppPct)}%`} />
              <MetricTile label="Uso da conta na Meta" value={`${Math.round(d.peakAccountPct)}%`} />
              <MetricTile label="Bloqueios da Meta" value={String(d.rateLimitErrors)} />
            </div>
            <div className="usage-grid">
              <ChartCard title="Por tipo de consulta">
                <DonutChart slices={slices} center={String(d.calls)} sub="chamadas" />
              </ChartCard>
              <ListCard icon={<Building2 size={18} strokeWidth={1.75} />} title="Por cliente" hint="Os que mais consomem">
                <PagedRows size={5} empty={<p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Nenhuma chamada no período.</p>}
                  rows={d.byClient.map(c => <RankRow key={c.clientId} lead={<Thumb name={c.name} src={c.logoUrl} />} title={c.name} value={c.calls} valueTone="plain" bar={(c.calls / Math.max(1, d.byClient[0].calls)) * 100} />)} />
              </ListCard>
              <ListCard icon={<Layers size={18} strokeWidth={1.75} />} title="Detalhe por tipo">
                <PagedRows size={6} empty={<p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>Nenhuma chamada no período.</p>}
                  rows={d.byType.map((t, i) => <RankRow key={t.type} lead={<span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 999, background: paletteAt(i), display: 'inline-block' }} />} title={t.label} value={t.calls} valueTone="plain" bar={(t.calls / Math.max(1, d.byType[0].calls)) * 100} />)} />
              </ListCard>
            </div>
          </div>
        )}
      </main>
    </StaffShell>
  )
}
