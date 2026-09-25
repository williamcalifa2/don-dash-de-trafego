import { getSupabaseServer } from './supabase'

export interface ClientIntegrationsConfig {
  webhookToken?: string
  shopifySecret?: string
  /** Leitura do catálogo (fotos e links reais). Ver lib/shopifyCatalog.ts */
  /** endereço público da loja, para ler fotos e links de /products.json */
  shopifyStoreUrl?: string
  shopifyDomain?: string
  shopifyToken?: string
  shopifyClientId?: string
  shopifyClientSecret?: string
  /** preenchidos pela instalação do app (não editar à mão) */
  shopifyScopes?: string
  shopifyConnectedAt?: string
  /** quando o histórico da loja foi importado (uma vez, sozinho) */
  shopifyBackfilledAt?: string
  shopifyWebhooks?: string[]
  nuvemshopSecret?: string
  slaTargetMinutes?: number // ex: 15 min
  businessHoursOnly?: boolean
}

export interface ClientConfig {
  /** o cliente vende em loja virtual: libera a aba E-commerce e mostra a logo da plataforma */
  ecommerce?: boolean
  active: boolean // true = ativo (sincronizando), false = pausado (sem chamadas à API)
  strategicObjective?: string
  goalsPeriod?: string
  funnelGoals?: string
  targetBudget?: number
  integrations?: ClientIntegrationsConfig
  updatedAt?: string
}

const DEFAULT_CONFIG: ClientConfig = {
  active: true,
  strategicObjective: '',
  goalsPeriod: '',
  funnelGoals: '',
  targetBudget: undefined,
  integrations: {
    slaTargetMinutes: 15,
  },
}

const CONFIG_PREFIX = 'client_config_'
const ALL_CONFIG_KEY = 'clients_configs_map'

// In-memory cache for speed with TTL 30s
const memCache = new Map<string, { config: ClientConfig; at: number }>()
const TTL = 30_000

export async function getClientConfig(slug: string): Promise<ClientConfig> {
  const hit = memCache.get(slug)
  if (hit && Date.now() - hit.at < TTL) return hit.config

  const db = getSupabaseServer()
  if (!db) return DEFAULT_CONFIG

  try {
    const key = `${CONFIG_PREFIX}${slug}`
    const { data } = await db.from('meta_settings').select('value').eq('key', key).maybeSingle()
    const val = (data as { value: unknown } | null)?.value as Partial<ClientConfig> | undefined
    const res: ClientConfig = {
      ...DEFAULT_CONFIG,
      ...(val && typeof val === 'object' ? val : {}),
      active: val?.active !== false, // default true unless explicitly false
    }
    memCache.set(slug, { config: res, at: Date.now() })
    return res
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function setClientConfig(slug: string, patch: Partial<ClientConfig>): Promise<ClientConfig> {
  const current = await getClientConfig(slug)
  const updated: ClientConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  const db = getSupabaseServer()
  if (db) {
    const key = `${CONFIG_PREFIX}${slug}`
    await db.from('meta_settings').upsert({
      key,
      value: updated,
      updated_at: updated.updatedAt,
    }, { onConflict: 'key' })
  }

  memCache.set(slug, { config: updated, at: Date.now() })
  return updated
}

export async function isClientPaused(slug: string): Promise<boolean> {
  const config = await getClientConfig(slug)
  return !config.active
}

export async function getAllClientsConfig(slugs: string[]): Promise<Record<string, ClientConfig>> {
  const db = getSupabaseServer()
  const out: Record<string, ClientConfig> = {}
  if (!db || slugs.length === 0) return out

  try {
    const keys = slugs.map(s => `${CONFIG_PREFIX}${s}`)
    const { data } = await db.from('meta_settings').select('key, value').in('key', keys)
    const map = new Map<string, Partial<ClientConfig>>()
    for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
      if (row.value && typeof row.value === 'object') {
        const s = row.key.replace(CONFIG_PREFIX, '')
        map.set(s, row.value as Partial<ClientConfig>)
      }
    }
    for (const s of slugs) {
      const val = map.get(s)
      out[s] = {
        ...DEFAULT_CONFIG,
        ...(val ?? {}),
        active: val?.active !== false,
      }
      memCache.set(s, { config: out[s], at: Date.now() })
    }
  } catch {
    for (const s of slugs) {
      out[s] = DEFAULT_CONFIG
    }
  }
  return out
}


/** Acha o cliente cuja loja Shopify tem este endereço (xxx.myshopify.com). Usado quando a instalação começa na Shopify, sem estado nosso. */
export async function findSlugByShop(shop: string): Promise<string | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('meta_settings').select('key').like('key', `${CONFIG_PREFIX}%`).filter('value->integrations->>shopifyDomain', 'eq', shop).limit(2)
  const rows = (data ?? []) as Array<{ key: string }>
  return rows.length === 1 ? rows[0].key.slice(CONFIG_PREFIX.length) : null
}

/** Cliente com e-commerce: vale o que foi marcado no cadastro; sem marcação (clientes antigos), vale se já há loja configurada. */
export function hasEcommerce(cfg: Pick<ClientConfig, 'ecommerce' | 'integrations'>): boolean {
  if (typeof cfg.ecommerce === 'boolean') return cfg.ecommerce
  const i = cfg.integrations ?? {}
  return Boolean(i.shopifyConnectedAt || i.shopifyDomain || i.shopifyStoreUrl || i.shopifySecret)
}
