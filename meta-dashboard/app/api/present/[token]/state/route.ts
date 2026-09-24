import { NextRequest, NextResponse } from 'next/server'
import { getState, resolveToken } from '@/lib/presentation'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await resolveToken(token))) return NextResponse.json({ error: 'Este link não está mais disponível.' }, { status: 404 })
  return NextResponse.json(await getState(token), { headers: { 'Cache-Control': 'no-store' } })
}
