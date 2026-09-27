'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, Download, Plug, RefreshCw, Send, Webhook, X } from 'lucide-react'
import type { ClientConfig, ClientIntegrationsConfig } from '@/lib/clientConfig'
import { PulseLoader } from './PulseLoader'
import { pixelSnippet } from '@/lib/pixelSnippet'

interface ClientIntegrationsTabProps {
  slug: string
  clientName: string
  baseDomain: string | null
  onNotice: (t: string) => void
}

type Which = 'google' | 'ga4' | 'shopify' | 'nuvemshop' | 'webhook'
type ShopTab = 'conexao' | 'live' | 'produtos' | 'avancado'
type Feedback = { kind: 'ok' | 'err' | 'info'; text: string } | null

const generateRandomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function CopyBtn({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm btn-icon"
      aria-label={copied ? 'Copiado' : label}
      title={copied ? 'Copiado!' : label}
      disabled={!text}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* sem permissão da área de transferência */ }
      }}
    >
      {copied ? <Check size={16} color="var(--green)" /> : <Copy size={16} />}
    </button>
  )
}

/** Campo de leitura com botão de copiar ao lado. */
function CopyField({ id, label, value, hint }: { id: string; label: string; value: string; hint?: string }) {
  return (
    <div className="int-field">
      <label htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input id={id} className="int-input" readOnly value={value} />
        <CopyBtn text={value} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function Field({ id, label, value, onChange, placeholder, type = 'text', hint }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string }) {
  return (
    <div className="int-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="int-input" type={type} autoComplete="off" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function Status({ fb }: { fb: Feedback }) {
  if (!fb) return null
  const color = fb.kind === 'ok' ? 'var(--green)' : fb.kind === 'err' ? 'var(--red)' : 'var(--text-2)'
  const bg = fb.kind === 'ok' ? 'var(--green-soft)' : fb.kind === 'err' ? 'var(--red-soft)' : 'var(--bg-card2)'
  return <div role="status" style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, color, background: bg }}>{fb.text}</div>
}

function Badge({ tone, children }: { tone: 'ok' | 'idle'; children: React.ReactNode }) {
  return (
    <span className="badge" style={{ background: tone === 'ok' ? 'var(--green-soft)' : 'var(--bg-card2)', color: tone === 'ok' ? 'var(--green)' : 'var(--text-2)', fontSize: 11, fontWeight: 600, padding: '3px 10px' }}>
      {tone === 'ok' && <Check size={11} style={{ marginRight: 4 }} />}{children}
    </span>
  )
}

function Logo({ which, size = 48 }: { which: Which; size?: number }) {
  return (
    <span className="int-logo" style={{ width: size, height: size }}>
      {which === 'google' && <img src="/integrations/google-ads.svg" alt="" style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6) }} />}
      {which === 'ga4' && <img src="/integrations/ga4.svg" alt="" style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6) }} />}
      {which === 'shopify' && <img src="/integrations/shopify.svg" alt="" />}
      {which === 'nuvemshop' && <img src="/integrations/nuvemshop.png" alt="" />}
      {which === 'webhook' && <Webhook size={Math.round(size * 0.5)} color="var(--accent)" strokeWidth={1.75} />}
    </span>
  )
}

const TITLES: Record<Which, string> = {
  google: 'Google Ads',
  ga4: 'Google Analytics 4',
  shopify: 'Shopify',
  nuvemshop: 'Nuvemshop',
  webhook: 'Webhook e CRMs',
}

export function ClientIntegrationsTab({ slug, clientName, baseDomain, onNotice }: ClientIntegrationsTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<Which | null>(null)
  const [shopTab, setShopTab] = useState<ShopTab>('conexao')
  const [fb, setFb] = useState<Feedback>(null)

  // Google Ads & GA4
  const [googleId, setGoogleId] = useState('')
  const [ga4Id, setGa4Id] = useState('')
  const [ga4ServiceEmail, setGa4ServiceEmail] = useState<string | null>(null)
  const [ga4Test, setGa4Test] = useState<{ ok: boolean; message: string } | null>(null)
  const [ga4Busy, setGa4Busy] = useState(false)

  // E-commerce & Webhooks
  const [webhookToken, setWebhookToken] = useState('')
  const [shopifySecret, setShopifySecret] = useState('')
  const [shopStoreUrl, setShopStoreUrl] = useState('')
  const [shopDomain, setShopDomain] = useState('')
  const [shopToken, setShopToken] = useState('')
  const [shopClientId, setShopClientId] = useState('')
  const [shopClientSecret, setShopClientSecret] = useState('')
  const [nuvemshopSecret, setNuvemshopSecret] = useState('')
  const [connectedAt, setConnectedAt] = useState('')
  const [hookCount, setHookCount] = useState(0)
  const [trackKey, setTrackKey] = useState('')
  const [installLink, setInstallLink] = useState('')

  const dialogRef = useRef<HTMLDivElement>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : (baseDomain ? `https://${baseDomain}` : 'https://dashboard.dondigital.com.br')
  const shopifyUrl = `${origin}/api/webhooks/shopify/${slug}`
  const nuvemshopUrl = `${origin}/api/webhooks/nuvemshop/${slug}${webhookToken ? `?token=${webhookToken}` : ''}`
  const inboundUrl = `${origin}/api/webhooks/inbound/${slug}`

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/admin/clients/${slug}/config`)
      .then(r => (r.ok ? r.json() : null))
      .then((cfg: (ClientConfig & { trackKey?: string }) | null) => {
        if (!alive || !cfg) return
        const i = cfg.integrations || {}
        setTrackKey(cfg.trackKey || '')
        setWebhookToken(i.webhookToken || generateRandomToken())
        setShopifySecret(i.shopifySecret || '')
        setShopStoreUrl(i.shopifyStoreUrl || '')
        setConnectedAt(i.shopifyConnectedAt || '')
        setHookCount(i.shopifyWebhooks?.length || 0)
        setShopDomain(i.shopifyDomain || '')
        setShopToken(i.shopifyToken || '')
        setShopClientId(i.shopifyClientId || '')
        setShopClientSecret(i.shopifyClientSecret || '')
        setNuvemshopSecret(i.nuvemshopSecret || '')
        setGoogleId(cfg.googleAdsCustomerId || '')
        setGa4Id(cfg.ga4PropertyId || '')
      })
      .catch(() => { })
      .finally(() => { if (alive) setLoading(false) })

    fetch('/api/admin/ga4')
      .then(r => r.ok ? r.json() : null)
      .then((data: { serviceEmail?: string | null } | null) => {
        if (alive && data?.serviceEmail) setGa4ServiceEmail(data.serviceEmail)
      })
      .catch(() => { })

    return () => { alive = false }
  }, [slug])

  const close = useCallback(() => {
    setOpen(null)
    setFb(null)
    setInstallLink('')
    setGa4Test(null)
  }, [])

  // Esc fecha; a página de trás não rola enquanto o popup está aberto; o foco vai para dentro do popup.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, close])

  const currentIntegrations = (): ClientIntegrationsConfig => ({
    webhookToken: webhookToken.trim(),
    shopifySecret: shopifySecret.trim() || undefined,
    shopifyStoreUrl: shopStoreUrl.trim() || undefined,
    shopifyDomain: shopDomain.trim() || undefined,
    shopifyToken: shopToken.trim() || undefined,
    shopifyClientId: shopClientId.trim() || undefined,
    shopifyClientSecret: shopClientSecret.trim() || undefined,
    nuvemshopSecret: nuvemshopSecret.trim() || undefined,
  })

  async function persist(): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`/api/admin/clients/${slug}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrations: currentIntegrations(),
        googleAdsCustomerId: googleId.trim(),
        ga4PropertyId: ga4Id.trim(),
      }),
    })
    const data = await res.json().catch(() => ({})) as { error?: string }
    return { ok: res.ok, error: data?.error }
  }

  async function handleSave() {
    setSaving(true)
    setFb(null)
    try {
      const r = await persist()
      if (!r.ok) throw new Error(r.error || 'save')
      setFb({ kind: 'ok', text: 'Configurações salvas.' })
      onNotice('Integrações salvas com sucesso!')
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message !== 'save' ? err.message : 'Não foi possível salvar. Tente de novo.'
      setFb({ kind: 'err', text: msg })
    } finally {
      setSaving(false)
    }
  }

  async function testGa4() {
    if (!ga4Id.trim()) return
    setGa4Busy(true)
    setGa4Test(null)
    try {
      const res = await fetch('/api/admin/ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: ga4Id.trim() }),
      })
      const j = await res.json().catch(() => ({})) as { ok?: boolean; message?: string }
      setGa4Test({ ok: !!j.ok, message: j.message || (j.ok ? 'Propriedade conectada!' : 'Falha na conexão.') })
    } catch {
      setGa4Test({ ok: false, message: 'Não foi possível conectar ao Google Analytics.' })
    } finally {
      setGa4Busy(false)
    }
  }

  /** Salva os campos e chama uma rota de ação da equipe; mostra a mensagem que ela devolver. */
  async function run(key: string, path: string, body?: unknown, after?: (j: Record<string, unknown>) => void) {
    setBusy(key)
    setFb({ kind: 'info', text: 'Aguarde…' })
    try {
      const p = await persist()
      if (!p.ok) throw new Error(p.error || 'save')
      const res = await fetch(`/api/admin/clients/${slug}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
      const j = await res.json().catch(() => ({})) as Record<string, unknown>
      after?.(j)
      setFb({ kind: j.ok ? 'ok' : 'err', text: String(j.message ?? (j.ok ? 'Pronto.' : 'Não foi possível concluir.')) })
    } catch {
      setFb({ kind: 'err', text: 'Não foi possível concluir agora. Tente de novo.' })
    } finally {
      setBusy(null)
    }
  }

  const testPixelCatalog = () => run('catalog', 'shopify-test')
  const refreshWebhooks = () => run('hooks', 'shopify-webhooks', {}, j => { if (typeof j.count === 'number') setHookCount(j.count) })
  const importHistory = () => run('history', 'shopify-backfill', { days: 30 })
  const makeInstallLink = () => run('install', 'shopify-install', { shop: shopDomain.trim() }, j => setInstallLink(typeof j.url === 'string' ? j.url : ''))

  async function pingWebhook() {
    setBusy('ping')
    setFb({ kind: 'info', text: 'Testando…' })
    try {
      const res = await fetch(`/api/webhooks/inbound/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${webhookToken}` }, body: JSON.stringify({ tipo: 'ping' }) })
      const j = await res.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string }
      setFb(res.ok && j.ok ? { kind: 'ok', text: `Webhook respondendo (${j.message || '200 OK'}).` } : { kind: 'err', text: `Erro na resposta: ${j.error || res.statusText}` })
    } catch {
      setFb({ kind: 'err', text: 'Não foi possível conectar ao endereço.' })
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PulseLoader size={40} />

  const googleStatus = googleId.trim()
    ? { tone: 'ok' as const, text: `Conta ${googleId.trim()}` }
    : { tone: 'idle' as const, text: 'Não conectado' }

  const ga4Status = ga4Id.trim()
    ? { tone: 'ok' as const, text: `Propriedade ${ga4Id.trim()}` }
    : { tone: 'idle' as const, text: 'Não conectado' }

  const shopifyStatus = connectedAt
    ? { tone: 'ok' as const, text: 'Conectado pelo app' }
    : shopifySecret
    ? { tone: 'ok' as const, text: 'Webhook manual' }
    : { tone: 'idle' as const, text: 'Não conectado' }

  const cards: Array<{ which: Which; desc: string; status: { tone: 'ok' | 'idle'; text: string } | null }> = [
    { which: 'google', desc: 'Métricas de Pesquisa, Performance Max, Display e YouTube direto no painel.', status: googleStatus },
    { which: 'ga4', desc: 'Sessões, canais de aquisição, engajamento e conversões do site.', status: ga4Status },
    { which: 'shopify', desc: 'Pedidos, faturamento, carrinhos abandonados, fotos dos produtos e o Live View da loja.', status: shopifyStatus },
    { which: 'nuvemshop', desc: 'Pedidos pagos da loja Nuvemshop para o faturamento e o ticket médio.', status: null },
    { which: 'webhook', desc: 'Envie leads e vendas de qualquer ferramenta: RD Station, Kommo, Typebot, n8n, Make.', status: null },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Plug size={28} color="var(--accent)" strokeWidth={1.75} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Integrações</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '2px 0 0' }}>Conecte a conta do Google Ads, Analytics, lojas e CRMs de {clientName}.</p>
        </div>
      </div>

      <div className="int-grid stagger">
        {cards.map(c => (
          <button key={c.which} type="button" className="int-card" onClick={() => { setOpen(c.which); setShopTab('conexao'); setFb(null); setGa4Test(null) }} aria-label={`Configurar ${TITLES[c.which]}`}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Logo which={c.which} />
              <ChevronRight size={18} color="var(--text-3)" aria-hidden="true" />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{TITLES[c.which]}</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{c.desc}</span>
            </span>
            <span style={{ marginTop: 'auto' }}>
              {c.status ? <Badge tone={c.status.tone}>{c.status.text}</Badge> : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Configurar</span>}
            </span>
          </button>
        ))}
      </div>

      {open && (
        <div className="int-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
          <div className="int-dialog" role="dialog" aria-modal="true" aria-label={`Configurar ${TITLES[open]}`} tabIndex={-1} ref={dialogRef}>
            <div className="int-dialog-head">
              <Logo which={open} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{TITLES[open]}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0 0' }}>{clientName}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={close} aria-label="Fechar" title="Fechar"><X size={18} /></button>
            </div>

            {open === 'shopify' && (
              <div className="int-tabs" role="tablist" aria-label="Seções da Shopify">
                {([['conexao', 'Conexão'], ['live', 'Live View'], ['produtos', 'Produtos'], ['avancado', 'Avançado']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" className="int-tab" aria-selected={shopTab === k} onClick={() => { setShopTab(k); setFb(null) }}>{l}</button>
                ))}
              </div>
            )}

            <div className="int-dialog-body">
              {open === 'google' && (
                <>
                  {googleId.trim() ? (
                    <div className="int-note" style={{ color: 'var(--text-1)' }}>
                      <strong style={{ color: 'var(--green)' }}>Conectado</strong> à conta <strong>{googleId.trim()}</strong>. A aba <strong>Google Ads</strong> está ativa no painel de {clientName}.
                    </div>
                  ) : (
                    <div className="int-note">
                      Conecte a conta de anúncios do Google Ads para exibir métricas consolidadas, campanhas de Pesquisa, Display e Performance Max. Ao salvar, a aba <strong>Google Ads</strong> é liberada automaticamente no painel.
                    </div>
                  )}

                  <ol className="int-steps">
                    <li>No Google Ads, localize o ID de 10 dígitos da conta (ex: <code>123-456-7890</code>) no canto superior direito.</li>
                    <li>Certifique-se de que a conta está vinculada à Conta Gerente (MCC) da agência ou com acesso concedido.</li>
                    <li>Cole o ID abaixo e clique em <strong>Salvar</strong>.</li>
                  </ol>

                  <Field
                    id="google-account-id"
                    label="ID da conta Google Ads (10 dígitos)"
                    value={googleId}
                    onChange={v => { setGoogleId(v); setFb(null) }}
                    placeholder="123-456-7890"
                    hint="Aceita com ou sem traços. Para desconectar, apague o ID e clique em Salvar."
                  />

                  {googleId.trim() && (
                    <div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)' }}
                        onClick={() => {
                          setGoogleId('')
                          setFb({ kind: 'info', text: 'ID removido. Clique em "Salvar" para confirmar a desconexão.' })
                        }}
                      >
                        Desconectar Google Ads
                      </button>
                    </div>
                  )}

                  <Status fb={fb} />
                </>
              )}

              {open === 'ga4' && (
                <>
                  {ga4Id.trim() ? (
                    <div className="int-note" style={{ color: 'var(--text-1)' }}>
                      <strong style={{ color: 'var(--green)' }}>Conectado</strong> à propriedade <strong>{ga4Id.trim()}</strong>. A aba <strong>Site</strong> está ativa no painel de {clientName}.
                    </div>
                  ) : (
                    <div className="int-note">
                      Conecte a propriedade do Google Analytics 4 para acompanhar sessões, páginas mais acessadas, fontes de tráfego e conversões do site. Ao salvar, a aba <strong>Site</strong> é liberada no painel.
                    </div>
                  )}

                  <ol className="int-steps">
                    <li>No Google Analytics 4 da empresa, vá em <strong>Administrador → Acesso à propriedade</strong>.</li>
                    <li>
                      Adicione a conta de serviço abaixo como <strong>Leitor (Viewer)</strong>:
                      {ga4ServiceEmail ? (
                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input className="int-input" readOnly value={ga4ServiceEmail} style={{ height: 34, fontSize: 12 }} />
                          <CopyBtn text={ga4ServiceEmail} label="Copiar e-mail de serviço" />
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                          Conta de serviço configurada no servidor da agência.
                        </div>
                      )}
                    </li>
                    <li>Em <strong>Detalhes da propriedade</strong>, copie o <strong>ID da propriedade</strong> (apenas números, ex: <code>123456789</code>).</li>
                    <li>Cole o ID abaixo e clique em <strong>Testar conexão</strong>.</li>
                  </ol>

                  <div className="int-field">
                    <label htmlFor="ga4-prop-id">ID da propriedade GA4</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id="ga4-prop-id"
                        className="int-input"
                        value={ga4Id}
                        onChange={e => { setGa4Id(e.target.value); setGa4Test(null); setFb(null) }}
                        placeholder="Ex.: 123456789"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={!ga4Id.trim() || ga4Busy}
                        onClick={testGa4}
                      >
                        {ga4Busy ? 'Testando…' : 'Testar conexão'}
                      </button>
                    </div>
                    <p className="hint">Apenas números. Para desconectar, apague o ID e clique em Salvar.</p>
                  </div>

                  {ga4Test && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      fontSize: 13,
                      color: ga4Test.ok ? 'var(--green)' : 'var(--red)',
                      background: ga4Test.ok ? 'var(--green-soft)' : 'var(--red-soft)',
                    }}>
                      {ga4Test.message}
                    </div>
                  )}

                  {ga4Id.trim() && (
                    <div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)' }}
                        onClick={() => {
                          setGa4Id('')
                          setGa4Test(null)
                          setFb({ kind: 'info', text: 'Propriedade removida. Clique em "Salvar" para confirmar a desconexão.' })
                        }}
                      >
                        Desconectar Google Analytics
                      </button>
                    </div>
                  )}

                  <Status fb={fb} />
                </>
              )}

              {open === 'shopify' && shopTab === 'conexao' && (
                <>
                  {connectedAt ? (
                    <div className="int-note" style={{ color: 'var(--text-1)' }}>
                      <strong style={{ color: 'var(--green)' }}>Conectado</strong> a {shopDomain || 'a loja'} desde {fmtDate(connectedAt)}. {hookCount} webhooks ativos: pedidos, cancelamentos, reembolsos, exclusões e carrinhos chegam sozinhos.
                    </div>
                  ) : (
                    <div className="int-note">Instale o app do Grupo Don na loja. O app cadastra os webhooks sozinho e passa a ler pedidos e produtos, sem copiar chave nenhuma.</div>
                  )}

                  <Field id="shop-domain" label="Endereço da loja na Shopify" value={shopDomain} onChange={setShopDomain} placeholder="nomedaloja.myshopify.com" hint="É o endereço do admin da Shopify, não o site da loja." />

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={makeInstallLink} disabled={busy !== null || !shopDomain.trim()}>
                      {busy === 'install' ? 'Gerando…' : connectedAt ? 'Link para reinstalar' : 'Gerar link de instalação'}
                    </button>
                    {connectedAt && (
                      <>
                        <button type="button" className="btn btn-outline btn-sm" onClick={importHistory} disabled={busy !== null}><Download size={14} /> {busy === 'history' ? 'Importando…' : 'Importar últimos 30 dias'}</button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={refreshWebhooks} disabled={busy !== null}><RefreshCw size={14} /> {busy === 'hooks' ? 'Atualizando…' : 'Atualizar webhooks'}</button>
                      </>
                    )}
                  </div>

                  {installLink && (
                    <>
                      <CopyField id="shop-install" label="Link de instalação" value={installLink} />
                      <ol className="int-steps">
                        <li>Na tela <strong>Distribuição</strong> do Partners, gere o link da loja e abra com o usuário que tem acesso a ela.</li>
                        <li>Aprove as permissões. Você volta para esta tela com o selo <strong>Conectado</strong>.</li>
                      </ol>
                    </>
                  )}
                  <Status fb={fb} />
                </>
              )}

              {open === 'shopify' && shopTab === 'live' && (
                <>
                  <div className="int-note">Mostra visitantes online, carrinhos, checkouts e compras ao vivo. A Shopify não entrega isso por API, então um pixel na loja envia os eventos. Só conta quem aceitou o rastreio e só a partir da instalação.</div>
                  <ol className="int-steps">
                    <li>No admin da loja, abra <strong>Configurações → Eventos do cliente</strong>.</li>
                    <li>Clique em <strong>Adicionar pixel personalizado</strong>, dê o nome <code>Grupo Don Live View</code>.</li>
                    <li>Apague o conteúdo do editor e cole o código abaixo. Depois <strong>Salvar</strong> e <strong>Conectar</strong>.</li>
                    <li>Em <strong>Permissão</strong>, marque <strong>Análise</strong>. Em <strong>Venda de dados</strong>, marque que não vende.</li>
                    <li>Abra a loja em outra aba: em até 20 segundos o visitante aparece no Live View.</li>
                  </ol>
                  <div className="int-field">
                    <label htmlFor="pixel-code">Código do pixel</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <textarea id="pixel-code" className="int-input" readOnly rows={7} style={{ height: 'auto', padding: 12, resize: 'vertical' }} value={trackKey ? pixelSnippet(origin, slug, trackKey) : 'Carregando…'} />
                      <CopyBtn text={trackKey ? pixelSnippet(origin, slug, trackKey) : ''} label="Copiar código" />
                    </div>
                  </div>
                </>
              )}

              {open === 'shopify' && shopTab === 'produtos' && (
                <>
                  <div className="int-note">Para mostrar a foto e o link reais dos produtos, basta o endereço público da loja: o app lê o catálogo aberto que a Shopify já publica. Sem senha e sem app. Se a loja estiver conectada pelo app, ele usa a conexão.</div>
                  <Field id="shop-public" label="Endereço público da loja" value={shopStoreUrl} onChange={setShopStoreUrl} placeholder="meumagtag.com.br" />
                  <div><button type="button" className="btn btn-outline btn-sm" onClick={testPixelCatalog} disabled={busy !== null}>{busy === 'catalog' ? 'Testando…' : 'Salvar e testar conexão'}</button></div>
                  <Status fb={fb} />
                </>
              )}

              {open === 'shopify' && shopTab === 'avancado' && (
                <>
                  <div className="int-note"><strong>Webhook manual.</strong> Só use se a loja não puder instalar o app. Crie os webhooks em Configurações → Notificações → Webhooks, com formato JSON e este endereço, e cole a chave de assinatura que a Shopify mostra no fim da página. Eventos: criação, pagamento e cancelamento de pedido, criação e atualização de checkout.</div>
                  <CopyField id="shop-webhook" label="Endereço do webhook" value={shopifyUrl} />
                  <Field id="shop-secret" label="Chave de assinatura da Shopify" value={shopifySecret} onChange={setShopifySecret} placeholder="Cole a chave exibida na Shopify" hint="Obrigatória para este modo: sem ela, os pedidos são recusados." />
                  <div className="int-note"><strong>App próprio da nossa organização.</strong> Só para lojas que estão na mesma organização do app no Dev Dashboard. As outras lojas usam o link de instalação da aba Conexão.</div>
                  <Field id="shop-token" label="Token de acesso da Admin API" value={shopToken} onChange={setShopToken} type="password" placeholder="shpat_…" />
                  <Field id="shop-cid" label="ID do cliente do app" value={shopClientId} onChange={setShopClientId} />
                  <Field id="shop-csec" label="Segredo do cliente do app" value={shopClientSecret} onChange={setShopClientSecret} type="password" />
                  <Status fb={fb} />
                </>
              )}

              {open === 'nuvemshop' && (
                <>
                  <div className="int-note">Recebe pedidos pagos da Nuvemshop para o faturamento e o ticket médio do painel.</div>
                  <ol className="int-steps">
                    <li>No painel da Nuvemshop, abra <strong>Configurações → Canais de venda / Aplicativos</strong> (ou o Portal de Parceiros).</li>
                    <li>Cadastre um webhook para os eventos <code>order/created</code> e <code>order/paid</code>.</li>
                    <li>Cole o endereço abaixo. Ele já leva o seu token de segurança.</li>
                    <li>Salve. Os pedidos pagos passam a entrar no painel em tempo real.</li>
                  </ol>
                  <CopyField id="nuvem-url" label="Endereço do webhook" value={nuvemshopUrl} hint="Eventos: order/created e order/paid" />
                </>
              )}

              {open === 'webhook' && (
                <>
                  <div className="int-note">Envie leads ou vendas de qualquer ferramenta com uma requisição <code>POST</code> em JSON para o endereço abaixo, autenticada pelo token.</div>
                  <CopyField id="in-url" label="Endereço (POST)" value={inboundUrl} />
                  <div className="int-field">
                    <label htmlFor="in-token">Token do cliente</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input id="in-token" className="int-input" readOnly value={webhookToken} />
                      <CopyBtn text={webhookToken} />
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setWebhookToken(generateRandomToken())}>Gerar novo</button>
                    </div>
                    <p className="hint">Ao gerar um novo token, clique em Salvar. O antigo deixa de valer.</p>
                  </div>
                  <ol className="int-steps">
                    <li>No seu fluxo (n8n, Make, Typebot, CRM), crie uma requisição HTTP <code>POST</code>.</li>
                    <li>Cole o endereço acima e envie o cabeçalho <code>Authorization: Bearer {'{token}'}</code> (ou <code>x-webhook-token</code>).</li>
                    <li>Envie o corpo em JSON, como nos exemplos abaixo.</li>
                  </ol>
                  <div className="int-note">
                    <strong>Lead:</strong> <code>{'{ "nome": "Maria Silva", "telefone": "(11) 99999-9999", "email": "maria@email.com", "origem": "RD Station" }'}</code><br />
                    <strong>Venda:</strong> <code>{'{ "tipo": "venda", "valor": 197.00, "status": "paid", "customer_name": "Maria Silva" }'}</code>
                  </div>
                  <div><button type="button" className="btn btn-outline btn-sm" onClick={pingWebhook} disabled={busy !== null}><Send size={14} /> {busy === 'ping' ? 'Testando…' : 'Enviar teste'}</button></div>
                  <Status fb={fb} />
                </>
              )}

              {(open === 'nuvemshop' || (open === 'shopify' && shopTab === 'live')) && <Status fb={fb} />}
            </div>

            <div className="int-dialog-foot">
              <button type="button" className="btn btn-outline" onClick={close}>Fechar</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || busy !== null}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
