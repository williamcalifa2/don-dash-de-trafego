'use client'

import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { ListCard, PagedRows, RankRow, SubTabs, Thumb } from './UsageUi'

export interface JItem { managerAvatar?: string | null; clientLogo?: string | null; managerId: string; managerName: string; clientName: string; headline: string; at: string; reasons: string[]; reason: string | null; reasonedAt: string | null }

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000))
const when = (iso: string) => { const d = days(iso); return d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} d` }
const none = (t: string) => <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>{t}</p>

/** Otimizações de todos os gestores numa lista só: as sem motivo (e há quantos dias esperam) e o motivo que cada um informou. */
export function JustificationsCard({ data, onOpen }: { data: { answered: JItem[]; pending: JItem[] }; onOpen: (managerId: string) => void }) {
  const [tab, setTab] = useState<'pending' | 'answered'>('pending')
  const list = data[tab]
  return (
    <ListCard icon={<ClipboardCheck size={18} strokeWidth={1.75} />} title="Otimizações" hint={tab === 'pending' ? 'Ainda sem motivo, das mais antigas' : 'Com o motivo que cada gestor informou, das mais recentes'}
      right={<SubTabs value={tab} onChange={setTab} tabs={[{ key: 'pending', label: `Sem motivo (${data.pending.length})` }, { key: 'answered', label: 'Com motivo' }]} />}>
      <PagedRows size={5} empty={none(tab === 'pending' ? 'Nenhuma otimização sem motivo.' : 'Nenhuma otimização com motivo ainda.')}
        rows={list.map((j, i) => (
          <RankRow key={`${j.managerId}-${j.at}-${i}`} wrap lead={<Thumb name={j.clientName} src={j.clientLogo} />} title={j.headline} valueTone="plain" chevron onClick={() => onOpen(j.managerId)}
            sub={<>{j.managerName} · {j.clientName}{tab === 'answered' && (j.reasons.length || j.reason) ? <><br />{[...j.reasons, ...(j.reason ? [`“${j.reason}”`] : [])].join(' · ')}</> : null}</>}
            value={tab === 'pending'
              ? <span style={{ color: days(j.at) >= 3 ? 'var(--red)' : 'var(--amber)' }}>{when(j.at)}</span>
              : when(j.reasonedAt ?? j.at)} />
        ))} />
    </ListCard>
  )
}
