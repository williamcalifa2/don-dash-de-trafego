import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Foto do gestor como imagem de verdade, para o navegador guardar em cache (o endereço muda quando a foto muda). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const { id } = await ctx.params
  const db = getSupabaseServer()
  if (!db || !/^[a-z0-9-]{1,40}$/.test(id)) return new NextResponse(null, { status: 404 })
  const { data } = await db.from('traffic_managers').select('avatar').eq('id', id).maybeSingle()
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec((data as { avatar?: string | null } | null)?.avatar ?? '')
  if (!m) return new NextResponse(null, { status: 404 })
  return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable' } })
}
