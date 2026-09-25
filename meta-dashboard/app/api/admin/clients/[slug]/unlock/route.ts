import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireServiceKey } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { logStaffActivity } from '@/lib/activityLog'

/** Tira o bloqueio temporário de um cliente que errou o código várias vezes. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const badKey = requireServiceKey()
  if (badKey) return badKey
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const { slug } = await ctx.params
  const { error } = await db.from('clients').update({ failed_attempts: 0, locked_until: null }).eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logStaffActivity(req, slug, { kind: 'access', summary: 'Desbloqueou o acesso do cliente' })
  return NextResponse.json({ ok: true })
}
