import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { AVATAR_URL, avatarUrl, cleanProfile, getProfile, nameFromEmail, saveProfile } from '@/lib/adminProfile'

export const dynamic = 'force-dynamic'

/** Perfil de quem está logado na administração (nome e foto que a sidebar mostra). */
export async function GET(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const p = await getProfile(who.email).catch(() => ({}))
  return NextResponse.json({ role: who.role, email: who.email, name: (p as { name?: string }).name ?? nameFromEmail(who.email), avatar: avatarUrl((p as { avatar?: string }).avatar) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { name?: unknown; avatar?: unknown }
  // A tela devolve o endereço da foto atual quando só o nome mudou: isso significa "manter a foto".
  const keep = typeof body.avatar === 'string' && body.avatar.startsWith(AVATAR_URL)
  const avatar = keep ? undefined : body.avatar
  const clean = cleanProfile({ name: body.name, avatar })
  if (avatar && typeof avatar === 'string' && !clean.avatar) return NextResponse.json({ error: 'Foto inválida ou grande demais. Use PNG, JPG ou WebP pequenos.' }, { status: 400 })
  try {
    const p = await saveProfile(who.email, { name: body.name, avatar })
    return NextResponse.json({ ok: true, name: p.name ?? nameFromEmail(who.email), avatar: avatarUrl(p.avatar) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Não foi possível salvar.' }, { status: 500 })
  }
}
