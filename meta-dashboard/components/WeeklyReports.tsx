'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, History as HistoryIcon, Loader2, RefreshCw, Save } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from './PulseLoader'
import { Thumb } from './UsageUi'

interface Nums { spend: number; results: number; leads: number; cpl: number | null; cost_per_result: number | null; reach: number }
interface Report { weekKey: string; range: { since: string; until: string }; status: 'ready' | 'empty'; text: string | null; edited?: string | null; generatedAt: number; kind?: string; current?: Nums }
interface Item { slug: string; name: string; logoUrl: string | null; report: Report | null; state: 'ready' | 'empty' | 'old' | 'none' }

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const shown = (r: Report) => r.edited ?? r.text ?? ''

function CopyButton({ text, label = 'Copiar mensagem' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* sem permissão: seleciona e copia à mão */ } }}>
      {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />} {copied ? 'Copiado' : label}
    </button>
  )
}

/** Semanas anteriores guardadas de um cliente: a mensagem e os números de cada uma. */
function History({ slug }: { slug: string }) {
  const [list, setList] = useState<Report[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { let alive = true; apiFetch(`/api/admin/weekly?slug=${slug}&history=1`, { cache: 'no-store' }).then(r => r.json()).then((j: { history: Report[] }) => { if (alive) setList(j.history) }).catch(() => { if (alive) setList([]) }); return () => { alive = false } }, [slug])
  if (!list) return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Carregando…</p>
  if (list.length === 0) return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Ainda não há semanas guardadas.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map(r => {
        const isOpen = open === r.weekKey
        const c = r.current
        return (
          <div key={r.weekKey} style={{ border: '1px solid var(--border-soft)', borderRadius: 12, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOpen(isOpen ? null : r.weekKey)} aria-expanded={isOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{dm(r.range.since)} a {dm(r.range.until)}{r.edited ? <span style={{ fontWeight: 400, color: 'var(--text-2)' }}> · editado</span> : null}</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.status === 'empty' ? 'sem veiculação' : c ? `${brl(c.spend)} · ${Math.round(r.kind === 'form' ? c.leads : c.results)} res.` : ''}</span>
              <ChevronDown size={14} aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--text-3)' }} />
            </button>
            {isOpen && (
              <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.status === 'ready' ? (
                  <>
                    <pre style={{ margin: 0, padding: 12, background: 'var(--bg-card2)', borderRadius: 10, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{shown(r)}</pre>
                    <div><CopyButton text={shown(r)} /></div>
                  </>
                ) : <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Sem investimento nem resultado nessa semana.</p>}
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Gerado {when(r.generatedAt)}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Card({ item, onRegenerate, busy }: { item: Item; onRegenerate: () => void; busy: boolean }) {
  const original = item.state === 'ready' && item.report ? shown(item.report) : ''
  const [text, setText] = useState(original)
  const [saved, setSaved] = useState(original)
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const last = useRef(original)
  // Texto novo do servidor (gerou de novo): substitui o que estava na caixa.
  useEffect(() => { if (original !== last.current) { last.current = original; setText(original); setSaved(original) } }, [original])

  async function save() {
    if (!item.report) return
    setSaving(true)
    try { const r = await apiFetch('/api/admin/weekly', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: item.slug, weekKey: item.report.weekKey, text }) }); if (r.ok) setSaved(text) } finally { setSaving(false) }
  }
  const ready = item.state === 'ready'
  const dirty = ready && text !== saved
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
        <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => setShowHistory(s => !s)} aria-pressed={showHistory} aria-label={`Histórico de ${item.name}`} title="Semanas anteriores"><HistoryIcon size={16} strokeWidth={1.75} /></button>
        <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={onRegenerate} disabled={busy} aria-label={`Gerar de novo o relatório de ${item.name}`} title="Gerar de novo com os números mais recentes">
          {busy ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} strokeWidth={1.75} />}
        </button>
      </div>
      {showHistory ? <History slug={item.slug} /> : ready ? (
        <>
          <textarea className="field" aria-label={`Mensagem de ${item.name}`} value={text} onChange={e => setText(e.target.value)} rows={14} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13, height: 'auto' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CopyButton text={text} />
            <button type="button" className="btn btn-outline btn-sm" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 size={16} className="spin" /> : <Save size={16} strokeWidth={1.75} />} {dirty ? 'Salvar edição' : 'Salvo'}</button>
          </div>
        </>
      ) : item.state === 'empty' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Sem investimento nem resultado na semana. Nada para enviar.</p>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={14} className="spin" /> Preparando a mensagem com os números da semana…</p>
      )}
    </article>
  )
}

/** Relatório semanal dos clientes do gestor: uma mensagem pronta por cliente (WhatsApp), só copiar e enviar. Cada semana fica guardada no histórico. */
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
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>Mensagens da semana prontas para copiar. Edite se quiser e clique em Salvar edição. O relógio abre as semanas anteriores.</p>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {items.map(i => <Card key={i.slug} item={i} busy={busy === i.slug} onRegenerate={() => regenerate(i.slug)} />)}
      </div>
    </div>
  )
}
