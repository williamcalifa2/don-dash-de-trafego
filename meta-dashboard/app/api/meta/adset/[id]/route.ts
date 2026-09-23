import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { tenantOwns } from '@/lib/metaAccess'
import { getResults, listConversions } from '@/lib/meta'
import { errMsg, legacyBatch, legacyGet } from '@/lib/meta/legacy'
import { snapshotMode, snapshotGuard } from '@/lib/meta/mode'
import { readAds } from '@/lib/meta/read'
import { stores } from '@/lib/meta/pipeline'

export const dynamic = 'force-dynamic'

const PRESETS = ['today', 'last_7d', 'last_14d', 'last_30d', 'this_month']
type Action = { action_type: string; value: string }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const { id } = await params
  if (!(await tenantOwns(tenant, id))) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  const datePreset = new URL(req.url).searchParams.get('date_preset') ?? 'last_7d'
  if (!PRESETS.includes(datePreset)) return NextResponse.json({ error: 'Invalid date_preset' }, { status: 400 })
  if (await snapshotMode()) return snapshotGuard(async () => NextResponse.json({ ads: await readAds(stores.snaps, tenant.clientId, id, datePreset) }))
  if (!process.env.META_ACCESS_TOKEN) return NextResponse.json({ error: 'No token' }, { status: 500 })
  const opts = { accountId: tenant.adAccountId, clientId: tenant.clientId, purpose: 'painel:anuncios' }

  // Uma chamada só: anúncios com criativo e números do período aninhados (sem uma chamada por anúncio).
  const fields = `id,name,status,preview_shareable_link,creative{id,name,thumbnail_url,image_url,video_id,body,title,object_type},insights.date_preset(${datePreset}){spend,impressions,clicks,ctr,frequency,actions,cost_per_action_type}`
  const res = await legacyGet<{ data?: Array<Record<string, unknown>> }>(`${id}/ads?fields=${fields}&limit=50`, opts)
  if (!res.ok) return NextResponse.json({ error: errMsg(res, 'API error') }, { status: 400 })
  const ads = res.data.data ?? []

  // Miniatura de vídeo: só para anúncios sem imagem, todos em um único batch.
  const thumbs = new Map<string, string>()
  const needVideo = [...new Set(ads.map(ad => {
    const c = ad.creative as Record<string, unknown> | undefined
    return !(c?.thumbnail_url ?? c?.image_url) && c?.video_id ? String(c.video_id) : ''
  }).filter(Boolean))].slice(0, 25)
  if (needVideo.length) {
    const b = await legacyBatch<{ thumbnails?: { data?: Array<{ uri: string }> } }>(needVideo.map(v => `${v}?fields=thumbnails`), opts)
    if (b.ok) b.data.forEach((r, i) => { const uri = r.ok ? r.data.thumbnails?.data?.[0]?.uri : undefined; if (uri) thumbs.set(needVideo[i], uri) })
  }

  const withInsights = ads.map(ad => {
    const creative = ad.creative as Record<string, unknown> | undefined
    const thumbUrl = (creative?.thumbnail_url ?? creative?.image_url ?? (creative?.video_id ? thumbs.get(String(creative.video_id)) : '') ?? '') as string
    const ins = (ad.insights as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0] ?? {}
    const actions = (ins.actions as Action[]) ?? []
    const cpas = (ins.cost_per_action_type as Action[]) ?? []
    const leads = actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')
    const cpl = cpas.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')
    const spend = Number(ins.spend ?? 0)
    return {
      id: ad.id,
      name: ad.name,
      status: ad.status,
      thumb: thumbUrl,
      preview_shareable_link: (ad.preview_shareable_link as string) || null,
      creative_name: (creative?.name ?? ad.name) as string,
      object_type: (creative?.object_type ?? '') as string,
      spend,
      impressions: Number(ins.impressions ?? 0),
      clicks: Number(ins.clicks ?? 0),
      ctr: Number(ins.ctr ?? 0),
      frequency: Number(ins.frequency ?? 1),
      leads: leads ? Number(leads.value) : 0,
      cpl: cpl ? Number(cpl.value) : null,
      results: getResults(actions),
      cost_per_result: getResults(actions) > 0 ? spend / getResults(actions) : null,
      conversions: listConversions(actions, spend),
    }
  })
  return NextResponse.json({ ads: withInsights })
}
