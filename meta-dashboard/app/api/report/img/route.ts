import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/**
 * Traz a miniatura de um post/anúncio (CDN da Meta) para dentro do app, para o PowerPoint conseguir embutir a imagem
 * (o navegador não deixa ler imagem de outro domínio). Só a equipe, só os domínios de imagem da Meta, só imagens, tamanho limitado.
 */
const HOSTS = [/(^|\.)fbcdn\.net$/i, /(^|\.)cdninstagram\.com$/i, /(^|\.)facebook\.com$/i]
const MAX_BYTES = 4_000_000

export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  let url: URL
  try { url = new URL(req.nextUrl.searchParams.get('u') ?? '') } catch { return new NextResponse('URL inválida', { status: 400 }) }
  if (url.protocol !== 'https:' || url.username || url.password || !HOSTS.some(h => h.test(url.hostname))) return new NextResponse('Domínio não permitido', { status: 400 })

  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) }).catch(() => null)
  const type = res?.headers.get('content-type') ?? ''
  if (!res || !res.ok || !type.startsWith('image/')) return new NextResponse('Imagem indisponível', { status: 502 })
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return new NextResponse('Imagem grande demais', { status: 413 })
  return new NextResponse(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } })
}
