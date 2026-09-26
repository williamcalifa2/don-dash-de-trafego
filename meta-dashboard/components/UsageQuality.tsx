'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Flame, Gauge, MousePointerClick, MoveVertical, OctagonAlert } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { viewLabel } from '@/lib/usage'
import { SLOW_MS, type ErrorGroup, type Friction, type Frustrated, type PerfRow, type ScrollRow } from '@/lib/usageQuality'
import { MetricTile } from './MetricTile'
import { PulseLoader } from './PulseLoader'
import { ListCard, PagedRows, RankRow, Thumb, plural } from './UsageUi'

interface Quality {
  setup: 'ready' | 'events' | 'error'
  rage: Array<Friction & { who: Array<{ userKey: string; n: number; name: string }> }>; dead: Array<Friction & { who: Array<{ userKey: string; n: number; name: string }> }>
  people: Array<Frustrated & { name: string; photo?: string | null }>
  errors: Array<ErrorGroup & { lastUserName: string; lastClientName: string }>
  perf: PerfRow[]; scroll: ScrollRow[]
  totals: { rage: number; dead: number; errors: number; sessions: number }
}

const secs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`)
const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `há ${s}s` : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d` }
const none = (t: string) => <p style={{ margin: 0, padding: '4px 12px', fontSize: 13, color: 'var(--text-2)' }}>{t}</p>
const good = 'var(--green)', bad = 'var(--red)'

/** Aba "Qualidade" do Uso do app: onde a experiência falha (raiva, mortos, erros), quão rápido as telas carregam e até onde as pessoas rolam. */
export function UsageQuality({ period, client, user, onUser }: { period: string; client: string; user: string; onUser?: (userKey: string) => void }) {
  const [data, setData] = useState<Quality | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setData(null); setFailed(false)
    const q = new URLSearchParams({ period })
    if (client) q.set('client', client)
    if (user) q.set('user', user)
    apiFetch(`/api/admin/usage/quality?${q.toString()}`, { cache: 'no-store' }).then(r => r.json()).then((j: Quality) => { if (alive) setData(j) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [period, client, user])

  if (failed) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar agora. Tente de novo em instantes.</div>
  if (!data) return <PulseLoader size={44} />
  if (data.setup === 'events') return <div className="card" style={{ padding: 24, fontSize: 14 }}>O banco ainda não tem a tabela de sinais de qualidade. Rode o SQL <code>supabase/2026-09-usage-analytics-3.sql</code> no Supabase e recarregue a página.</div>
  if (data.setup !== 'ready') return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar agora. Tente de novo em instantes.</div>

  const worst = data.perf[0]
  const maxPerf = Math.max(1, ...data.perf.map(p => p.p75))
  const who = (list: Array<{ name: string }>, users: number) => `${list.map(w => w.name).join(', ')}${users > list.length ? ` +${users - list.length}` : ''}`
  const frictionRows = (list: Quality['rage'], one: string, many: string) => list.map(f => (
    <RankRow key={`${f.view}|${f.sel}`} wrap lead={<Thumb icon={<MousePointerClick size={18} strokeWidth={1.75} />} />} title={f.label ?? (f.sel === 'body' ? 'Área da página' : 'Elemento sem nome')}
      sub={<>{viewLabel(f.view)} · {ago(f.last)}<br />{who(f.who, f.users)}</>}
      value={plural(f.clicks === f.events ? f.events : f.clicks, one, many)} valueTone="accent" />
  ))

  return (
    <>
      <div className="tile-grid stagger">
        <MetricTile label="Erros de tela" value={String(data.totals.errors)} />
        <MetricTile label="Cliques de raiva" value={String(data.totals.rage)} />
        <MetricTile label="Cliques mortos" value={String(data.totals.dead)} />
        <MetricTile label={worst ? `Mais lenta: ${viewLabel(worst.view)}` : 'Tela mais lenta'} value={worst ? secs(worst.p75) : '—'} />
      </div>
      <div className="usage-grid">
        <ListCard icon={<Flame size={18} strokeWidth={1.75} />} title="Quem mais passa raiva" hint="Pessoas que mais repetem cliques sem resposta ou clicam em botões que não funcionam. Clique para filtrar por ela">
          <PagedRows size={4} empty={none('Ninguém esbarrou em cliques de raiva ou mortos neste período.')} rows={data.people.map(p => (
            <RankRow key={p.userKey} lead={<Thumb name={p.name} src={p.photo} />} title={p.name}
              sub={<>{p.rage > 0 ? plural(p.rage, 'rajada de raiva', 'rajadas de raiva') : 'sem raiva'}{p.dead > 0 ? ` · ${plural(p.dead, 'clique morto', 'cliques mortos')}` : ''}{p.topView ? <><br />mais em {viewLabel(p.topView)} · {ago(p.last)}</> : null}</>}
              value={p.rage + p.dead} valueTone="accent" active={user === p.userKey} onClick={onUser ? () => onUser(p.userKey) : undefined} chevron={!!onUser} />
          ))} />
        </ListCard>
        <ListCard icon={<OctagonAlert size={18} strokeWidth={1.75} />} title="Erros de tela" hint="Falhas do app no navegador de quem estava usando, com quem viu por último">
          <PagedRows size={4} empty={none('Nenhum erro registrado neste período.')} rows={data.errors.map(e => (
            <RankRow key={`${e.view}|${e.msg}`} wrap lead={<Thumb icon={<AlertTriangle size={18} strokeWidth={1.75} />} />} title={e.msg}
              sub={<>{viewLabel(e.view)}{e.file ? ` · ${e.file}${e.line ? `:${e.line}` : ''}` : ''} · {plural(e.sessions, 'sessão', 'sessões')}<br />última: {e.lastUserName}{e.lastClientName ? ` em ${e.lastClientName}` : ''} {ago(e.last)}</>}
              value={<span className="badge" style={{ background: 'var(--red-soft)', color: bad, fontSize: 11 }}>{plural(e.count, 'vez', 'vezes')}</span>} valueTone="plain" />
          ))} />
        </ListCard>
        <ListCard icon={<Gauge size={18} strokeWidth={1.75} />} title="Tempo de carregamento" hint={`Da entrada na tela até ela parar de mudar. Acima de ${SLOW_MS / 1000} s é lento`}>
          <PagedRows size={4} empty={none('Sem medições ainda. Elas chegam conforme as pessoas trocam de tela.')} rows={data.perf.map(p => (
            <RankRow key={p.view} wrap lead={<Thumb icon={<Gauge size={18} strokeWidth={1.75} />} />} title={viewLabel(p.view)}
              sub={<>{plural(p.samples, 'medição', 'medições')} · metade abre em {secs(p.p50)}{p.slow ? ` · ${plural(p.slow, 'vez', 'vezes')} acima de ${SLOW_MS / 1000} s` : ''}{p.loadP75 != null ? <><br />abrindo o app: {secs(p.loadP75)}{p.lcpP75 != null ? ` · maior elemento em ${secs(p.lcpP75)}` : ''}</> : null}{p.tabP75 != null ? <><br />trocando de aba: {secs(p.tabP75)}</> : null}</>}
              value={<span style={{ color: p.p75 > SLOW_MS ? bad : good }}>{secs(p.p75)}</span>} valueTone="plain" bar={(p.p75 / maxPerf) * 100} />
          ))} />
        </ListCard>
        <ListCard icon={<MousePointerClick size={18} strokeWidth={1.75} />} title="Cliques de raiva" hint="Vários cliques seguidos no mesmo ponto: a pessoa esperava uma resposta que não veio">
          <PagedRows empty={none('Nenhum clique de raiva neste período.')} rows={frictionRows(data.rage, 'clique', 'cliques')} />
        </ListCard>
        <ListCard icon={<MousePointerClick size={18} strokeWidth={1.75} />} title="Cliques mortos" hint="Cliques em algo que parece botão e não mudou nada na tela">
          <PagedRows empty={none('Nenhum clique morto neste período.')} rows={frictionRows(data.dead, 'clique', 'cliques')} />
        </ListCard>
        <ListCard icon={<MoveVertical size={18} strokeWidth={1.75} />} title="Rolagem por tela" hint="Até onde as pessoas descem. Só telas mais compridas que a janela">
          <PagedRows empty={none('Sem rolagem registrada neste período.')} rows={data.scroll.map(s => (
            <RankRow key={s.view} wrap lead={<Thumb icon={<MoveVertical size={18} strokeWidth={1.75} />} />} title={viewLabel(s.view)}
              sub={`${plural(s.visits, 'visita', 'visitas')} · descem em média ${s.avg}% · ${s.reach[50]}% passam da metade`} value={`${s.reach[100]}% veem o fim`} valueTone="accent" bar={s.avg} />
          ))} />
        </ListCard>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>Para ver onde acontece na tela, abra o <a href="/admin/heatmap" style={{ color: 'var(--accent)' }}>Heatmap</a> e escolha Cliques de raiva, Cliques mortos ou Rolagem.</p>
    </>
  )
}
