import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { getTenant } from '@/lib/tenant'
import { getClientConfig, setClientConfig, type ClientConfig } from '@/lib/clientConfig'
import { trackKey } from '@/lib/storeTrack'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params

  // Tenant can read their own config, or an admin can read any client's config
  const tenant = await getTenant(req)
  const isAdmin = !await requireAdmin(req)
  if (!isAdmin && (!tenant || tenant.slug !== slug)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const config = await getClientConfig(slug)
  // Só a equipe vê chaves e segredos; a conta do cliente recebe a configuração sem eles.
  if (!isAdmin && config.integrations) {
    const { shopifySecret, shopifyToken, shopifyClientSecret, nuvemshopSecret, webhookToken, ...safe } = config.integrations
    void shopifySecret; void shopifyToken; void shopifyClientSecret; void nuvemshopSecret; void webhookToken
    return NextResponse.json({ ...config, integrations: safe })
  }
  return NextResponse.json({ ...config, trackKey: trackKey(slug) })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const tenant = await getTenant(req)
  const isAdmin = !await requireAdmin(req)
  const isMember = !await requireRole(req, 'member')
  const isOwnTenant = Boolean(tenant && tenant.slug === slug)

  if (!isAdmin && !isMember && !isOwnTenant) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Partial<ClientConfig> = {}

  if ((isAdmin || isMember) && 'active' in body && typeof body.active === 'boolean') {
    patch.active = body.active
  }
  if ((isAdmin || isMember) && 'ecommerce' in body && typeof body.ecommerce === 'boolean') {
    patch.ecommerce = body.ecommerce
  }
  if ('strategicObjective' in body && typeof body.strategicObjective === 'string') {
    patch.strategicObjective = body.strategicObjective.slice(0, 2000)
  }
  if ('goalsPeriod' in body && typeof body.goalsPeriod === 'string') {
    patch.goalsPeriod = body.goalsPeriod.slice(0, 4000)
  }
  if ('funnelGoals' in body && typeof body.funnelGoals === 'string') {
    patch.funnelGoals = body.funnelGoals.slice(0, 4000)
  }
  if ('targetBudget' in body) {
    const num = Number(body.targetBudget)
    patch.targetBudget = !isNaN(num) && num >= 0 ? num : undefined
  }
  if ((isAdmin || isMember) && 'integrations' in body && typeof body.integrations === 'object' && body.integrations !== null) {
    const raw = body.integrations as Record<string, unknown>
    // Mescla com o que já existe: campos que a instalação do app preenche (escopos, data, webhooks) não podem se perder ao salvar.
    const current = (await getClientConfig(slug)).integrations ?? {}
    patch.integrations = {
      ...current,
      webhookToken: typeof raw.webhookToken === 'string' ? raw.webhookToken.slice(0, 100) : undefined,
      shopifySecret: typeof raw.shopifySecret === 'string' ? raw.shopifySecret.slice(0, 200) : undefined,
      shopifyStoreUrl: typeof raw.shopifyStoreUrl === 'string' ? raw.shopifyStoreUrl.trim().slice(0, 120) || undefined : undefined,
      shopifyDomain: typeof raw.shopifyDomain === 'string' ? raw.shopifyDomain.trim().slice(0, 120) || undefined : undefined,
      shopifyToken: typeof raw.shopifyToken === 'string' ? raw.shopifyToken.trim().slice(0, 200) || undefined : undefined,
      shopifyClientId: typeof raw.shopifyClientId === 'string' ? raw.shopifyClientId.trim().slice(0, 200) || undefined : undefined,
      shopifyClientSecret: typeof raw.shopifyClientSecret === 'string' ? raw.shopifyClientSecret.trim().slice(0, 200) || undefined : undefined,
      nuvemshopSecret: typeof raw.nuvemshopSecret === 'string' ? raw.nuvemshopSecret.slice(0, 200) : undefined,
      slaTargetMinutes: typeof raw.slaTargetMinutes === 'number' && raw.slaTargetMinutes > 0 ? Math.round(raw.slaTargetMinutes) : 15,
      businessHoursOnly: typeof raw.businessHoursOnly === 'boolean' ? raw.businessHoursOnly : false,
    }
  }

  const updated = await setClientConfig(slug, patch)
  return NextResponse.json({ ok: true, config: updated })
}

