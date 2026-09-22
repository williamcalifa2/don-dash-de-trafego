import { NextRequest, NextResponse } from 'next/server'
import { authEnabled, SESSION_COOKIE, SESSION_MAX_AGE, safeNext } from '@/lib/auth'
import { hostSlug, SLUG_RE } from '@/lib/host'
import { loginWithCode } from '@/lib/tenant'
import { allow } from '@/lib/rateLimit'

/** Cliente da requisição: pelo subdomínio; sem subdomínio, pelo campo "c". */
function requestedSlug(req: NextRequest, fromBody?: unknown): string | null {
  const bySubdomain = hostSlug(req.headers.get('host'))
  if (bySubdomain) return bySubdomain
  return typeof fromBody === 'string' && SLUG_RE.test(fromBody) ? fromBody : null
}

export async function POST(req: NextRequest) {
  if (!authEnabled()) return NextResponse.json({ ok: true, next: '/dashboard/meta' })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!allow(`login:${ip}`, 20)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({})) as { code?: unknown; c?: unknown; next?: unknown }
  const slug = requestedSlug(req, body.c)
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!slug) return NextResponse.json({ error: 'Não identifiquei o painel. Abra o endereço que a agência enviou.' }, { status: 400 })

  const result = await loginWithCode(slug, code)
  if (!result.ok) {
    return result.reason === 'locked'
      ? NextResponse.json({ error: `Acesso bloqueado por segurança. Tente de novo em ${result.minutes} minuto${result.minutes === 1 ? '' : 's'}.` }, { status: 429 })
      : NextResponse.json({ error: 'Código incorreto.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, next: safeNext(body.next) })
  res.cookies.set(SESSION_COOKIE, result.session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return res
}
