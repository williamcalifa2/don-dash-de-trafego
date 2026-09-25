import { NextRequest, NextResponse } from 'next/server'
import { authEnabled } from '@/lib/auth'
import { requireTenant } from '@/lib/tenant'
import { isAdmin, requestRole } from '@/lib/admin'
import { platformsFor } from '@/lib/platforms'
import { getClientConfig, hasEcommerce } from '@/lib/clientConfig'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const ecommerce = hasEcommerce(await getClientConfig(tenant.slug))
  return NextResponse.json({ slug: tenant.slug, name: tenant.name, logoUrl: tenant.logoUrl, ecommerce, platforms: platformsFor({ ...tenant, ecommerce }), authEnabled: authEnabled(), admin: await isAdmin(req), role: await requestRole(req) })
}
