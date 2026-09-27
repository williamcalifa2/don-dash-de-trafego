import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { runWeeklyBatch } from '@/lib/weeklyStore'

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

/**
 * Relatórios semanais: gera o da semana atual de cada cliente ativo que ainda não tem. Idempotente e em lotes (cabe nos 60 s da função):
 * chame de tempos em tempos na segunda de madrugada (ex.: a cada 30 min a partir de 01:00 de Brasília) que ele termina o que faltou.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await runWeeklyBatch()) })
}
