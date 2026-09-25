/** Catálogo da loja Shopify (foto e link reais dos produtos). Só leitura, pela Admin API. */
export const SHOPIFY_API_VERSION = '2026-04'

export interface ShopifyCreds {
  /** endereço público da loja (ex.: meumagtag.com.br). Lê /products.json, sem credencial nenhuma. */
  storeUrl?: string
  domain?: string
  /** token de app personalizado antigo (shpat_...) */
  token?: string
  /** apps criados no Dev Dashboard trocam ID + segredo por um token que dura 24 h */
  clientId?: string
  clientSecret?: string
}

export interface CatalogProduct { id: string; title: string; handle: string; image: string | null; url: string | null }

/** Aceita "loja", "loja.myshopify.com" ou uma URL colada; devolve "loja.myshopify.com" (ou null). */
export function shopifyHost(input: string | undefined | null): string | null {
  const raw = (input ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0]
  if (!raw) return null
  const host = raw.includes('.') ? raw : `${raw}.myshopify.com`
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host) ? host : null
}

export const hasShopifyCreds = (c: ShopifyCreds): boolean => Boolean(shopifyHost(c.domain) && (c.token || (c.clientId && c.clientSecret)))

/** Endereço público da loja: só https, com domínio de verdade (nada de IP, localhost ou porta). Devolve "https://dominio" ou null. */
export function publicStoreUrl(input: string | undefined | null): string | null {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return null
  try {
    const u = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`)
    const h = u.hostname
    if (u.protocol !== 'https:' || u.port || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) || /^\d+(\.\d+)+$/.test(h) || h === 'localhost') return null
    return `https://${h}`
  } catch { return null }
}

export const canLoadCatalog = (c: ShopifyCreds): boolean => hasShopifyCreds(c) || Boolean(publicStoreUrl(c.storeUrl))

/** Chave de comparação entre o nome do item do pedido e o título do produto. */
export const normTitle = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

interface RawProduct { id?: number | string; title?: string; handle?: string; image?: { src?: string } | null; images?: Array<{ src?: string }> }

/** Transforma a resposta de products.json em lista enxuta. `storeUrl` é o endereço público da loja (sem barra no fim). */
export function parseProducts(json: unknown, storeUrl: string | null): CatalogProduct[] {
  const list = (json as { products?: RawProduct[] } | null)?.products
  if (!Array.isArray(list)) return []
  return list.filter(p => p && p.title).map(p => ({
    id: String(p.id ?? ''),
    title: String(p.title),
    handle: String(p.handle ?? ''),
    image: p.image?.src ?? p.images?.[0]?.src ?? null,
    url: storeUrl && p.handle ? `${storeUrl}/products/${p.handle}` : null,
  }))
}

/** Acha o produto de um item de pedido: título igual, senão um contido no outro ("Sérum - 30ml" casa com "Sérum"). */
export function matchProduct(products: CatalogProduct[], name: string): CatalogProduct | null {
  const n = normTitle(name)
  if (!n) return null
  return products.find(p => normTitle(p.title) === n)
    ?? products.find(p => { const t = normTitle(p.title); return t.length >= 4 && (n.startsWith(t) || t.startsWith(n)) })
    ?? null
}

const tokens = new Map<string, { token: string; exp: number }>()

async function accessToken(host: string, c: ShopifyCreds): Promise<string> {
  if (c.token) return c.token
  const hit = tokens.get(host)
  if (hit && hit.exp > Date.now() + 60_000) return hit.token
  const res = await fetch(`https://${host}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials' }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Shopify recusou o ID/segredo do app (${res.status})`)
  const j = await res.json() as { access_token?: string; expires_in?: number }
  if (!j.access_token) throw new Error('Shopify não devolveu o token de acesso')
  tokens.set(host, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 86_000) * 1000 })
  return j.access_token
}

async function admin(host: string, token: string, path: string): Promise<{ json: unknown; next: string | null }> {
  const res = await fetch(`https://${host}/admin/api/${SHOPIFY_API_VERSION}/${path}`, { headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' }, cache: 'no-store' })
  if (res.status === 401 || res.status === 403) throw new Error(`Shopify negou o acesso (${res.status}). Confira o token e se o app tem a permissão read_products.`)
  if (!res.ok) throw new Error(`Shopify respondeu ${res.status}`)
  const link = res.headers.get('link') ?? ''
  const m = link.match(/<([^>]+)>;\s*rel="next"/)
  return { json: await res.json(), next: m ? m[1].replace(`https://${host}/admin/api/${SHOPIFY_API_VERSION}/`, '') : null }
}

const cache = new Map<string, { at: number; products: CatalogProduct[] }>()
const TTL = 10 * 60_000

/** Catálogo aberto que toda loja Shopify publica em /products.json. Não precisa de credencial. */
async function loadPublicCatalog(storeUrl: string, force: boolean): Promise<CatalogProduct[]> {
  const hit = cache.get(storeUrl)
  if (!force && hit && Date.now() - hit.at < TTL) return hit.products
  const out: CatalogProduct[] = []
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`${storeUrl}/products.json?limit=250&page=${page}`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; GrupoDon/1.0)' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`A loja não abriu o catálogo público (${res.status}). Confira o endereço ou use as credenciais do app.`)
    const list = parseProducts(await res.json().catch(() => null), storeUrl)
    out.push(...list)
    if (list.length < 250) break
  }
  cache.set(storeUrl, { at: Date.now(), products: out })
  return out
}

/** Lê os produtos da loja (até 1000) com cache de 10 min. Usa o app da Shopify se houver credenciais; senão, o catálogo público. */
export async function loadCatalog(c: ShopifyCreds, force = false): Promise<CatalogProduct[]> {
  if (!hasShopifyCreds(c)) {
    const url = publicStoreUrl(c.storeUrl)
    if (!url) throw new Error('Informe o endereço público da loja (ou as credenciais do app)')
    return loadPublicCatalog(url, force)
  }
  const host = shopifyHost(c.domain) as string
  const hit = cache.get(host)
  if (!force && hit && Date.now() - hit.at < TTL) return hit.products

  const token = await accessToken(host, c)
  const shop = (await admin(host, token, 'shop.json?fields=domain,myshopify_domain')).json as { shop?: { domain?: string } }
  const storeUrl = shop.shop?.domain ? `https://${shop.shop.domain}` : `https://${host}`

  const out: CatalogProduct[] = []
  let path: string | null = 'products.json?limit=250&fields=id,title,handle,image'
  for (let page = 0; path && page < 4; page++) {
    const r = await admin(host, token, path)
    out.push(...parseProducts(r.json, storeUrl))
    path = r.next
  }
  cache.set(host, { at: Date.now(), products: out })
  return out
}
