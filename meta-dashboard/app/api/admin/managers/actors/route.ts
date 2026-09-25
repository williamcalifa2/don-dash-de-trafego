import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { loadRegistry, metaActors } from '@/lib/managersStore'

export const dynamic = 'force-dynamic'

/** Pessoas que aparecem como autoras no histórico da Meta, para ligar a um gestor. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const [actors, reg] = await Promise.all([metaActors(), loadRegistry()])
  const linked = new Map((reg?.managers ?? []).filter(m => m.metaActorId).map(m => [m.metaActorId!, m.name]))
  return NextResponse.json({ actors: actors.map(a => ({ ...a, manager: linked.get(a.id) ?? null })) })
}
