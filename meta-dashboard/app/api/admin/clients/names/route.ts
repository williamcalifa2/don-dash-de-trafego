import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { logoPublicUrl } from '@/lib/logo'
import { getSupabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Nome e endereço de todos os clientes, sem o filtro de carteira: para escolher a quais clientes um acesso Orgânico
 * dá entrada, e para a lista simples de clientes em Configurações (logo + se tem conta de anúncios vinculada).
 * Uma query só, sem os números de leads/Meta de cada um — não é a lista pesada do Painel.
 */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ clients: [] })
  const { data } = await db.from('clients').select('slug,display_name,logo_url,ad_account_id').order('display_name')
  return NextResponse.json({
    clients: ((data ?? []) as Array<{ slug: string; display_name: string | null; logo_url: string | null; ad_account_id: string | null }>)
      .map(c => ({ slug: c.slug, name: c.display_name ?? c.slug, logoUrl: logoPublicUrl(c.slug, c.logo_url), hasAdAccount: !!c.ad_account_id })),
  })
}
