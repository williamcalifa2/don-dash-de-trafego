import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { scopeFor } from '@/lib/scope'
import { getSupabaseServer } from '@/lib/supabase'
import { logoPublicUrl } from '@/lib/logo'
import { getAllClientsConfig, hasEcommerce } from '@/lib/clientConfig'
import { platformsFor } from '@/lib/platforms'

export const dynamic = 'force-dynamic'

/** Clientes que a pessoa do nível Orgânico pode abrir. Qualquer acesso da administração pode chamar (mostra os clientes visíveis dela). */
export async function GET(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const scope = await scopeFor(req)
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })
  let q = db.from('clients').select('slug,display_name,logo_url,ad_account_id').order('display_name')
  if (scope.slugs) q = q.in('slug', [...scope.slugs])
  const { data } = await q
  const rows = (data ?? []) as Array<{ slug: string; display_name: string | null; logo_url: string | null; ad_account_id: string | null }>
  const cfgs = await getAllClientsConfig(rows.map(c => c.slug))
  return NextResponse.json({
    role: who.role, email: who.email,
    clients: rows.map(c => {
      const cfg = cfgs[c.slug]
      return { slug: c.slug, name: c.display_name ?? c.slug, logoUrl: logoPublicUrl(c.slug, c.logo_url), active: cfg?.active !== false, platforms: platformsFor({ adAccountId: c.ad_account_id, ecommerce: cfg ? hasEcommerce(cfg) : false }) }
    }),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
