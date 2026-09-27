import { legacyBatch, legacyGet } from './meta/legacy'
import { getSupabaseServer } from './supabase'
import type { Origin } from './meta/client'

/** Lista de contas de anúncios e páginas que o token enxerga, guardada no banco (meta_settings) para o cadastro de cliente nunca ficar sem lista. */
const KEY = 'meta_accounts_cache'
export const FRESH_MS = 10 * 60_000
export const REFRESH_MS = 12 * 3_600_000

/** Página vinculada à conta de anúncios (a que aparece nos anúncios) e a foto dela. `page: null` = conferido e sem página; ausente = ainda não conferido. */
export interface PageOpt { id: string; name: string; picture: string | null }
export interface AccountOpt { id: string; name: string; currency?: string; status?: number; page?: PageOpt | null; /** quando a página foi conferida (a foto é um endereço que expira, então de tempos em tempos confere de novo) */ pageAt?: number }
export interface AccountsCache { at: number; accounts: AccountOpt[]; pages: Array<{ id: string; name: string }> }

export async function readAccountsCache(): Promise<AccountsCache | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data, error } = await db.from('meta_settings').select('value').eq('key', KEY).maybeSingle()
  const v = (data as { value?: AccountsCache } | null)?.value
  return !error && v && Array.isArray(v.accounts) ? v : null
}

async function writeAccountsCache(c: AccountsCache) {
  const db = getSupabaseServer()
  if (db) await db.from('meta_settings').upsert({ key: KEY, value: c, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

const PAGE_TTL_MS = 5 * 86_400_000
const ENRICH_MAX = 60 // contas conferidas por atualização; o resto entra nas próximas
const ENRICH_CHUNK = 20

/**
 * Descobre a página (nome e foto) de cada conta de anúncios, para a lista de contas ficar reconhecível.
 * Só confere as que ainda não foram conferidas (o resultado fica guardado junto da lista), então é um custo de uma vez só.
 */
export async function enrichPages(origin: Origin, accounts: AccountOpt[], previous?: AccountOpt[]): Promise<AccountOpt[]> {
  const fresh = (a: AccountOpt) => a.page !== undefined && !!a.pageAt && Date.now() - a.pageAt < PAGE_TTL_MS
  const known = new Map((previous ?? []).filter(fresh).map(a => [a.id, a]))
  const out = accounts.map(a => (known.has(a.id) ? { ...a, page: known.get(a.id)!.page, pageAt: known.get(a.id)!.pageAt } : a))
  const todo = out.filter(a => !fresh(a)).slice(0, ENRICH_MAX)
  for (let i = 0; i < todo.length; i += ENRICH_CHUNK) {
    const chunk = todo.slice(i, i + ENRICH_CHUNK)
    const r = await legacyBatch<{ data?: Array<{ id: string; name: string; picture?: { data?: { url?: string } } }> }>(chunk.map(a => `${a.id}/promote_pages?fields=id,name,picture{url}&limit=1`), { purpose: 'admin:contas', origin })
    if (!r.ok) break
    chunk.forEach((a, k) => {
      const part = r.data[k]
      if (!part?.ok) return
      const p = part.data.data?.[0]
      const target = out.find(x => x.id === a.id)!
      target.page = p ? { id: p.id, name: p.name, picture: p.picture?.data?.url ?? null } : null
      target.pageAt = Date.now()
    })
  }
  return out
}

/** Só entram na lista de cadastro as contas dessa Business Manager (evita misturar contas de anúncios pessoais/de outras BMs do dono do token). Sem essa env, a lista vem de `me/adaccounts` sem filtro (comportamento antigo). */
const BUSINESS_ID = process.env.META_BUSINESS_ID?.trim()

/** Consulta a Meta e, se vier lista, guarda. Devolve o erro (texto) quando não veio. */
export async function fetchAccounts(origin: Origin): Promise<{ cache: AccountsCache | null; error?: string }> {
  const get = async (path: string) => {
    const r = await legacyGet<{ data?: Array<Record<string, unknown>> }>(`${path}&limit=100`, { purpose: 'admin:contas', origin })
    return { data: r.ok ? (r.data.data ?? []) : [] as Array<Record<string, unknown>>, error: r.ok ? undefined : r.error?.message }
  }
  // Com BM definida, busca as contas que a BM realmente enxerga: as que ela é dona (owned_ad_accounts)
  // e as de cliente que ela gerencia (client_ad_accounts) — é a mesma lista que aparece no seletor de contas da Meta.
  // Sem BM definida, cai no `me/adaccounts` antigo (todas as contas que o token da pessoa enxerga, de qualquer BM).
  const fields = 'account_id,name,currency,account_status'
  const [owned, client, pg] = await Promise.all([
    BUSINESS_ID ? get(`${BUSINESS_ID}/owned_ad_accounts?fields=${fields}`) : get(`me/adaccounts?fields=${fields}`),
    BUSINESS_ID ? get(`${BUSINESS_ID}/client_ad_accounts?fields=${fields}`) : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: undefined as string | undefined }),
    get('me/accounts?fields=id,name'),
  ])
  if (owned.error && client.error) return { cache: null, error: owned.error ?? client.error }
  const byId = new Map<string, Record<string, unknown>>()
  for (const a of [...owned.data, ...client.data]) byId.set(a.account_id as string, a)
  const acc = { data: [...byId.values()], error: owned.data.length || client.data.length ? undefined : (owned.error ?? client.error) }
  if (acc.error || !acc.data.length) return { cache: null, error: acc.error ?? 'A Meta não devolveu contas.' }
  const previous = await readAccountsCache().catch(() => null)
  const accounts = acc.data.map(a => ({ id: `act_${a.account_id as string}`, name: a.name as string, currency: a.currency as string, status: Number(a.account_status) } as AccountOpt))
  const cache: AccountsCache = {
    at: Date.now(),
    accounts: await enrichPages(origin, accounts, previous?.accounts).catch(() => accounts),
    pages: pg.data.map(p => ({ id: p.id as string, name: p.name as string })),
  }
  await writeAccountsCache(cache).catch(() => {})
  return { cache }
}

/** Chamado pelo ciclo do cron: mantém a lista guardada sem depender de alguém abrir o cadastro. Falha em silêncio (kill switch, limite). */
export async function refreshAccountsIfStale(origin: Origin): Promise<void> {
  if (!process.env.META_ACCESS_TOKEN) return
  const c = await readAccountsCache().catch(() => null)
  if (c && Date.now() - c.at < REFRESH_MS) return
  await fetchAccounts(origin).catch(() => {})
}
