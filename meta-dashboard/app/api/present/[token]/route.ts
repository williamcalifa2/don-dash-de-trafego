import { NextRequest, NextResponse } from 'next/server'
import { getReport } from '@/lib/reportsLibrary'
import { resolveToken } from '@/lib/presentation'

export const dynamic = 'force-dynamic'

/** Dados do relatório para a tela do cliente (link com código). Não devolve as anotações do apresentador. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await resolveToken(token)
  const r = link ? await getReport(link.slug, link.id) : null
  if (!r) return NextResponse.json({ error: 'Este link não está mais disponível.' }, { status: 404 })
  return NextResponse.json({ title: r.title, mode: r.mode, theme: r.theme, snapshot: r.snapshot }, { headers: { 'Cache-Control': 'no-store' } })
}
