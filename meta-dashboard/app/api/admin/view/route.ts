import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, VIEW_COOKIE } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'

const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }

/** Escolhe qual cliente o administrador vai ver no painel. */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const { slug } = await req.json().catch(() => ({})) as { slug?: unknown }
  const db = getSupabaseServer()
  if (typeof slug !== 'string' || !db) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })
  const { data } = await db.from('clients').select('slug').eq('slug', slug).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(VIEW_COOKIE, slug, cookieOpts)
  return res
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const res = NextResponse.json({ ok: true })
  res.cookies.set(VIEW_COOKIE, '', { ...cookieOpts, maxAge: 0 })
  return res
}
