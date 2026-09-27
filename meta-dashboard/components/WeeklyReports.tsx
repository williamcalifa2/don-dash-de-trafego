'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from './PulseLoader'
import { Thumb } from './UsageUi'

interface Report { weekKey: string; range: { since: string; until: string }; status: 'ready' | 'empty'; text: string | null; generatedAt: number }
interface Item { slug: string; name: string; logoUrl: string | null; report: Report | null; state: 'ready' | 'empty' | 'old' | 'none' }

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Card({ item, onRegenerate, busy }: { item: Item; onRegenerate: () => void; busy: boolean }) {
  const original = item.state === 'ready' ? item.report?.text ?? '' : ''
  const [text, setText] = useState(original)
  const [copied, setCopied] = useState(false)
  const last = useRef(original)
  // Texto novo do servidor (gerou de novo): substitui o que estava na caixa.
  useEffect(() => { if (original !== last.current) { last.current = original; setText(original) } }, [original])

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* sem permissão: seleciona e copia à mão */ }
  }
  const ready = item.state === 'ready'
  return (
    <article className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Thumb name={item.name} src={item.logoUrl} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 title={item.name} style={{ fontSize: 16, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {item.report && item.state !== 'old' ? `${dm(item.report.range.since)} a ${dm(item.report.range.until)} · gerado ${when(item.report.generatedAt)}` : 'Semana atual ainda não gerada'}
          </div>
        </div>
        <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={onRegenerate} disabled={busy} aria-label={`Gerar de novo o relatório de ${item.name}`} title="Gerar de novo com os números mais recentes">
          {busy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} strokeWidth={1.75} />}
        </button>
      </div>
      {ready ? (
        <>
          <textarea className="field" aria-label={`Mensagem de ${item.name}`} value={text} onChange={e => setText(e.target.value)} rows={12} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13, height: 'auto' }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={copy}>{copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />} {copied ? 'Copiado' : 'Copiar mensagem'}</button>
        </>
      ) : item.state === 'empty' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Sem investimento nem resultado na semana. Nada para enviar.</p>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={14} className="spin" /> Preparando a mensagem com os números da semana…</p>
      )}
    </article>
  )
}

/** Relatório semanal dos clientes do gestor: uma mensagem pronta por cliente (WhatsApp), só copiar e enviar. Gerada na segunda de madrugada. */
export function WeeklyReports({ managerId }: { managerId: string }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const tries = useRef(0)

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/weekly?manager=${managerId}`, { cache: 'no-store' })
      if (!r.ok) throw new Error()
      const j = await r.json() as { items: Item[] }
      setItems(j.items); setFailed(false)
    } catch { setFailed(true) }
  }, [managerId])
  useEffect(() => { tries.current = 0; setItems(null); void load() }, [load])

  // Enquanto faltar cliente, relê a cada 15 s (até 10 vezes): a geração acontece em segundo plano.
  const waiting = items?.some(i => i.state === 'none' || i.state === 'old')
  useEffect(() => {
    if (!waiting || tries.current >= 10) return
    const t = setTimeout(() => { tries.current++; void load() }, 15_000)
    return () => clearTimeout(t)
  }, [waiting, items, load])

  async function regenerate(slug: string) {
    setBusy(slug)
    try { await apiFetch('/api/admin/weekly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) }); await load() } finally { setBusy(null) }
  }

  if (failed && !items) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Não foi possível carregar os relatórios agora.</div>
  if (!items) return <PulseLoader size={44} />
  if (items.length === 0) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Este gestor não tem clientes ativos com conta de anúncios.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Mensagens da semana prontas para copiar e enviar. Você pode editar o texto antes de copiar.</p>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {items.map(i => <Card key={i.slug} item={i} busy={busy === i.slug} onRegenerate={() => regenerate(i.slug)} />)}
      </div>
    </div>
  )
}
