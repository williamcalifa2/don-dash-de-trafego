'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, MessageCircle, ShoppingCart } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from './PulseLoader'
import { MetricTile } from './MetricTile'
import type { CheckoutRow } from '@/lib/integrations'

interface CartsResponse {
  setup: 'ready' | 'tables' | 'error'
  abandonedCount: number
  abandonedValue: number
  contactableCount: number
  completedCount: number
  totalCount: number
  conversionRate: number
  list: CheckoutRow[]
}

const money = (v: number, cur = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(v)

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (m < 60) return `há ${m} min`
  if (m < 1440) return `há ${Math.floor(m / 60)} h`
  return `há ${Math.floor(m / 1440)} d`
}

function waLink(c: CheckoutRow): string | null {
  const d = (c.customer_phone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  const first = (c.customer_name ?? '').split(' ')[0]
  const item = c.items?.[0]?.name
  const msg = `Olá${first ? `, ${first}` : ''}! Vi que você deixou ${item ? `"${item}"` : 'itens'} no carrinho. Posso te ajudar a finalizar?${c.recover_url ? ` É só continuar por aqui: ${c.recover_url}` : ''}`
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(msg)}`
}

function CopyLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1600) } catch { /* sem permissão */ } }}>
      {ok ? <Check size={14} color="var(--green)" /> : <Copy size={14} />} {ok ? 'Copiado' : 'Copiar link'}
    </button>
  )
}

/** Carrinhos abandonados da loja (webhooks de checkout da Shopify), com atalho para recuperar pelo WhatsApp. */
export function EcommerceCarts({ currency = 'BRL' }: { currency?: string }) {
  const [data, setData] = useState<CartsResponse | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch('/api/ecommerce/checkouts', { cache: 'no-store' }).then(r => r.json()).then((j: CartsResponse) => { if (alive) setData(j) }).catch(() => { if (alive) setData({ setup: 'error', abandonedCount: 0, abandonedValue: 0, contactableCount: 0, completedCount: 0, totalCount: 0, conversionRate: 0, list: [] }) })
    return () => { alive = false }
  }, [])

  if (!data) return <PulseLoader size={36} />
  if (data.setup === 'tables') return <div className="card" style={{ padding: 20, fontSize: 14, color: 'var(--text-2)' }}>O banco ainda não tem a tabela de carrinhos. Rode o SQL <code>supabase/2026-09-ecommerce-checkouts.sql</code> no Supabase.</div>
  if (data.setup === 'error') return <div className="card" style={{ padding: 20, fontSize: 14, color: 'var(--text-2)' }}>Não foi possível carregar os carrinhos agora. Tente de novo em instantes.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="tile-grid stagger">
        <MetricTile label="Carrinhos abandonados" value={String(data.abandonedCount)} note="sem atividade há mais de 1 h" />
        <MetricTile label="Valor em aberto" value={money(data.abandonedValue, currency)} note="soma dos carrinhos abandonados" />
        <MetricTile label="Com contato" value={String(data.contactableCount)} note="têm telefone ou e-mail para recuperar" />
        <MetricTile label="Taxa de conclusão" value={data.totalCount ? `${data.conversionRate.toFixed(1).replace('.', ',')}%` : '—'} note={`${data.completedCount} de ${data.totalCount} checkouts, 30 dias`} />
      </div>

      <section>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Para recuperar <span style={{ fontWeight: 400, color: 'var(--text-2)', fontSize: 13 }}>· {data.list.length}</span></h3>
        {data.list.length === 0 ? (
          <div className="card" style={{ padding: 20, fontSize: 14, color: 'var(--text-2)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <ShoppingCart size={18} /> Nenhum carrinho abandonado com contato agora. Eles aparecem aqui 1 hora depois do último movimento.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {data.list.map(c => {
              const wa = waLink(c)
              const names = (c.items ?? []).map(i => `${i.quantity}× ${i.name}`).join(', ')
              return (
                <article key={c.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name || c.customer_email || c.customer_phone}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>{ago(c.updated_at)}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(Number(c.total), c.currency || currency)}</div>
                  <p title={names} style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 32 }}>{names || 'Sem itens'}</p>
                  {(c.utm_campaign || c.utm_source) && <span className="badge" style={{ alignSelf: 'flex-start', fontSize: 11 }}>{c.utm_campaign || c.utm_source}</span>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                    {wa && <a className="btn btn-primary btn-sm" href={wa} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><MessageCircle size={14} /> Chamar no WhatsApp</a>}
                    {c.recover_url && <CopyLink url={c.recover_url} />}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
