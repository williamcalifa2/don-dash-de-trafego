import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { SLUG_RE } from '@/lib/host'
import { decodeLogo } from '@/lib/logo'

export const dynamic = 'force-dynamic'

/** Logo do cliente (a mesma imagem que já aparece na tela de acesso). Público, só imagem; o navegador guarda em cache. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!SLUG_RE.test(slug)) return new NextResponse('Not found', { status: 404 })
  const db = getSupabaseServer()
  if (!db) return new NextResponse('Not found', { status: 404 })
  const { data } = await db.from('clients').select('logo_url').eq('slug', slug).maybeSingle()
  const stored = (data as { logo_url: string | null } | null)?.logo_url
  if (!stored) return new NextResponse('Not found', { status: 404 })
  if (/^https:\/\//.test(stored)) return NextResponse.redirect(stored, 302)
  const img = decodeLogo(stored)
  if (!img) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(new Uint8Array(img.bytes), { headers: { 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' } })
}
