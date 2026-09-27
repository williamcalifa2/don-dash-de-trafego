import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { Ga4Error, fetchGa4, ga4Mode, serviceAccount } from '@/lib/ga4/client'
import { cleanPropertyId } from '@/lib/ga4/report'
import { rangeFor } from '@/lib/googleAds/gaql'

export const dynamic = 'force-dynamic'

/** E-mail da conta de serviço (o que o cliente precisa convidar como Leitor) e o modo da conexão. Equipe. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  return NextResponse.json({ mode: ga4Mode(), serviceEmail: serviceAccount()?.client_email ?? null })
}

/** Testa se a conta de serviço consegue ler a propriedade. Corpo: { propertyId }. */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { propertyId } = await req.json().catch(() => ({})) as { propertyId?: unknown }
  const id = cleanPropertyId(propertyId)
  if (!id) return NextResponse.json({ ok: false, message: 'O ID da propriedade tem só números (ex.: 123456789).' })
  const mode = ga4Mode()
  if (mode === 'off') return NextResponse.json({ ok: false, message: 'A conexão com o Google Analytics ainda não foi configurada no app.' })
  if (mode === 'demo') return NextResponse.json({ ok: true, message: 'Modo demonstração: dados de exemplo.' })
  try {
    await fetchGa4(id, rangeFor('last_7d'))
    return NextResponse.json({ ok: true, message: 'Conectado. A propriedade respondeu.' })
  } catch (e) {
    const errText = e instanceof Error ? e.message : String(e)
    console.error('[GA4 TEST ERROR]', errText)
    const kind = e instanceof Ga4Error ? e.kind : 'other'
    const email = serviceAccount()?.client_email
    let message = 'Não foi possível conectar agora.'
    if (kind === 'access') {
      message = `Sem acesso. Adicione ${email ?? 'a conta de serviço'} como Leitor na propriedade. (${errText})`
    } else if (kind === 'notfound') {
      message = `Propriedade não encontrada. Confira o ID. (${errText})`
    } else if (errText) {
      message = `Erro: ${errText}`
    }
    return NextResponse.json({ ok: false, message })
  }
}
