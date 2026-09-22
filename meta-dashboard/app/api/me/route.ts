import { NextRequest, NextResponse } from 'next/server'
import { authEnabled } from '@/lib/auth'
import { requireTenant } from '@/lib/tenant'
import { isAdmin, requestRole } from '@/lib/admin'
import { platformsFor } from '@/lib/platforms'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  return NextResponse.json({ slug: tenant.slug, name: tenant.name, logoUrl: tenant.logoUrl, platforms: platformsFor(tenant), authEnabled: authEnabled(), admin: await isAdmin(req), role: await requestRole(req) })
}
