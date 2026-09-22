import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { isAdmin } from '@/lib/admin'
import { StoreNotMigrated } from '@/lib/meta/limits'
import { statusNow } from '@/lib/meta/pipeline'
import { metaConfig } from '@/lib/meta/config'

export const dynamic = 'force-dynamic'

async function allowed(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const h = req.headers.get('authorization') ?? ''
    const given = h.startsWith('Bearer ') ? h.slice(7) : ''
    const a = Buffer.from(given), b = Buffer.from(secret)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return isAdmin(req)
}

/** Saúde da integração com a Meta (modo, contas ativas/bloqueadas, último ciclo, fila). Só com segredo do cron ou sessão de admin. */
export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const s = await statusNow()
    return NextResponse.json({
      ok: !s.system.paused && !s.system.killUntil && !!s.token?.valid,
      mode: s.mode, system: s.system, token: s.token, lastCycle: s.lastCycle,
      accounts: { total: s.accounts.total, blocked: s.accounts.blocked, suspended: s.accounts.suspended, paused: s.accounts.paused },
      jobs: s.jobs, webhook: s.webhook, observation: s.observation, warnings: s.warnings,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ ok: false, mode: { dryRun: metaConfig().dryRun, legacyLive: metaConfig().legacyLive }, error: 'tabelas não migradas' }, { status: 503 })
    return NextResponse.json({ ok: false, error: 'erro' }, { status: 500 })
  }
}
