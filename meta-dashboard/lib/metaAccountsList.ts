import { legacyGet } from './meta/legacy'
import { getSupabaseServer } from './supabase'
import type { Origin } from './meta/client'

/** Lista de contas de anúncios e páginas que o token enxerga, guardada no banco (meta_settings) para o cadastro de cliente nunca ficar sem lista. */
const KEY = 'meta_accounts_cache'
export const FRESH_MS = 10 * 60_000
export const REFRESH_MS = 12 * 3_600_000

export interface AccountOpt { id: string; name: string; currency?: string; status?: number }
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

/** Consulta a Meta e, se vier lista, guarda. Devolve o erro (texto) quando não veio. */
export async function fetchAccounts(origin: Origin): Promise<{ cache: AccountsCache | null; error?: string }> {
  const get = async (path: string) => {
    const r = await legacyGet<{ data?: Array<Record<string, string>> }>(`${path}&limit=100`, { purpose: 'admin:contas', origin })
    return { data: r.ok ? (r.data.data ?? []) : [] as Array<Record<string, string>>, error: r.ok ? undefined : r.error?.message }
  }
  const [acc, pg] = await Promise.all([get('me/adaccounts?fields=account_id,name,currency,account_status'), get('me/accounts?fields=id,name')])
  if (acc.error || !acc.data.length) return { cache: null, error: acc.error ?? 'A Meta não devolveu contas.' }
  const cache: AccountsCache = {
    at: Date.now(),
    accounts: acc.data.map(a => ({ id: `act_${a.account_id}`, name: a.name, currency: a.currency, status: Number(a.account_status) })),
    pages: pg.data.map(p => ({ id: p.id, name: p.name })),
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
