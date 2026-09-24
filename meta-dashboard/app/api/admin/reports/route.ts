import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { listAllReports } from '@/lib/reportsLibrary'

export const dynamic = 'force-dynamic'

/** Todos os relatórios de todos os clientes (só a equipe). Sem entrar na conta de cada cliente. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  return NextResponse.json(await listAllReports(), { headers: { 'Cache-Control': 'no-store' } })
}
