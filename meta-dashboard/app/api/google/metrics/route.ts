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
    const message = kind === 'access' ? 'Sem acesso a esta conta do Google Ads. Confira se ela está dentro da conta gerente (MCC).' : kind === 'quota' ? 'Limite do Google Ads atingido. Tente de novo em alguns minutos.' : kind === 'auth' ? 'Falha ao autenticar no Google Ads. Confira as credenciais.' : 'Não foi possível ler o Google Ads agora.'
    return NextResponse.json({ setup: 'error', kind, message }, { status: 502 })
  }
}
