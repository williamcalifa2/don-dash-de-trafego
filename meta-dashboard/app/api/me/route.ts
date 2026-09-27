import { NextRequest, NextResponse } from 'next/server'
import { authEnabled } from '@/lib/auth'
import { getTenant } from '@/lib/tenant'
import { canSee, scopeFor } from '@/lib/scope'
import { isAdmin, requestRole, VIEW_COOKIE } from '@/lib/admin'
import { platformsFor } from '@/lib/platforms'
import { getClientConfig, hasEcommerce } from '@/lib/clientConfig'
import { notePresence } from '@/lib/usageStore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenant = await getTenant(req)
  if (!tenant) {
    // Gestor abrindo, por endereço direto, um cliente que não é da carteira dele: a tela volta para a administração.
    const view = req.cookies.get(VIEW_COOKIE)?.value
    const scope = await scopeFor(req)
    if (view && scope.slugs && !canSee(scope, view)) return NextResponse.json({ error: 'out_of_scope' }, { status: 403 })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  await notePresence(req, tenant.slug)
  const cfg = await getClientConfig(tenant.slug)
  const ecommerce = hasEcommerce(cfg)
  const google = Boolean(cfg.googleAdsCustomerId)
  const ga4 = Boolean(cfg.ga4PropertyId)
  return NextResponse.json({ slug: tenant.slug, name: tenant.name, logoUrl: tenant.logoUrl, ecommerce, ga4, platforms: platformsFor({ ...tenant, ecommerce, google }), authEnabled: authEnabled(), admin: await isAdmin(req), role: await requestRole(req) })
}
