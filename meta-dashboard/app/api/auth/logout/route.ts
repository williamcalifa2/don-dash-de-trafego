import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import { VIEW_COOKIE } from '@/lib/admin'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  res.cookies.set(VIEW_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
