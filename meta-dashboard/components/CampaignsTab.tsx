'use client'

import { MetricTile } from './MetricTile'
import { PulseLoader } from '@/components/PulseLoader'
import { CampaignTable } from './CampaignTable'
import { CreativesSection } from './CreativesSection'
import { KIND_LABELS, type ResultKind } from '@/lib/resultKind'
import type { CampaignRow, DatePreset, MetricsSummary } from '@/lib/meta'

const nf = new Intl.NumberFormat('pt-BR')
const money = (v: number, currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 }).format(v)

interface Props {
  campaigns: CampaignRow[]
  summary: MetricsSummary | undefined
  summaryPrev: MetricsSummary | undefined
  currency: string
  kind: ResultKind
  preset: DatePreset
  presetLabel: string
  loading: boolean
}

/** Aba Campanhas: campanhas e criativos do tráfego pago numa página só, no mesmo estilo do Orgânico. */
export function CampaignsTab({ campaigns, summary, summaryPrev, currency, kind, preset, loading }: Props) {
  const L = KIND_LABELS[kind] ?? KIND_LABELS.misto
  const withSpend = campaigns.filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend)
  const totalSpend = withSpend.reduce((s, c) => s + c.spend, 0)
  const totalResults = withSpend.reduce((s, c) => s + (c.results || 0), 0)
  const costAll = totalResults > 0 ? totalSpend / totalResults : null
  const active = campaigns.filter(c => c.status === 'ACTIVE').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {loading && !campaigns.length ? <PulseLoader size={40} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="tile-grid stagger">
              <MetricTile label="Investido" value={money(totalSpend, currency)} currentRaw={summary?.spend} prevValue={summaryPrev?.spend} />
              <MetricTile label={L.many} value={nf.format(totalResults)} currentRaw={summary?.results} prevValue={summaryPrev?.results} />
              <MetricTile label={L.costFull} value={costAll != null ? money(costAll, currency) : '—'} currentRaw={summary?.cost_per_result ?? undefined} prevValue={summaryPrev?.cost_per_result ?? undefined} lowerIsBetter />
              <MetricTile label="Campanhas ativas" value={String(active)} note={`${withSpend.length} com investimento`} />
            </div>

            {campaigns.length > 0 && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <CampaignTable campaigns={campaigns} currency={currency} datePreset={preset} kind={kind} />
              </div>
            )}
          </div>
      )}

      <div style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>Criativos</h2>
        <CreativesSection preset={preset} kind={kind} currency={currency} />
      </div>
    </div>
  )
}
