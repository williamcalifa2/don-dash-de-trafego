import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import { adminEnabled, adminSessionForCredentials, ADMIN_MAX_AGE } from '@/lib/admin'
import { allow } from '@/lib/rateLimit'
import { adminLockedMinutes, adminRecordFailure, adminClearFailures } from '@/lib/adminLock'

export async function POST(req: NextRequest) {
  if (!adminEnabled()) return NextResponse.json({ error: 'Administração desativada' }, { status: 404 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!allow(`admin:${ip}`, 8) || !allow('admin:all', 40)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })

  const wait = await adminLockedMinutes(ip)
  if (wait) return NextResponse.json({ error: `Muitas tentativas. Aguarde ${wait} min.` }, { status: 429 })

  const body = await req.json().catch(() => ({})) as { email?: unknown; password?: unknown }
  const session = typeof body.email === 'string' && typeof body.password === 'string'
    ? await adminSessionForCredentials(body.email, body.password)
    : null
  if (!session) {
    await adminRecordFailure(ip)
    return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 })
  }
  await adminClearFailures(ip)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: ADMIN_MAX_AGE,
  })
  return res
}
