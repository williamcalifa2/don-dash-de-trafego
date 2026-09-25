import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { listAllReports } from '@/lib/reportsLibrary'
import { canSee, scopeFor } from '@/lib/scope'

export const dynamic = 'force-dynamic'

/** Todos os relatórios de todos os clientes (só a equipe). Sem entrar na conta de cada cliente. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const all = await listAllReports()
  const scope = await scopeFor(req)
  if (!scope.slugs) return NextResponse.json(all, { headers: { 'Cache-Control': 'no-store' } })
  // Só os relatórios e clientes da carteira.
  return NextResponse.json({ ...all, reports: all.reports.filter(r => canSee(scope, r.client.slug)), clients: all.clients.filter(c => canSee(scope, c.slug)) }, { headers: { 'Cache-Control': 'no-store' } })
}
