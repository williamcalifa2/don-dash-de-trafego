import { parseLogoInput } from '@/lib/logo'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireServiceKey } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { clearClientCache, tenantBySlug } from '@/lib/tenant'
import { syncLeads } from '@/lib/metaLeads'
import { liveOrigin } from '@/lib/meta/mode'
import { logStaffActivity } from '@/lib/activityLog'
import { duplicateOf, normName } from '@/lib/clientsDup'
import { assignClient, loadRegistry } from '@/lib/managersStore'

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
  // Trocar o gestor responsável (nulo tira o cliente da carteira).
  let newManager: string | null | undefined
  if ('managerId' in b) {
    newManager = clean(b.managerId)
    const reg = await loadRegistry().catch(() => null)
    if (newManager && (!reg || !reg.managers.some(m => m.id === newManager))) return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 400 })
  }
  if (!Object.keys(update).length && newManager === undefined) return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })

  // Não deixa dois clientes com o mesmo nome ou a mesma conta de anúncios.
  if ('display_name' in update || 'ad_account_id' in update || 'page_id' in update) {
    const { data: all } = await db.from('clients').select('slug,display_name,ad_account_id,page_id')
    const dup = duplicateOf(((all ?? []) as Array<{ slug: string; display_name: string | null; ad_account_id: string | null; page_id: string | null }>).map(c => ({ slug: c.slug, name: c.display_name ?? c.slug, adAccountId: c.ad_account_id, pageId: c.page_id })),
      { pageId: 'page_id' in update ? (update.page_id as string | null) : null, name: 'display_name' in update ? String(update.display_name) : null, adAccountId: 'ad_account_id' in update ? (update.ad_account_id as string | null) : null }, slug)
    if (dup) return NextResponse.json({ error: dup }, { status: 409 })
  }

  const { error } = Object.keys(update).length ? await db.from('clients').update(update).eq('slug', slug) : { error: null }
  clearClientCache()
  if (error && /clients_page_id_idx/.test(error.message)) return NextResponse.json({ error: 'Essa Página já é de outro cliente. Cada Página só pode estar em um cliente.' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (newManager !== undefined) await assignClient(slug, newManager)

  // Se a conta de anúncios ou a página mudou, já importa os leads do Meta.
  let imported: number | null = null
  if ('adAccountId' in update || 'page_id' in update) {
    try {
      const t = await tenantBySlug(slug)
      if (t?.adAccountId) { const r = await syncLeads(t, 30, { repair: true, origin: await liveOrigin() }); imported = r.error ? null : r.imported }
    } catch {}
  }
  const LABEL: Record<string, string> = { display_name: 'o nome', ad_account_id: 'a conta de anúncios', page_id: 'a página', logo_url: 'a logo' }
  await logStaffActivity(req, slug, { kind: 'client', summary: `Alterou ${Object.keys(update).map(k => LABEL[k] ?? k).join(', ')} do cliente` })
  return NextResponse.json({ ok: true, imported })
}


/** Exclui o cliente e tudo que é dele: leads, pedidos, coleta da Meta (apagados em cascata pelo banco), configurações, relatórios, links de apresentação e a carteira do gestor. Não tem volta. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const badKey = requireServiceKey()
  if (badKey) return badKey
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const { slug } = await ctx.params
  const { data: row } = await db.from('clients').select('id,display_name').eq('slug', slug).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  const name = (row as { display_name: string | null }).display_name ?? slug

  // Confirmação: quem chama precisa mandar o nome do cliente (a tela pede para digitar).
  const b = await req.json().catch(() => ({})) as { confirm?: unknown }
  if (typeof b.confirm !== 'string' || normName(b.confirm) !== normName(name)) return NextResponse.json({ error: 'Digite o nome do cliente para confirmar a exclusão.' }, { status: 400 })

  const { error } = await db.from('clients').delete().eq('slug', slug)
  if (error) return NextResponse.json({ error: `Não foi possível excluir: ${error.message}` }, { status: 409 })

  // O que não está preso ao cliente por chave do banco: configurações guardadas por endereço e o vínculo com gestor.
  await Promise.allSettled([
    db.from('meta_settings').delete().like('key', `%:${slug}`),
    db.from('meta_settings').delete().like('key', `%:${slug}:%`),
    db.from('manager_clients').delete().eq('client_slug', slug),
    db.from('activity_log').delete().eq('client_slug', slug),
    db.from('activity_sync').delete().eq('client_slug', slug),
  ])
  clearClientCache()
  await logStaffActivity(req, slug, { kind: 'client', summary: `Excluiu o cliente ${name}` })
  return NextResponse.json({ ok: true })
}
