import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { tenantBySlug } from '@/lib/tenant'
import { liveOrigin } from '@/lib/meta/mode'
import { findPage, friendlyMetaError, graph, pageToken, syncLeads } from '@/lib/metaLeads'
import { getSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Check { key: string; label: string; ok: boolean | null; detail: string }

/** Diagnóstico da conexão de leads do cliente: diz o que está funcionando e o que falta. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { slug } = await ctx.params
  const t = await tenantBySlug(slug)
  if (!t) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const checks: Check[] = []
  const origin = await liveOrigin()
  const tokenEnv = process.env.META_ACCESS_TOKEN
  let hasLeadPerm = false

  if (!tokenEnv) {
    checks.push({ key: 'token', label: 'Token do Meta', ok: false, detail: 'META_ACCESS_TOKEN não está configurado no Vercel.' })
  } else {
    const dbg = await graph<{ data?: { is_valid?: boolean; app_id?: string; scopes?: string[] } }>(`debug_token?input_token=${tokenEnv}`, { clientId: t.clientId, origin })
    const d = dbg.data.data
    const scopes = d?.scopes ?? []
    hasLeadPerm = scopes.includes('leads_retrieval') || scopes.includes('pages_manage_ads')
    checks.push({ key: 'token', label: 'Token do Meta', ok: !!d?.is_valid, detail: d?.is_valid ? 'Válido.' : friendlyMetaError(dbg.error) })
    checks.push({
      key: 'perm', label: 'Permissão para ler leads', ok: hasLeadPerm,
      detail: hasLeadPerm ? 'O token tem a permissão de leads.' : 'Falta a permissão leads_retrieval (e pages_manage_ads) no token. Gere um token novo com essas permissões.',
    })
  }

  checks.push({ key: 'conta', label: 'Conta de anúncios', ok: !!t.adAccountId, detail: t.adAccountId ?? 'Não cadastrada. Use Editar cliente.' })

  const page = tokenEnv ? await findPage(t, origin) : null
  checks.push({
    key: 'pagina', label: 'Página do Facebook', ok: !!page,
    detail: page ? `${page.name ?? page.id}${page.source === 'conta' ? ' (encontrada pela conta de anúncios)' : ''}` : 'Não encontrei. Cadastre em Editar cliente, Opções avançadas.',
  })

  let pt: string | null = null
  if (page) {
    const tok = await pageToken(page.id, { origin })
    pt = tok.data.access_token ?? null
    checks.push({ key: 'acesso', label: 'Acesso do token à página', ok: !!pt, detail: pt ? 'O token consegue ler os leads da página.' : friendlyMetaError(tok.error) })
  }

  // Leads que o Meta diz ter (30 dias) x leads que estão no painel.
  let meta30: number | null = null
  if (t.adAccountId && tokenEnv) {
    const ins = await graph<{ data?: Array<{ actions?: Array<{ action_type: string; value: string }> }> }>(`${t.adAccountId}/insights?fields=actions&date_preset=last_30d`)
    const acts = ins.data.data?.[0]?.actions ?? []
    const v = acts.find(a => a.action_type === 'onsite_conversion.lead_grouped') ?? acts.find(a => a.action_type === 'lead')
    meta30 = v ? Number(v.value) : 0
  }
  let app30: number | null = null
  const db = getSupabaseServer()
  if (db) {
    const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', t.clientId).gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    app30 = count ?? 0
  }

  return NextResponse.json({
    name: t.name, checks, meta30, app30, canSync: !!page && !!pt,
  })
}

/** Ação: importar leads do Meta ("sync"). O painel só lê da Meta; nada é alterado nas contas. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const { slug } = await ctx.params
  const t = await tenantBySlug(slug)
  if (!t) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  const body = await req.json().catch(() => ({})) as { action?: string; days?: number }

  if (body.action === 'sync') {
    try {
      const origin = await liveOrigin()
      const r = await syncLeads(t, typeof body.days === 'number' ? body.days : 30, { repair: true, origin })
      return r.error ? NextResponse.json({ error: r.error, ...r }, { status: 422 }) : NextResponse.json(r)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao importar' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
