import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { syncMetaActivity } from '@/lib/managersStore'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : (req.nextUrl.searchParams.get('key') ?? '')
  const a = Buffer.from(given), b = Buffer.from(secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Uma vez por dia: lê o histórico de alterações das contas na Meta e grava no histórico dos gestores. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await syncMetaActivity({ budgetMs: 50_000 })) })
}
