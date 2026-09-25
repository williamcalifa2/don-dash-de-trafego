import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { syncMetaActivity } from '@/lib/managersStore'
import { allow } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Lê agora o histórico de alterações das contas na Meta (só leitura, passando pelos freios do cliente central). */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  if (!allow('managers-sync', 3, 60_000)) return NextResponse.json({ ok: true, throttled: true })
  const r = await syncMetaActivity({ budgetMs: 50_000 })
  return NextResponse.json({ ok: true, ...r })
}
