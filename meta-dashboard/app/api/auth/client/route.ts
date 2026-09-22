import { NextRequest, NextResponse } from 'next/server'
import { hostSlug, SLUG_RE } from '@/lib/host'
import { publicClient } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** Nome e logo do cliente para a tela de acesso (pelo subdomínio ou ?c=). */
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('c') ?? ''
  const slug = hostSlug(req.headers.get('host')) ?? (SLUG_RE.test(c) ? c : null)
  if (!slug) return NextResponse.json({ slug: null })
  const client = await publicClient(slug)
  return client ? NextResponse.json(client) : NextResponse.json({ slug })
}
