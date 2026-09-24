'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, RefreshCw, Send, ShieldCheck, ShoppingBag, ExternalLink, Zap, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import type { ClientConfig, ClientIntegrationsConfig } from '@/lib/clientConfig'
import { PulseLoader } from './PulseLoader'

interface ClientIntegrationsTabProps {
  slug: string
  clientName: string
  baseDomain: string | null
  onNotice: (t: string) => void
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm btn-icon"
      title={copied ? 'Copiado!' : 'Copiar'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch { }
      }}
    >
      {copied ? <Check size={14} color="var(--green)" /> : <Copy size={14} />}
    </button>
  )
}

export function ClientIntegrationsTab({ slug, clientName, baseDomain, onNotice }: ClientIntegrationsTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [webhookToken, setWebhookToken] = useState('')
  const [shopifySecret, setShopifySecret] = useState('')
  const [nuvemshopSecret, setNuvemshopSecret] = useState('')

  // Guias de instalação expandidos
  const [openGuide, setOpenGuide] = useState<'shopify' | 'nuvemshop' | 'crm' | null>(null)

  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : (baseDomain ? `https://${baseDomain}` : 'https://dashboard.dondigital.com.br')

  const shopifyUrl = `${origin}/api/webhooks/shopify/${slug}`
  const nuvemshopUrl = `${origin}/api/webhooks/nuvemshop/${slug}${webhookToken ? `?token=${webhookToken}` : ''}`
  const inboundUrl = `${origin}/api/webhooks/inbound/${slug}`

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/admin/clients/${slug}/config`)
      .then(r => (r.ok ? r.json() : null))
      .then((cfg: ClientConfig | null) => {
        if (!alive || !cfg) return
        const integ = cfg.integrations || {}
        setWebhookToken(integ.webhookToken || generateRandomToken())
        setShopifySecret(integ.shopifySecret || '')
        setNuvemshopSecret(integ.nuvemshopSecret || '')
      })
      .catch(() => { })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [slug])

  function generateRandomToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async function handleSave() {
    setSaving(true)
    setTestResult(null)
    try {
      const integrations: ClientIntegrationsConfig = {
        webhookToken: webhookToken.trim(),
        shopifySecret: shopifySecret.trim() || undefined,
        nuvemshopSecret: nuvemshopSecret.trim() || undefined,
      }

      const res = await fetch(`/api/admin/clients/${slug}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations }),
      })

      if (!res.ok) throw new Error('Falha ao salvar integrações')
      onNotice('Integrações salvas com sucesso!')
    } catch (e) {
      onNotice('Erro ao salvar integrações.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestWebhook() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/webhooks/inbound/${slug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${webhookToken}`,
        },
        body: JSON.stringify({ tipo: 'ping' }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setTestResult({
          ok: true,
          message: `Webhook respondendo perfeitamente! (${json.message || '200 OK'})`,
        })
      } else {
        setTestResult({
          ok: false,
          message: `Erro na resposta: ${json.error || res.statusText}`,
        })
      }
    } catch (e) {
      setTestResult({ ok: false, message: 'Não foi possível conectar ao endpoint.' })
    } finally {
      setTesting(false)
    }
  }

  const toggleGuide = (which: 'shopify' | 'nuvemshop' | 'crm') => {
    setOpenGuide(cur => (cur === which ? null : which))
  }

  if (loading) {
    return <PulseLoader size={40} caption="Carregando integrações..." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Zap size={20} color="var(--accent)" strokeWidth={2} />
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Integrações</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
          Conecte sua loja (Shopify, Nuvemshop) e CRMs para sincronizar vendas, pedidos e leads em tempo real para <strong>{clientName}</strong>.
        </p>
      </div>

      {/* Token Geral */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Token Secreto de Webhook deste Cliente</label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11 }}
            onClick={() => setWebhookToken(generateRandomToken())}
          >
            <RefreshCw size={12} /> Gerar novo token
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            readOnly
            value={webhookToken}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card2)',
              color: 'var(--text-1)',
            }}
          />
          <CopyBtn text={webhookToken} />
        </div>
      </div>

      {/* Integração 1: Shopify */}
      <div className="card" style={{ padding: 18, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={18} color="#95bf47" strokeWidth={2} />
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Shopify</h4>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => toggleGuide('shopify')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <BookOpen size={12} />
              <span>{openGuide === 'shopify' ? 'Ocultar guia' : 'Como instalar na Shopify'}</span>
              {openGuide === 'shopify' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            <a
              href="https://help.shopify.com/pt-BR/manual/apps/app-administration/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-xs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
              title="Abrir documentação da Shopify em nova aba"
            >
              <span>Doc oficial</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          Receba pedidos pagos, faturamento e cálculo de ROAS Real e CPA em tempo real.
        </p>

        {/* Guia Passo a Passo Shopify */}
        {openGuide === 'shopify' && (
          <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.6, color: 'var(--text-1)' }}>
            <strong style={{ display: 'block', marginBottom: 6, color: 'var(--accent)' }}>📖 Passo a passo de instalação na Shopify:</strong>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>No painel administrativo da sua Shopify, acesse <strong>Configurações</strong> (ícone de engrenagem no canto inferior esquerdo).</li>
              <li>No menu lateral, clique em <strong>Notificações</strong> e role até o final da página na seção <strong>Webhooks</strong>.</li>
              <li>Clique no botão <strong>Criar webhook</strong>.</li>
              <li>No campo <strong>Evento</strong>, selecione <code>Criação de pedido (Order creation)</code> ou <code>Pagamento do pedido (Order payment)</code>.</li>
              <li>Em <strong>Formato</strong>, selecione <code>JSON</code>.</li>
              <li>No campo <strong>URL</strong>, cole a URL de Webhook abaixo.</li>
              <li>Clique em <strong>Salvar</strong>.</li>
              <li><em>(Opcional)</em> Copie o segredo de assinatura exibido no rodapé da seção de Webhooks da Shopify e cole no campo de Chave Secreta abaixo.</li>
            </ol>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              URL do Webhook na Shopify (Tópicos: Criação de pedido / Pedido pago)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={shopifyUrl}
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card2)',
                  color: 'var(--text-1)',
                }}
              />
              <CopyBtn text={shopifyUrl} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              Chave Secreta da Shopify (Webhook HMAC Secret — Opcional)
            </label>
            <input
              type="text"
              placeholder="Cole o segredo exibido na Shopify ao cadastrar o webhook"
              value={shopifySecret}
              onChange={e => setShopifySecret(e.target.value)}
              style={{
                width: '100%',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-1)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Integração 2: Nuvemshop */}
      <div className="card" style={{ padding: 18, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={18} color="#2d3277" strokeWidth={2} />
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Nuvemshop</h4>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => toggleGuide('nuvemshop')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <BookOpen size={12} />
              <span>{openGuide === 'nuvemshop' ? 'Ocultar guia' : 'Como instalar na Nuvemshop'}</span>
              {openGuide === 'nuvemshop' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            <a
              href="https://tiendanube.github.io/api-documentation/resources/webhook"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-xs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
              title="Abrir documentação da Nuvemshop em nova aba"
            >
              <span>Doc oficial</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          Sincronização de vendas e pedidos para cálculo automático de faturamento e ticket médio.
        </p>

        {/* Guia Passo a Passo Nuvemshop */}
        {openGuide === 'nuvemshop' && (
          <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.6, color: 'var(--text-1)' }}>
            <strong style={{ display: 'block', marginBottom: 6, color: 'var(--accent)' }}>📖 Passo a passo de instalação na Nuvemshop:</strong>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>No painel da sua Nuvemshop, acesse a área de <strong>Configurações</strong> &gt; <strong>Canais de Venda / Aplicativos</strong> (ou pelo Portal de Parceiros da Nuvemshop).</li>
              <li>Cadastre uma nova notificação de Webhook para os eventos <code>order/created</code> (criação de pedido) e <code>order/paid</code> (pedido pago).</li>
              <li>Cole a URL abaixo no campo correspondente (ela já contém seu token de autenticação seguro embutido).</li>
              <li>Salve as configurações para que todos os pedidos pagos entrem no painel em tempo real.</li>
            </ol>
          </div>
        )}

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
            URL do Webhook na Nuvemshop (Eventos: order/created, order/paid)
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={nuvemshopUrl}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-card2)',
                color: 'var(--text-1)',
              }}
            />
            <CopyBtn text={nuvemshopUrl} />
          </div>
        </div>
      </div>

      {/* Integração 3: Webhook Genérico (CRM, n8n, Typebot, WhatsApp) */}
      <div className="card" style={{ padding: 18, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} color="var(--accent)" strokeWidth={2} />
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Webhook Genérico (CRM, n8n, Typebot, WhatsApp)</h4>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={() => toggleGuide('crm')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <BookOpen size={12} />
            <span>{openGuide === 'crm' ? 'Ocultar guia' : 'Como configurar no n8n / CRM'}</span>
            {openGuide === 'crm' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          Envie leads ou vendas externas de qualquer ferramenta (RD Station, Kommo, Typebot, n8n, Make).
        </p>

        {/* Guia Passo a Passo CRM / n8n */}
        {openGuide === 'crm' && (
          <div style={{ background: 'var(--bg-card2)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.6, color: 'var(--text-1)' }}>
            <strong style={{ display: 'block', marginBottom: 6, color: 'var(--accent)' }}>📖 Passo a passo para n8n, Make, Typebot e CRMs:</strong>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>No seu fluxo de automação, crie um nó de requisição HTTP com o método <code>POST</code>.</li>
              <li>Cole a <strong>URL Inbound</strong> abaixo.</li>
              <li>No cabeçalho (Headers), inclua: <code>Authorization: Bearer {webhookToken}</code> (ou use o header <code>x-webhook-token</code>).</li>
              <li>Envie o corpo da requisição em formato JSON com os campos correspondentes (veja os exemplos abaixo).</li>
            </ol>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
              URL Inbound (POST)
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={inboundUrl}
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card2)',
                  color: 'var(--text-1)',
                }}
              />
              <CopyBtn text={inboundUrl} />
            </div>
          </div>

          <div style={{ background: 'var(--bg-card2)', padding: 12, borderRadius: 8, fontSize: 11, color: 'var(--text-2)' }}>
            <strong>Header de Autenticação:</strong> <code>Authorization: Bearer {webhookToken}</code><br />
            <strong>Exemplo de Payload de Lead:</strong> <code>&#123; "nome": "Maria Silva", "telefone": "(11) 99999-9999", "email": "maria@email.com", "origem": "RD Station" &#125;</code><br />
            <strong>Exemplo de Registro de Venda:</strong> <code>&#123; "tipo": "venda", "valor": 197.00, "status": "paid", "customer_name": "Maria Silva" &#125;</code>
          </div>
        </div>
      </div>

      {/* Teste e Salvar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={testing}
          onClick={handleTestWebhook}
        >
          <Send size={14} /> {testing ? 'Testando conexão…' : 'Enviar Ping de Teste'}
        </button>

        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={handleSave}
        >
          <Check size={16} /> {saving ? 'Salvando…' : 'Salvar Configurações'}
        </button>
      </div>

      {testResult && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: testResult.ok ? 'var(--green-soft)' : 'var(--red-soft)',
            color: testResult.ok ? 'var(--green)' : 'var(--red)',
            border: `1px solid ${testResult.ok ? 'var(--green)' : 'var(--red)'}`,
          }}
        >
          {testResult.ok ? <ShieldCheck size={16} /> : null}
          {testResult.message}
        </div>
      )}
    </div>
  )
}
