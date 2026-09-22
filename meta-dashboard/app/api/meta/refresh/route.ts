import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { metaConfig } from '@/lib/meta/config'
import { StoreNotMigrated } from '@/lib/meta/limits'
import { stores } from '@/lib/meta/pipeline'
import { requestRefresh } from '@/lib/meta/refresh'
import { invalidateLegacyCache } from '@/lib/meta/legacy'
import { allow } from '@/lib/rateLimit'
import { isAdmin } from '@/lib/admin'
import { snapshotMode } from '@/lib/meta/mode'
import { refreshNow, refreshOrganicNow } from '@/lib/meta/refreshNow'
import { denyReader } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PRESETS = ['today', 'last_7d', 'last_14d', 'last_30d', 'this_month'] as const

/**
 * "Atualizar" do painel: NÃO chama a Meta. Só pede à fila uma atualização desta conta, com resfriamento por conta.
 * O worker decide se e quando roda (limites, TTL, bloqueios e tetos continuam valendo).
 */
export async function POST(req: NextRequest) {
  const readOnly = await denyReader(req)
  if (readOnly) return readOnly
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  // Administrador e equipe: atualiza na hora, sem esperar o ciclo nem o resfriamento (que valem para o cliente).
  if (await isAdmin(req)) {
    invalidateLegacyCache(tenant.clientId)
    const body0 = await req.clone().json().catch(() => ({})) as { organic?: boolean }
    if (body0.organic) {
      if (!allow(`org:${tenant.slug}`, 1, 30_000)) return NextResponse.json({ queued: false, reason: 'cooldown', retryInSec: 30 })
      if (!tenant.adAccountId) return NextResponse.json({ queued: false, reason: 'not_available' })
      const r = await refreshOrganicNow({ clientId: tenant.clientId, slug: tenant.slug, adAccountId: tenant.adAccountId, pageId: tenant.pageId })
      return NextResponse.json({ queued: false, refreshed: r.done, reason: r.done ? undefined : r.reason })
    }
    if (!(await snapshotMode())) return NextResponse.json({ queued: false, refreshed: true, mode: 'live' })
    if (!tenant.adAccountId) return NextResponse.json({ queued: false, reason: 'not_available' })
    if (!allow(`now:${tenant.slug}`, 1, 15_000)) return NextResponse.json({ queued: false, reason: 'cooldown', retryInSec: 15 })
    const body = await req.json().catch(() => ({})) as { preset?: string }
    const preset = (PRESETS as readonly string[]).includes(body.preset ?? '') ? body.preset as (typeof PRESETS)[number] : 'last_7d'
    try {
      const r = await refreshNow({ clientId: tenant.clientId, slug: tenant.slug, adAccountId: tenant.adAccountId, pageId: tenant.pageId }, preset)
      return NextResponse.json({ queued: false, refreshed: r.done, reason: r.done ? undefined : r.reason })
    } catch (e) {
      if (e instanceof StoreNotMigrated) return NextResponse.json({ queued: false, reason: 'not_available' })
      throw e
    }
  }
  // Modo ao vivo: "Atualizar" descarta o cache deste cliente, no máximo 1 vez por minuto (mais que isso, várias telas não furam o cache).
  if (allow(`fresh:${tenant.slug}`, 1, 60_000)) invalidateLegacyCache(tenant.clientId)
  try {
    const r = await requestRefresh({ store: stores.limit, jobs: stores.jobs, config: metaConfig }, tenant.clientId)
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ queued: false, reason: 'not_available' })
    throw e
  }
}
