import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { getClientConfig } from '@/lib/clientConfig'
import { GoogleAdsError, fetchGoogleMetrics, googleAdsMode } from '@/lib/googleAds/client'
import { GOOGLE_PRESETS, type GooglePreset } from '@/lib/googleAds/gaql'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Números do Google Ads do cliente (somente leitura). `setup`: off = credenciais não configuradas · no_account = cliente sem conta Google vinculada. */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const preset = (req.nextUrl.searchParams.get('date_preset') ?? 'last_7d') as GooglePreset
  if (!GOOGLE_PRESETS.includes(preset)) return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })
  const cfg = await getClientConfig(tenant.slug)
  if (!cfg.googleAdsCustomerId) return NextResponse.json({ setup: 'no_account' })
  if (googleAdsMode() === 'off') return NextResponse.json({ setup: 'off' })
  try {
    const data = await fetchGoogleMetrics(cfg.googleAdsCustomerId, preset)
    return NextResponse.json({ setup: 'ready', ...data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const kind = e instanceof GoogleAdsError ? e.kind : 'other'
    const detail = e instanceof Error ? e.message : ''
    let message = 'Não foi possível ler o Google Ads agora.'
    if (/test accounts/i.test(detail) || /NOT_APPROVED_FOR_PRODUCTION/i.test(detail)) {
      message = 'O Token de Desenvolvedor da MCC está em modo de teste. Na Central da API da sua MCC, solicite o "Acesso Básico" (Basic Access) para ler contas reais de clientes.'
    } else if (kind === 'access') {
      message = detail || 'Sem acesso a esta conta do Google Ads. Confira se ela está dentro da conta gerente (MCC).'
    } else if (kind === 'quota') {
      message = 'Limite do Google Ads atingido. Tente de novo em alguns minutos.'
    } else if (kind === 'auth') {
      message = 'Falha ao autenticar no Google Ads. Confira as credenciais.'
    }
    return NextResponse.json({ setup: 'error', kind, message }, { status: 502 })
  }
}
