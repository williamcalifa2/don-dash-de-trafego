import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole } from '@/lib/admin'
import { getClientConfig, setClientConfig } from '@/lib/clientConfig'
import { registerWebhooks } from '@/lib/shopifyApp'
import { shopifyHost } from '@/lib/shopifyCatalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Cadastra de novo os webhooks do app (idempotente). Usado quando o app ganha um evento novo, sem precisar reinstalar. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const isStaff = !(await requireAdmin(req)) || !(await requireRole(req, 'member'))
  if (!isStaff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cur = (await getClientConfig(slug)).integrations ?? {}
  const shop = shopifyHost(cur.shopifyDomain)
  if (!shop || !cur.shopifyToken || !cur.shopifyConnectedAt) return NextResponse.json({ ok: false, message: 'Este cliente ainda não instalou o app da Shopify.' })
  try {
    const r = await registerWebhooks(shop, cur.shopifyToken, `${req.nextUrl.origin}/api/webhooks/shopify/${slug}`)
    await setClientConfig(slug, { integrations: { ...cur, shopifyWebhooks: r.ok } })
    return NextResponse.json({ ok: r.failed.length === 0, count: r.ok.length, message: r.failed.length ? `${r.ok.length} ativos; falharam: ${r.failed.map(f => `${f.topic} (${f.why})`).join(', ')}` : `${r.ok.length} webhooks ativos.` })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Falha ao falar com a Shopify.' })
  }
}
