import type { Tenant } from './tenant'
import { legacyGet } from './meta/legacy'
import { snapshotMode } from './meta/mode'
import { ownsFromSnapshots } from './meta/read'
import { stores } from './meta/pipeline'
import { StoreNotMigrated } from './meta/limits'

const TTL = 10 * 60_000
const cache = new Map<string, { ok: boolean; at: number }>()

/** Confere se uma campanha/conjunto/anúncio pertence à conta de anúncios do cliente. */
export async function tenantOwns(tenant: Tenant, id: string): Promise<boolean> {
  if (await snapshotMode()) {
    if (!/^\d{5,25}$/.test(id)) return false
    try { return await ownsFromSnapshots(stores.snaps, tenant.clientId, id) } catch (e) { if (e instanceof StoreNotMigrated) return false; throw e }
  }
  if (!process.env.META_ACCESS_TOKEN || !tenant.adAccountId || !/^\d{5,25}$/.test(id)) return false
  const key = `${tenant.slug}:${id}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.ok
  const r = await legacyGet<{ account_id?: string }>(`${id}?fields=account_id`, { accountId: tenant.adAccountId, clientId: tenant.clientId, purpose: 'posse' })
  // Falha de rede/limite não é "não pertence": não guarda no cache, para tentar de novo depois.
  if (!r.ok) return false
  const ok = !!r.data.account_id && `act_${r.data.account_id}` === tenant.adAccountId
  cache.set(key, { ok, at: Date.now() })
  return ok
}
