import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { getClientConfig, setClientConfig } from '@/lib/clientConfig'
import { getSupabaseServer } from '@/lib/supabase'
import { backfillShopify } from '@/lib/shopifyOrders'
import { requireClientScope } from '@/lib/scope'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Importa o histórico recente da loja conectada (pedidos e carrinhos). Pode rodar de novo sem duplicar. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const outOfScope = await requireClientScope(req, slug)
  if (outOfScope) return outOfScope
  const isStaff = !(await requireAdmin(req)) || !(await requireRole(req, 'member'))
  if (!isStaff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { days?: number }
  const db = getSupabaseServer()
  const { data: client } = db ? await db.from('clients').select('id').eq('slug', slug).maybeSingle() : { data: null }
  if (!client) return NextResponse.json({ ok: false, message: 'Cliente não encontrado.' })

  const i = (await getClientConfig(slug)).integrations ?? {}
  try {
    const r = await backfillShopify((client as { id: string }).id, { domain: i.shopifyDomain, token: i.shopifyToken }, Number(body.days) || 30)
    await setClientConfig(slug, { integrations: { ...i, shopifyBackfilledAt: new Date().toISOString() } })
    return NextResponse.json({ ok: true, ...r, message: `Importados ${r.orders} pedido(s) e ${r.checkouts} carrinho(s) dos últimos ${r.days} dias.${r.note ? ` ${r.note}` : ''}` })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Falha ao importar o histórico.' })
  }
}
