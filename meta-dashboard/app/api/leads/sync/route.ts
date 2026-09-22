import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { syncLeads } from '@/lib/metaLeads'
import { allow } from '@/lib/rateLimit'
import { liveOrigin } from '@/lib/meta/mode'
import { denyReader } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Importa do Meta os leads recentes do cliente logado (chamado pelo painel ao abrir ou ao clicar em Atualizar). */
export async function POST(req: NextRequest) {
  const readOnly = await denyReader(req)
  if (readOnly) return readOnly
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  // Rate limit de 60s por cliente para não estourar a cota da Meta em cliques repetidos
  if (!allow(`sync:${tenant.slug}`, 1, 60_000)) return NextResponse.json({ imported: 0, skipped: true })

  const body = await req.json().catch(() => ({})) as { days?: unknown }
  const days = typeof body.days === 'number' ? Math.min(Math.max(Math.floor(body.days), 1), 30) : 7
  try {
    const origin = await liveOrigin()
    return NextResponse.json(await syncLeads(tenant, days, { origin }))
  } catch (e) {
    return NextResponse.json({ imported: 0, error: e instanceof Error ? e.message : 'Erro ao importar' })
  }
}
