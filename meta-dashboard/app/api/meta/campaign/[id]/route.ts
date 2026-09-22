import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { tenantOwns } from '@/lib/metaAccess'
import { getResults } from '@/lib/meta'
import { errMsg, legacyGet } from '@/lib/meta/legacy'
import { snapshotMode, snapshotGuard } from '@/lib/meta/mode'
import { readAdsets } from '@/lib/meta/read'
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
  if (await snapshotMode()) return snapshotGuard(async () => NextResponse.json({ adsets: await readAdsets(stores.snaps, tenant.clientId, id, datePreset) }))
  if (!process.env.META_ACCESS_TOKEN) return NextResponse.json({ error: 'No token' }, { status: 500 })

  // Uma chamada só: conjuntos com os números do período aninhados (sem uma chamada por conjunto).
  const fields = `id,name,status,daily_budget,lifetime_budget,insights.date_preset(${datePreset}){spend,impressions,clicks,ctr,frequency,actions,cost_per_action_type}`
  const res = await legacyGet<{ data?: Array<Record<string, unknown>> }>(`${id}/adsets?fields=${fields}&limit=50`, { accountId: tenant.adAccountId, clientId: tenant.clientId, purpose: 'painel:conjuntos' })
  if (!res.ok) return NextResponse.json({ error: errMsg(res, 'API error') }, { status: 400 })

  const adsets = (res.data.data ?? []).map(adset => {
    const ins = (adset.insights as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0] ?? {}
    const actions = (ins.actions as Action[]) ?? []
    const cpas = (ins.cost_per_action_type as Action[]) ?? []
    const leads = actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')
    const cpl = cpas.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped')
    return {
      id: adset.id,
      name: adset.name,
      status: adset.status,
      daily_budget: adset.daily_budget ? Number(adset.daily_budget) / 100 : null,
      spend: Number(ins.spend ?? 0),
      impressions: Number(ins.impressions ?? 0),
      clicks: Number(ins.clicks ?? 0),
      ctr: Number(ins.ctr ?? 0),
      frequency: Number(ins.frequency ?? 0),
      leads: leads ? Number(leads.value) : 0,
      cpl: cpl ? Number(cpl.value) : null,
      results: getResults(actions),
      cost_per_result: getResults(actions) > 0 ? Number(ins.spend ?? 0) / getResults(actions) : null,
    }
  })
  return NextResponse.json({ adsets })
}
