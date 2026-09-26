'use client'

import { useEffect, useState } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import type { AccessEntry } from '@/lib/visits'
import { ListCard, PagedRows, RankRow, Thumb } from './UsageUi'

export interface AccessItem extends AccessEntry { clientLogo?: string | null; clientName: string; managerId?: string | null; managerName?: string; managerAvatar?: string | null }
interface Data { setup: 'ready' | 'tables' | 'sql' | 'error'; days?: number; entries?: AccessItem[]; noEmail?: boolean }

const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 90 ? 'agora' : s < 3600 ? `há ${Math.round(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d` }
const none = (t: string) => <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>{t}</p>

/** Lista de acessos ao Gerenciador da Meta, no card de lista do painel. `manager` limita a um gestor; `own` mostra os do próprio usuário (página da extensão). */
export function AccessCard({ manager, own, onOpenManager }: { manager?: string; own?: boolean; onOpenManager?: (id: string) => void }) {
  const [d, setD] = useState<Data | null>(null)
  useEffect(() => {
    let alive = true
    const url = own ? '/api/admin/extension/visits' : `/api/admin/managers/visits?days=7${manager ? `&manager=${manager}` : ''}`
    const load = () => apiFetch(url, { cache: 'no-store' }).then(r => r.json()).then((j: Data) => { if (alive) setD(j) }).catch(() => { })
    void load()
    const t = setInterval(() => { if (!document.hidden) void load() }, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [manager, own])

  const entries = d?.entries ?? []
  const live = entries.filter(e => e.live).length
  const hint = d?.setup !== 'ready' ? 'Pela extensão do navegador' : live ? `${live} com a conta aberta agora · últimos 7 dias` : 'Contas abertas nos últimos 7 dias'
  return (
    <ListCard icon={<MonitorSmartphone size={18} strokeWidth={1.75} />} title="Acessos ao Gerenciador da Meta" hint={hint}>
      {!d ? none('Carregando…') : d.setup === 'sql' ? none('Rode o SQL supabase/2026-09-account-visits.sql no Supabase para começar a registrar.')
        : d.setup !== 'ready' ? none('Não foi possível carregar agora.')
        : d.noEmail ? none('Esse gestor não tem e-mail de login ligado, então não dá para saber quais contas ele abriu.')
        : (
          <PagedRows size={5} empty={none(own ? 'Ainda nenhum acesso registrado para você. Instale a extensão, abra o painel logado e depois uma conta de cliente no Gerenciador.' : 'Nenhum acesso registrado ainda. Os gestores precisam instalar a extensão (menu do perfil → Extensão do navegador).')}
            rows={entries.map(e => (
              <RankRow key={`${e.userKey}|${e.slug}`} lead={<Thumb name={e.clientName} src={e.clientLogo} />} title={e.clientName} valueTone="plain" chevron={!!(onOpenManager && e.managerId)}
                sub={<>{own || manager ? null : `${e.managerName} · `}{e.live ? 'Com a conta aberta agora' : `Última vez ${ago(e.lastAt)}`}</>}
                value={e.live ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />ao vivo</span> : undefined}
                onClick={onOpenManager && e.managerId ? () => onOpenManager(e.managerId!) : undefined} />
            ))} />
        )}
    </ListCard>
  )
}
