/** App da Shopify (distribuição personalizada): link de instalação, retorno OAuth e cadastro automático dos webhooks. */
import crypto from 'node:crypto'
import { SHOPIFY_API_VERSION, shopifyHost } from './shopifyCatalog'
import { verifyShopifyHmac } from './integrations'

/** Permissões que o app pede na instalação (têm que estar iguais na versão do app no Dev Dashboard). */
export const APP_SCOPES = ['read_products', 'read_orders', 'read_customers', 'read_checkouts']

/** Eventos que o app cadastra sozinho na loja. */
export const APP_WEBHOOK_TOPICS = ['orders/create', 'orders/paid', 'orders/cancelled', 'orders/updated', 'orders/delete', 'checkouts/create', 'checkouts/update', 'refunds/create', 'app/uninstalled']

export const appCredentials = (): { id: string; secret: string } | null => {
  const id = process.env.SHOPIFY_APP_CLIENT_ID, secret = process.env.SHOPIFY_APP_CLIENT_SECRET
  return id && secret ? { id, secret } : null
}

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const sign = (body: string) => crypto.createHmac('sha256', process.env.DASHBOARD_SESSION_SECRET ?? 'dev-shopify').update(`shopify-state:${body}`).digest('base64url')

/** Estado que vai e volta na instalação: diz de qual cliente é a loja e expira em 30 min (evita link reaproveitado). */
export function makeState(slug: string, now = Date.now()): string {
  const body = b64(JSON.stringify({ s: slug, e: now + 30 * 60_000 }))
  return `${body}.${sign(body)}`
}

export function readState(state: string | null | undefined, now = Date.now()): string | null {
  if (!state) return null
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  const want = sign(body)
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { s?: string; e?: number }
    return p.s && typeof p.e === 'number' && p.e > now ? p.s : null
  } catch { return null }
}

export function redirectUri(origin: string): string { return `${origin}/api/shopify/callback` }

export function installUrl(shop: string, slug: string, origin: string): string | null {
  const host = shopifyHost(shop), app = appCredentials()
  if (!host || !app) return null
  const q = new URLSearchParams({ client_id: app.id, scope: APP_SCOPES.join(','), redirect_uri: redirectUri(origin), state: makeState(slug) })
  return `https://${host}/admin/oauth/authorize?${q.toString()}`
}

/** Confere a assinatura que a Shopify põe na volta da instalação (todos os parâmetros, menos o próprio hmac, ordenados). */
export function verifyOAuthQuery(params: URLSearchParams, secret: string): boolean {
  const given = params.get('hmac')
  if (!given) return false
  const msg = [...params.entries()].filter(([k]) => k !== 'hmac').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const want = crypto.createHmac('sha256', secret).update(msg).digest('hex')
  return given.length === want.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

export async function exchangeCode(shop: string, code: string): Promise<{ token: string; scope: string }> {
  const app = appCredentials()
  if (!app) throw new Error('App da Shopify não configurado no servidor')
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: app.id, client_secret: app.secret, code }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Shopify recusou o código de instalação (${res.status})`)
  const j = await res.json() as { access_token?: string; scope?: string }
  if (!j.access_token) throw new Error('Shopify não devolveu o token de acesso')
  return { token: j.access_token, scope: j.scope ?? '' }
}

/** Cadastra os webhooks do app apontando para o endereço do cliente. Quem já existe é ignorado. Devolve o que ficou ativo. */
export async function registerWebhooks(shop: string, token: string, address: string): Promise<{ ok: string[]; failed: Array<{ topic: string; why: string }> }> {
  const base = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`
  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' }
  const listed = await fetch(`${base}/webhooks.json?limit=250&fields=topic,address`, { headers, cache: 'no-store' })
  const have = new Set<string>()
  if (listed.ok) for (const w of ((await listed.json()) as { webhooks?: Array<{ topic: string; address: string }> }).webhooks ?? []) if (w.address === address) have.add(w.topic)
  const ok: string[] = [], failed: Array<{ topic: string; why: string }> = []
  for (const topic of APP_WEBHOOK_TOPICS) {
    if (have.has(topic)) { ok.push(topic); continue }
    const res = await fetch(`${base}/webhooks.json`, { method: 'POST', headers, body: JSON.stringify({ webhook: { topic, address, format: 'json' } }), cache: 'no-store' })
    if (res.ok) ok.push(topic)
    else failed.push({ topic, why: `${res.status}` })
  }
  return { ok, failed }
}

/** Webhook vale se vier assinado com a chave que o cliente cadastrou (cadastro manual) ou com o segredo do app (cadastro automático, só da loja conectada). */
export function shopifyWebhookAuthorized(a: { raw: string; signature: string | null; shopHeader: string | null; storeSecret?: string; connectedShop?: string; appSecret?: string }): boolean {
  if (a.storeSecret && verifyShopifyHmac(a.raw, a.signature, a.storeSecret)) return true
  const shop = shopifyHost(a.connectedShop)
  return Boolean(a.appSecret && shop && (a.shopHeader ?? '').toLowerCase() === shop && verifyShopifyHmac(a.raw, a.signature, a.appSecret))
}
