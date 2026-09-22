import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { syncLeads } from '@/lib/metaLeads'
import { allow } from '@/lib/rateLimit'
import { snapshotMode } from '@/lib/meta/mode'
import { denyReader } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Importa do Meta os leads recentes do cliente logado (chamado pelo painel enquanto está aberto). */
export async function POST(req: NextRequest) {
  const readOnly = await denyReader(req)
  if (readOnly) return readOnly
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  if (!allow(`sync:${tenant.slug}`, 1, 120_000)) return NextResponse.json({ imported: 0, skipped: true })
  // Corte final: o painel só lê o banco; quem busca leads na Meta é o worker (e o webhook).
  if (await snapshotMode()) return NextResponse.json({ imported: 0, skipped: true, source: 'db' })

  const body = await req.json().catch(() => ({})) as { days?: unknown }
  const days = typeof body.days === 'number' ? Math.min(Math.max(Math.floor(body.days), 1), 7) : 2
  try {
    return NextResponse.json(await syncLeads(tenant, days))
  } catch (e) {
    return NextResponse.json({ imported: 0, error: e instanceof Error ? e.message : 'Erro ao importar' })
  }
}
