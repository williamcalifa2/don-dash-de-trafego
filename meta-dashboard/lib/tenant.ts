import { NextRequest, NextResponse } from 'next/server'
import { authEnabled, readSession, signSession, SESSION_COOKIE } from './auth'
import { codeHash, hashesEqual } from './accessCode'
import { ADMIN_SLUG, isAdminSession, VIEW_COOKIE } from './admin'
import { logoPublicUrl } from './logo'
import { getSupabaseServer, DEFAULT_SLUG, resolveDefaultClientId } from './supabase'
import { legacyGet } from './meta/legacy'
import { liveOrigin } from './meta/mode'

export interface Tenant {
  slug: string
  clientId: string
  name: string
  logoUrl: string | null
  adAccountId: string | null
  pageId: string | null
}

interface ClientRow {
  id: string
  slug: string
  display_name: string | null
  logo_url: string | null
  ad_account_id: string | null
  page_id: string | null
  access_code_hash: string | null
  failed_attempts: number | null
  locked_until: string | null
}

const COLUMNS = 'id, slug, display_name, logo_url, ad_account_id, page_id, access_code_hash, failed_attempts, locked_until'
const TTL = 60_000
const cache = new Map<string, { row: ClientRow | null; at: number }>()

const actId = (v: string | null | undefined) => (v ? (v.startsWith('act_') ? v : `act_${v.replace(/\D/g, '')}`) : null)

async function fetchClient(by: 'slug' | 'page_id' | 'ad_account_id', value: string): Promise<ClientRow | null> {
  const key = `${by}:${value}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.row
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('clients').select(COLUMNS).eq(by, value).maybeSingle()
  const row = (data as ClientRow | null) ?? null
  cache.set(key, { row, at: Date.now() })
  return row
}

function toTenant(row: ClientRow): Tenant {
  const isDefault = row.slug === DEFAULT_SLUG()
  return {
    slug: row.slug,
    clientId: row.id,
    name: row.display_name ?? (isDefault ? process.env.NEXT_PUBLIC_CLIENT_NAME : undefined) ?? row.slug,
    logoUrl: logoPublicUrl(row.slug, row.logo_url) ?? (isDefault ? process.env.NEXT_PUBLIC_CLIENT_LOGO_URL ?? null : null),
    adAccountId: actId(row.ad_account_id ?? (isDefault ? process.env.META_AD_ACCOUNT_ID : null)),
    pageId: row.page_id,
  }
}

/** Cliente usado quando o login por token está desligado (comportamento antigo, um cliente só). */
async function defaultTenant(): Promise<Tenant | null> {
  const db = getSupabaseServer()
  const slug = DEFAULT_SLUG()
  const clientId = db ? await resolveDefaultClientId(db) : null
  if (!clientId) return null
  const row = await fetchClient('slug', slug).catch(() => null)
  return {
    slug,
    clientId,
    name: row?.display_name ?? process.env.NEXT_PUBLIC_CLIENT_NAME ?? 'Meta Ads Dashboard',
    logoUrl: logoPublicUrl(slug, row?.logo_url) ?? process.env.NEXT_PUBLIC_CLIENT_LOGO_URL ?? null,
    adAccountId: actId(row?.ad_account_id ?? process.env.META_AD_ACCOUNT_ID),
    pageId: row?.page_id ?? null,
  }
}

export async function getTenant(req: NextRequest): Promise<Tenant | null> {
  if (!authEnabled()) return defaultTenant()
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return null
  if (session.s === ADMIN_SLUG) {
    // Administrador vendo o painel de um cliente escolhido.
    const view = req.cookies.get(VIEW_COOKIE)?.value
    if (!view || !(await isAdminSession(session))) return null
    const viewed = await fetchClient('slug', view)
    return viewed ? toTenant(viewed) : null
  }
  const row = await fetchClient('slug', session.s)
  if (!row?.access_code_hash || !row.access_code_hash.startsWith(session.h)) return null
  return toTenant(row)
}

export function clearClientCache() { cache.clear() }

/** Use nas rotas: devolve o cliente da sessão ou uma resposta 401. */
export async function requireTenant(req: NextRequest): Promise<Tenant | NextResponse> {
  const tenant = await getTenant(req)
  return tenant ?? NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

export const MAX_ATTEMPTS = 5
export const LOCK_MINUTES = 10

export type CodeResult =
  | { ok: true; session: string }
  | { ok: false; reason: 'invalid' | 'locked'; minutes?: number }

/** Confere o código de 6 dígitos de um cliente. Erros seguidos bloqueiam o cliente por alguns minutos (contado no banco). */
export async function loginWithCode(slug: string, code: string): Promise<CodeResult> {
  const db = getSupabaseServer()
  if (!db || !/^\d{6}$/.test(code)) return { ok: false, reason: 'invalid' }
  // Leitura direta (sem cache): o contador de erros precisa estar sempre atualizado.
  const { data } = await db.from('clients').select(COLUMNS).eq('slug', slug).maybeSingle()
  const row = data as ClientRow | null
  if (!row?.access_code_hash) return { ok: false, reason: 'invalid' }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: 'locked', minutes: Math.max(1, Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000)) }
  }

  if (hashesEqual(codeHash(slug, code), row.access_code_hash)) {
    if ((row.failed_attempts ?? 0) > 0) await db.from('clients').update({ failed_attempts: 0, locked_until: null }).eq('slug', slug)
    clearClientCache()
    return { ok: true, session: await signSession({ s: slug, h: row.access_code_hash.slice(0, 16) }) }
  }

  const attempts = (row.failed_attempts ?? 0) + 1
  if (attempts >= MAX_ATTEMPTS) {
    await db.from('clients').update({ failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() }).eq('slug', slug)
    return { ok: false, reason: 'locked', minutes: LOCK_MINUTES }
  }
  await db.from('clients').update({ failed_attempts: attempts }).eq('slug', slug)
  return { ok: false, reason: 'invalid' }
}

/** Cliente pelo endereço (slug), para as rotas de administração. */
export async function tenantBySlug(slug: string): Promise<Tenant | null> {
  const row = await fetchClient('slug', slug)
  return row ? toTenant(row) : null
}

/** Dados públicos para a tela de acesso (nome e logo do cliente). */
export async function publicClient(slug: string): Promise<{ slug: string; name: string; logoUrl: string | null } | null> {
  const row = await fetchClient('slug', slug)
  if (!row) return null
  const t = toTenant(row)
  return { slug: t.slug, name: t.name, logoUrl: t.logoUrl }
}

const adAccountCache = new Map<string, { account: string | null; at: number }>()

/** Conta de anúncios (act_...) à qual um anúncio pertence. */
async function adAccountOf(adId: string): Promise<string | null> {
  if (!process.env.META_ACCESS_TOKEN || !/^\d{5,25}$/.test(adId)) return null
  const hit = adAccountCache.get(adId)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.account
  const r = await legacyGet<{ account_id?: string }>(`${adId}?fields=account_id`, { purpose: 'webhook:conta-do-anuncio', origin: await liveOrigin() })
  if (!r.ok) return null
  const account = r.data.account_id ? `act_${r.data.account_id}` : null
  adAccountCache.set(adId, { account, at: Date.now() })
  return account
}

/**
 * Webhook: descobre de qual cliente é o lead.
 * 1) página cadastrada; 2) conta de anúncios do anúncio que gerou o lead;
 * 3) se só existe um cliente, ele. Com vários clientes e sem pista, retorna null (lead não é atribuído a ninguém).
 */
export async function clientIdForLead(pageId: string, adId: string): Promise<string | null> {
  if (pageId) {
    const byPage = await fetchClient('page_id', pageId)
    if (byPage) return byPage.id
  }
  const db = getSupabaseServer()
  if (!db) return null

  const account = adId ? await adAccountOf(adId) : null
  if (account) {
    const byAccount = await fetchClient('ad_account_id', account)
    if (byAccount) return byAccount.id
    // Cliente padrão que ainda usa a conta definida em META_AD_ACCOUNT_ID.
    const envAccount = process.env.META_AD_ACCOUNT_ID
    if (envAccount && actId(envAccount) === account) return resolveDefaultClientId(db)
  }

  const { count } = await db.from('clients').select('id', { count: 'exact', head: true })
  if ((count ?? 0) <= 1) return resolveDefaultClientId(db)
  return null
}
