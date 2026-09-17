'use client'

import type { CampaignRow } from '@/lib/meta'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:      { label: 'Ativo',       color: 'var(--green)',  bg: 'rgba(34,197,94,.10)' },
  PAUSED:      { label: 'Pausado',     color: 'var(--red)',    bg: 'rgba(239,68,68,.10)' },
  DELETED:     { label: 'Deletado',    color: 'var(--red)',    bg: 'rgba(239,68,68,.10)' },
  ARCHIVED:    { label: 'Arquivado',   color: 'var(--text-3)', bg: 'var(--bg-card2)' },
  IN_PROCESS:  { label: 'Aprendizado', color: 'var(--amber)',  bg: 'rgba(245,158,11,.10)' },
  WITH_ISSUES: { label: 'Com erros',   color: 'var(--amber)',  bg: 'rgba(245,158,11,.10)' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'var(--text-2)', bg: 'var(--bg-card2)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, color: s.color, background: s.bg }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function fmt(v: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(v)
}

interface CampaignTableProps {
  campaigns: CampaignRow[]
  currency: string
}

export function CampaignTable({ campaigns, currency }: CampaignTableProps) {
  if (!campaigns.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        Nenhuma campanha encontrada no período.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
        <thead>
          <tr>
            {['Campanha', 'Status', 'Investido', 'Leads', 'CPL', 'ROAS', 'CTR', 'Frequência'].map((h, i) => (
              <th key={h} style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                color: 'var(--text-3)', padding: '8px 12px',
                textAlign: i > 1 ? 'right' : 'left',
                borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id}
              onMouseEnter={(e) => {
                const cells = (e.currentTarget as HTMLTableRowElement).querySelectorAll('td')
                cells.forEach((td) => ((td as HTMLElement).style.background = 'var(--accent-soft)'))
              }}
              onMouseLeave={(e) => {
                const cells = (e.currentTarget as HTMLTableRowElement).querySelectorAll('td')
                cells.forEach((td) => ((td as HTMLElement).style.background = ''))
              }}
            >
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-1)', fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-soft)' }}>
                <StatusBadge status={c.status} />
              </td>
              <Num>{fmt(c.spend, currency)}</Num>
              <Num>{c.leads || '—'}</Num>
              <Num color={c.cpl && c.cpl > 120 ? 'var(--red)' : undefined}>
                {c.cpl ? fmt(c.cpl, currency) : '—'}
              </Num>
              <Num color={c.roas && c.roas >= 3 ? 'var(--green)' : c.roas && c.roas < 1.5 ? 'var(--red)' : undefined}>
                {c.roas ? `${c.roas.toFixed(1)}x` : '—'}
              </Num>
              <Num>{c.ctr.toFixed(2)}%</Num>
              <Num>{c.frequency.toFixed(1)}</Num>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Num({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <td style={{
      padding: '10px 12px', borderBottom: '1px solid var(--border-soft)',
      color: color ?? 'var(--text-2)',
      fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'right',
    }}>
      {children}
    </td>
  )
}
