import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { resolveToken, saveState } from '@/lib/presentation'

export const dynamic = 'force-dynamic'

/** O apresentador publica em que slide está e o que desenhou; a tela do cliente lê isso. */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { token, state } = await req.json().catch(() => ({})) as { token?: string; state?: unknown }
  if (typeof token !== 'string' || !(await resolveToken(token))) return NextResponse.json({ error: 'Link inválido.' }, { status: 404 })
  return NextResponse.json({ ok: true, at: (await saveState(token, state)).at })
}
