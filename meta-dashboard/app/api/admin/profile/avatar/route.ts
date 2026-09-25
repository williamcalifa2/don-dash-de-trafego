import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { getProfile } from '@/lib/adminProfile'

export const dynamic = 'force-dynamic'

/** Foto do perfil como imagem de verdade, para o navegador guardar em cache (antes vinha dentro do JSON do perfil: ~100 kB a cada tela). */
export async function GET(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who) return new NextResponse(null, { status: 401 })
  const p = await getProfile(who.email).catch(() => ({} as { avatar?: string }))
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(p.avatar ?? '')
  if (!m) return new NextResponse(null, { status: 404 })
  return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable' } })
}
