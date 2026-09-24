'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, RefreshCw, Send, ShieldCheck, ShoppingBag, Clock, Sparkles, ExternalLink, Zap } from 'lucide-react'
import type { ClientConfig, ClientIntegrationsConfig } from '@/lib/clientConfig'
import { generateWebhookToken } from '@/lib/integrations'
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
        } catch {}
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
  const [slaTargetMinutes, setSlaTargetMinutes] = useState(15)

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
        setSlaTargetMinutes(integ.slaTargetMinutes || 15)
      })
      .catch(() => {})
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
        slaTargetMinutes: Number(slaTargetMinutes) > 0 ? Number(slaTargetMinutes) : 15,
      }

      const res = await fetch(`/api/admin/clients/${slug}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations }),
      })

      if (!res.ok) throw new Error('Falha ao salvar integrações')
      onNotice('Integrações e configurações de SLA salvas com sucesso!')
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

  if (loading) {
    return <PulseLoader size={40} caption="Carregando integrações..." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Zap size={20} color="var(--accent)" strokeWidth={2} />
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Webhooks & Integrações</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
          Conecte Shopify, Nuvemshop, CRMs (RD Station, Kommo) e configure o tempo limite de SLA para <strong>{clientName}</strong>.
        </p>
      </div>

      {/* SLA Setting */}
      <div className="card" style={{ padding: 16, background: 'var(--bg-card2)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Clock size={18} color="var(--amber)" strokeWidth={2} />
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Meta de SLA de Atendimento</h4>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          Tempo máximo esperado para a equipe realizar o primeiro contato com o lead após a entrada. Leads que ultrapassarem essa meta serão marcados como "SLA Estourado".
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={1}
              max={1440}
              value={slaTargetMinutes}
              onChange={e => setSlaTargetMinutes(Number(e.target.value))}
              style={{
                width: 90,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-1)',
                fontSize: 14,
                fontWeight: 600,
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>minutos</span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[15, 30, 60, 120].map(mins => (
              <button
                key={mins}
                type="button"
                className={`btn btn-sm ${slaTargetMinutes === mins ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSlaTargetMinutes(mins)}
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ShoppingBag size={18} color="#95bf47" strokeWidth={2} />
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Shopify</h4>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          Receba pedidos pagos, carrinhos abandonados e cálculo de ROAS Real em tempo real.
        </p>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ShoppingBag size={18} color="#2d3277" strokeWidth={2} />
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Nuvemshop</h4>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          Sincronização de vendas e pedidos para cálculo automático de faturamento e ticket médio.
        </p>

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

      {/* Integração 3: Webhook Genérico (CRM / n8n / Typebot / SLA) */}
      <div className="card" style={{ padding: 18, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Zap size={18} color="var(--accent)" strokeWidth={2} />
          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Webhook Genérico (CRM, n8n, Typebot, WhatsApp)</h4>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          Envie leads de qualquer ferramenta externa ou envie eventos de atendimento para fechar o cálculo de SLA.
        </p>

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
            <strong>Exemplo de Payload de Lead:</strong> <code>&#123; "nome": "Maria", "telefone": "(11) 99999-9999", "origem": "RD Station" &#125;</code><br />
            <strong>Exemplo de Fechamento de SLA:</strong> <code>&#123; "tipo": "atendimento", "telefone": "(11) 99999-9999", "atendido_por": "Vendedor 1" &#125;</code>
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

