import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { buildAudience, hasAudienceData, type AudienceRaw } from '@/lib/audience'
import { legacyGet } from '@/lib/meta/legacy'
import { stores } from '@/lib/meta/stores'
import { snapshotMode } from '@/lib/meta/mode'
import { StoreNotMigrated } from '@/lib/meta/limits'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PRESETS = ['last_7d', 'last_14d', 'last_30d']
const FIELDS = 'spend,impressions,reach,clicks,actions'
const CALLS: Array<{ key: keyof AudienceRaw; breakdowns: string; fields: string }> = [
  { key: 'platform', breakdowns: 'publisher_platform', fields: FIELDS },
  { key: 'device', breakdowns: 'device_platform', fields: FIELDS },
  { key: 'hour', breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', fields: 'spend,impressions,reach,clicks' },
  { key: 'agegender', breakdowns: 'age,gender', fields: FIELDS },
  { key: 'region', breakdowns: 'region', fields: FIELDS },
]

// Antes do corte automático, quando o banco ainda não tem o público do cliente: 5 consultas, guardadas por 30 min por cliente e período.
const liveCache = new Map<string, { at: number; raw: AudienceRaw | null }>()
const LIVE_TTL = 30 * 60_000

/**
 * Público e posicionamento do cliente (plataforma, dispositivo, hora, idade, gênero, região).
 * Lê do banco; sem dado ainda (e antes do corte automático), faz uma busca curta e guardada.
 */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const preset = req.nextUrl.searchParams.get('date_preset') ?? 'last_7d'
  if (preset === 'today' || preset === 'this_month') return NextResponse.json({ audience: null, reason: 'today' })
  if (!PRESETS.includes(preset)) return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })
  if (!tenant.adAccountId) return NextResponse.json({ audience: null, reason: 'no_account' })

  try {
    const snap = await stores.snaps.get<AudienceRaw>(tenant.clientId, 'audience', preset)
    if (snap) return NextResponse.json({ audience: buildAudience(snap.payload), at: snap.fetchedAt, source: 'db' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { if (!(e instanceof StoreNotMigrated)) throw e }

  if (await snapshotMode() || !process.env.META_ACCESS_TOKEN) return NextResponse.json({ audience: null, reason: 'pending' })

  const key = `${tenant.clientId}:${preset}`
  const hit = liveCache.get(key)
  if (hit && Date.now() - hit.at < LIVE_TTL) return hit.raw ? NextResponse.json({ audience: buildAudience(hit.raw), at: hit.at, source: 'live' }) : NextResponse.json({ audience: null, reason: 'pending' })

  const raw = { platform: [], device: [], hour: [], agegender: [], region: [] } as AudienceRaw
  for (const c of CALLS) {
    const r = await legacyGet<{ data?: Array<Record<string, unknown>> }>(`${tenant.adAccountId}/insights?fields=${c.fields}&breakdowns=${c.breakdowns}&date_preset=${preset}&limit=100`, { accountId: tenant.adAccountId, clientId: tenant.clientId, purpose: 'painel:publico' })
    if (!r.ok) { liveCache.set(key, { at: Date.now(), raw: null }); return NextResponse.json({ audience: null, reason: 'pending' }) }
    raw[c.key] = r.data.data ?? []
  }
  liveCache.set(key, { at: Date.now(), raw })
  const a = buildAudience(raw)
  return NextResponse.json({ audience: hasAudienceData(a) ? a : null, reason: hasAudienceData(a) ? undefined : 'empty', at: Date.now(), source: 'live' }, { headers: { 'Cache-Control': 'no-store' } })
}
