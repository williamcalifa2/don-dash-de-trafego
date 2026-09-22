import { NextRequest, NextResponse } from 'next/server'
import { requestRole } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/** Quem está logado na administração e com que nível (a tela usa para esconder o que a pessoa não pode fazer; o servidor confere de novo). */
export async function GET(req: NextRequest) {
  const role = await requestRole(req)
  return role ? NextResponse.json({ role }) : NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
