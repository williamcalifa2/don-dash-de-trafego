import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { extToken } from '@/lib/extension'

export const dynamic = 'force-dynamic'

/** Token pessoal da extensão de quem está logado. Não guardar em lugar público: identifica a pessoa. */
export async function GET(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ email: who.email, token: extToken(who.email) }, { headers: { 'Cache-Control': 'no-store' } })
}
