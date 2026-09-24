import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getReport } from '@/lib/reportsLibrary'
import { ensureToken } from '@/lib/presentation'

export const dynamic = 'force-dynamic'

/** Link do cliente para um relatório salvo (cria na primeira vez; `rotate` troca por outro e invalida o antigo). */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { slug, id, rotate } = await req.json().catch(() => ({})) as { slug?: string; id?: string; rotate?: boolean }
  if (typeof slug !== 'string' || typeof id !== 'string' || !(await getReport(slug, id))) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
  return NextResponse.json({ token: await ensureToken(slug, id, !!rotate) })
}
