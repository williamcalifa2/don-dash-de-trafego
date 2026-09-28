'use client'

import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { useFastTip } from './FastTip'
import { ListCard, PagedRows, RankRow, SubTabs, Thumb } from './UsageUi'

export interface JItem { managerAvatar?: string | null; clientLogo?: string | null; managerId: string; managerName: string; clientName: string; headline: string; at: string; reasons: string[]; reason: string | null; reasonedAt: string | null }

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000))
const when = (iso: string) => { const d = days(iso); return d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} d` }
const none = (t: string) => <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>{t}</p>

function HeadlineSummary({ headline }: { headline: string }) {
  const [expanded, setExpanded] = useState(false)
  const tip = useFastTip()
  const lines = headline.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length <= 1) {
    return <span style={{ whiteSpace: 'normal', fontWeight: 500 }}>{lines[0] || headline}</span>
  }
  const first = lines[0]
  const rest = lines.slice(1)
  const restTooltip = rest.join('\n')

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 500 }}>{first}</span>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            setExpanded(x => !x)
          }}
          {...(!expanded ? tip.bind(restTooltip) : {})}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 11,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 999,
            background: 'var(--bg-card2, rgba(255,255,255,0.08))',
            color: 'var(--accent, #6366f1)',
            border: '1px solid var(--border-soft, rgba(255,255,255,0.12))',
            cursor: 'pointer',
            lineHeight: 1.4,
          }}
        >
          {expanded ? 'recolher' : `+${rest.length} ${rest.length === 1 ? 'outra ação' : 'outras ações'}`}
        </button>
      </div>
      {expanded && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', paddingLeft: 8, borderLeft: '2px solid var(--accent, #6366f1)', display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
          {rest.map((r, idx) => (
            <span key={idx}>{r}</span>
          ))}
        </div>
      )}
      {tip.node}
    </div>
  )
}

/** Otimizações de todos os gestores numa lista só: as sem motivo (e há quantos dias esperam) e o motivo que cada um informou. */
export function JustificationsCard({ data, onOpen }: { data: { answered: JItem[]; pending: JItem[] }; onOpen: (managerId: string) => void }) {
  const [tab, setTab] = useState<'pending' | 'answered'>('pending')
  const list = data[tab]
  return (
    <ListCard icon={<ClipboardCheck size={18} strokeWidth={1.75} />} title="Otimizações" hint={tab === 'pending' ? 'Ainda sem motivo, das mais antigas' : 'Com o motivo que cada gestor informou, das mais recentes'}
      right={<SubTabs value={tab} onChange={setTab} tabs={[{ key: 'pending', label: `Sem motivo (${data.pending.length})` }, { key: 'answered', label: 'Com motivo' }]} />}>
      <PagedRows size={5} empty={none(tab === 'pending' ? 'Nenhuma otimização sem motivo.' : 'Nenhuma otimização com motivo ainda.')}
        rows={list.map((j, i) => (
          <RankRow key={`${j.managerId}-${j.at}-${i}`} wrap lead={<Thumb name={j.clientName} src={j.clientLogo} />} title={<HeadlineSummary headline={j.headline} />} valueTone="plain" chevron onClick={() => onOpen(j.managerId)}
            sub={<>{j.managerName} · {j.clientName}{tab === 'answered' && (j.reasons.length || j.reason) ? <><br />{[...j.reasons, ...(j.reason ? [`“${j.reason}”`] : [])].join(' · ')}</> : null}</>}
            value={tab === 'pending'
              ? <span style={{ color: days(j.at) >= 3 ? 'var(--red)' : 'var(--amber)' }}>{when(j.at)}</span>
              : when(j.reasonedAt ?? j.at)} />
        ))} />
    </ListCard>
  )
}
