import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { getSupabaseServer } from '@/lib/supabase'
import { summarizeCheckouts, type CheckoutRow } from '@/lib/integrations'

export const dynamic = 'force-dynamic'

/** Carrinhos abandonados dos últimos 30 dias e o resumo (em aberto, valor, taxa de conclusão). */
export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await db.from('ecommerce_checkouts')
    .select('id,customer_name,customer_email,customer_phone,total,currency,items,recover_url,utm_source,utm_campaign,created_at,updated_at,completed_at')
    .eq('client_id', tenant.clientId).gte('updated_at', since).order('updated_at', { ascending: false }).limit(1000)

  if (error) {
    const missing = /relation|schema cache|does not exist/i.test(error.message)
    return NextResponse.json({ ok: true, setup: missing ? 'tables' : 'error', ...summarizeCheckouts([]) })
  }
  return NextResponse.json({ ok: true, setup: 'ready', ...summarizeCheckouts((data ?? []) as CheckoutRow[]) })
}
