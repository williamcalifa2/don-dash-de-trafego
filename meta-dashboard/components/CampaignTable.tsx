'use client'

import { useState } from 'react'
import type { CampaignRow } from '@/lib/meta'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:      { label: 'Ativo',       color: 'var(--green)'  },
  PAUSED:      { label: 'Pausado',     color: 'var(--text-3)' },
  DELETED:     { label: 'Deletado',    color: 'var(--red)'    },
  ARCHIVED:    { label: 'Arquivado',   color: 'var(--text-3)' },
  IN_PROCESS:  { label: 'Aprendizado', color: 'var(--amber)'  },
  WITH_ISSUES: { label: 'Com erros',   color: 'var(--amber)'  },
}

function StatusDot({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'var(--text-3)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: s.color, fontFamily: 'var(--font)', letterSpacing: '.04em' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0, boxShadow: status === 'ACTIVE' ? '0 0 6px currentColor' : 'none' }} />
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
  const [hovered, setHovered] = useState<string | null>(null)

  if (!campaigns.length) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase' }}>
        Nenhuma campanha no período
      </div>
    )
  }

  const cols = ['Campanha', 'Status', 'Investido', 'Leads', 'CPL', 'ROAS', 'CTR', 'Freq.']

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
        <thead>
          <tr>
            {cols.map((h, i) => (
              <th key={h} style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
                padding: '10px 16px',
                textAlign: i > 1 ? 'right' : 'left',
                borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--font)',
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const isHov = hovered === c.id
            return (
              <tr
                key={c.id}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ background: isHov ? 'var(--bg-hover)' : 'transparent', transition: 'background .1s' }}
              >
                <td style={{
                  padding: '11px 16px',
                  borderBottom: '1px solid var(--border-soft)',
                  color: 'var(--text-1)',
                  fontWeight: 500,
                  maxWidth: 260,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  borderLeft: isHov ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'border-color .1s',
                }}>
                  {c.name}
                </td>
                <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--border-soft)' }}>
                  <StatusDot status={c.status} />
                </td>
                <Num>{fmt(c.spend, currency)}</Num>
                <Num>{c.leads || '—'}</Num>
                <Num color={c.cpl && c.cpl > 120 ? 'var(--red)' : undefined}>
                  {c.cpl ? fmt(c.cpl, currency) : '—'}
                </Num>
                <Num color={c.roas ? (c.roas >= 3 ? 'var(--green)' : c.roas < 1.5 ? 'var(--red)' : undefined) : undefined}>
                  {c.roas ? `${c.roas.toFixed(1)}×` : '—'}
                </Num>
                <Num>{c.ctr.toFixed(2)}%</Num>
                <Num>{c.frequency.toFixed(1)}</Num>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Num({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <td style={{
      padding: '11px 16px',
      borderBottom: '1px solid var(--border-soft)',
      color: color ?? 'var(--text-2)',
      fontFamily: 'var(--mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: 12,
      textAlign: 'right',
    }}>
      {children}
    </td>
  )
}
