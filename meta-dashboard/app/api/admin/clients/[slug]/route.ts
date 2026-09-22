import { parseLogoInput } from '@/lib/logo'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireServiceKey } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { clearClientCache, tenantBySlug } from '@/lib/tenant'
import { syncLeads } from '@/lib/metaLeads'
import { liveOrigin } from '@/lib/meta/mode'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const badKey = requireServiceKey()
  if (badKey) return badKey
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const { slug } = await ctx.params

  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  if ('name' in b) { const v = clean(b.name); if (!v || v.length > 80) return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 }); update.display_name = v }
  if ('adAccountId' in b) {
    const v = clean(b.adAccountId)
    if (v && !/^(act_)?\d{5,20}$/.test(v)) return NextResponse.json({ error: 'Conta de anúncios inválida.' }, { status: 400 })
    update.ad_account_id = v ? (v.startsWith('act_') ? v : `act_${v}`) : null
  }
  if ('pageId' in b) {
    const v = clean(b.pageId)
    if (v && !/^\d{5,25}$/.test(v)) return NextResponse.json({ error: 'ID da página inválido.' }, { status: 400 })
    update.page_id = v
  }
  if ('logoUrl' in b) {
    const logo = parseLogoInput(b.logoUrl)
    if (!logo.ok) return NextResponse.json({ error: logo.error }, { status: 400 })
    if (!logo.unchanged) update.logo_url = logo.value
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })

  const { error } = await db.from('clients').update(update).eq('slug', slug)
  clearClientCache()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Se a conta de anúncios ou a página mudou, já importa os leads do Meta.
  let imported: number | null = null
  if ('adAccountId' in update || 'page_id' in update) {
    try {
      const t = await tenantBySlug(slug)
      if (t?.adAccountId) { const r = await syncLeads(t, 30, { repair: true, origin: await liveOrigin() }); imported = r.error ? null : r.imported }
    } catch {}
  }
  return NextResponse.json({ ok: true, imported })
}
