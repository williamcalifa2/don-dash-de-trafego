import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { clientLogos, clientNames } from '@/lib/managersStore'
import { summarizeVisits, type VisitRow } from '@/lib/visits'

export const dynamic = 'force-dynamic'

/** Os acessos ao Gerenciador que a extensão registrou para quem está logado (serve de conferência: "está funcionando?"). */
export async function GET(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ setup: 'error' })
  const { data, error } = await db.from('account_visits').select('visit_id,user_key,client_slug,started_at,last_seen,active_sec').eq('user_key', who.email).gte('last_seen', new Date(Date.now() - 7 * 86_400_000).toISOString()).order('last_seen', { ascending: false }).limit(2000)
  if (error) return NextResponse.json({ setup: /relation|schema cache|does not exist/i.test(error.message) ? 'sql' : 'error' })
  const [names, logos] = await Promise.all([clientNames(), clientLogos()])
  const entries = summarizeVisits((data ?? []) as VisitRow[], Date.now()).map(e => ({ ...e, clientName: names.get(e.slug) ?? e.slug, clientLogo: logos.get(e.slug) ?? null }))
  return NextResponse.json({ setup: 'ready', days: 7, entries }, { headers: { 'Cache-Control': 'no-store' } })
}
