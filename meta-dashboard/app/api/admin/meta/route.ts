import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { tenantBySlug } from '@/lib/tenant'
import { StoreNotMigrated } from '@/lib/meta/limits'
import { limits } from '@/lib/meta/instance'
import { statusNow, stores } from '@/lib/meta/pipeline'

export const dynamic = 'force-dynamic'

/** Estado da sincronização com a Meta (somente admin). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  try {
    return NextResponse.json(await statusNow(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ notMigrated: true })
    throw e
  }
}

type Body = { action?: string; slug?: string; id?: string }

/** Controles de EMERGÊNCIA (o sistema é automático; sem tela): pausar tudo, liberar kill switch, pausar/liberar conta, reabrir job morto. Nenhum toca na Meta. */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as Body
  const l = limits()
  try {
    switch (body.action) {
      case 'pause_system': await l.pauseSystem('manual'); return NextResponse.json({ ok: true })
      case 'resume_system': await l.resumeSystem(); return NextResponse.json({ ok: true })
      case 'clear_kill': await l.clearKill(); return NextResponse.json({ ok: true })
      case 'requeue_dead': return NextResponse.json({ ok: await stores.jobs.requeueDead(String(body.id ?? ''), Date.now()) })
      case 'dismiss_dead': return NextResponse.json({ ok: await stores.jobs.dismissDead(String(body.id ?? '')) })
      case 'pause': case 'resume': case 'release': {
        const t = body.slug ? await tenantBySlug(body.slug) : null
        if (!t) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
        if (body.action === 'pause') await l.setAccountFlags(t.clientId, { paused: true })
        else if (body.action === 'resume') await l.setAccountFlags(t.clientId, { paused: false })
        else await l.releaseAccount(t.clientId)
        return NextResponse.json({ ok: true })
      }
      default: return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ error: 'Rode o SQL supabase/2026-09-meta-sync.sql no Supabase antes.' }, { status: 409 })
    throw e
  }
}
