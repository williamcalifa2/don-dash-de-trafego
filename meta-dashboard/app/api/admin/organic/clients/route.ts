import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { scopeFor } from '@/lib/scope'
import { getSupabaseServer } from '@/lib/supabase'
import { logoPublicUrl } from '@/lib/logo'

export const dynamic = 'force-dynamic'

/** Clientes que a pessoa do nível Orgânico pode abrir. Qualquer acesso da administração pode chamar (mostra os clientes visíveis dela). */
export async function GET(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const scope = await scopeFor(req)
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })
  let q = db.from('clients').select('slug,display_name,logo_url').order('display_name')
  if (scope.slugs) q = q.in('slug', [...scope.slugs])
  const { data } = await q
  return NextResponse.json({
    role: who.role, email: who.email,
    clients: ((data ?? []) as Array<{ slug: string; display_name: string | null; logo_url: string | null }>).map(c => ({ slug: c.slug, name: c.display_name ?? c.slug, logoUrl: logoPublicUrl(c.slug, c.logo_url) })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
