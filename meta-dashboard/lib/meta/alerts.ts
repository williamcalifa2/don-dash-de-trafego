import type { AlertInput } from './limits'
import { metaConfig } from './config'
import { redact, redactPii } from './redact'

/** Envia o alerta ao webhook configurado (Slack/Discord/n8n...). Nunca lança e nunca inclui segredos ou dados pessoais. */
export async function webhookNotify(a: AlertInput): Promise<void> {
  const url = metaConfig().alertWebhookUrl
  if (!url) return
  const text = redactPii(redact(`[${a.level.toUpperCase()}] ${a.kind}${a.clientId ? ` (cliente ${a.clientId.slice(0, 8)})` : ''}: ${a.message}`))
  try {
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text, level: a.level, kind: a.kind }),
      signal: AbortSignal.timeout(5000), cache: 'no-store',
    })
  } catch { /* alerta é auxiliar: falha de entrega não afeta a sincronização */ }
}
