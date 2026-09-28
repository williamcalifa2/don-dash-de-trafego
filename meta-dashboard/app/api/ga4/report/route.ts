import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { getClientConfig } from '@/lib/clientConfig'
import { Ga4Error, fetchGa4, ga4Mode, serviceAccount } from '@/lib/ga4/client'
import { GOOGLE_PRESETS, rangeFor, type GooglePreset } from '@/lib/googleAds/gaql'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Números do site do cliente no Google Analytics 4 (somente leitura). `setup`: off = conta de serviço não configurada · no_property = cliente sem propriedade vinculada. */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const preset = (req.nextUrl.searchParams.get('date_preset') ?? 'last_7d') as GooglePreset
  if (!GOOGLE_PRESETS.includes(preset)) return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })
  const cfg = await getClientConfig(tenant.slug)
  if (!cfg.ga4PropertyId) return NextResponse.json({ setup: 'no_property' })
  if (ga4Mode() === 'off') return NextResponse.json({ setup: 'off' })
  try {
    const data = await fetchGa4(cfg.ga4PropertyId, rangeFor(preset))
    return NextResponse.json({ setup: 'ready', ...data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const kind = e instanceof Ga4Error ? e.kind : 'other'
    const sa = serviceAccount()
    const email = sa?.client_email
    const projectId = sa?.project_id || '767258501607'
    const directUrl = `https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=${projectId}`
    const origMsg = e instanceof Error ? e.message : ''
    const message = kind === 'disabled'
      ? `A API do Google Analytics Data precisa ser ativada no projeto da conta de serviço (${projectId}). Acesse ${directUrl} e clique em "Ativar".`
      : kind === 'access'
      ? `Sem acesso a esta propriedade do Google Analytics. Peça para adicionar ${email ? `o e-mail ${email}` : 'o seu usuário/conta'} como Leitor no painel do Google Analytics.`
      : kind === 'notfound'
      ? 'Propriedade do Google Analytics não encontrada. Confira o ID no cadastro do cliente.'
      : kind === 'quota'
      ? 'Limite do Google Analytics atingido. Tente de novo em alguns minutos.'
      : kind === 'auth'
      ? `Falha ao autenticar no Google Analytics. ${origMsg || 'Confira as credenciais do Google.'}`
      : (origMsg || 'Não foi possível ler o Google Analytics agora.')
    return NextResponse.json({ setup: 'error', kind, message }, { status: 502 })
  }
}
