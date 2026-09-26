import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { clientLogos, clientNames, loadRegistry } from '@/lib/managersStore'
import { summarizeVisits, type VisitRow } from '@/lib/visits'

export const dynamic = 'force-dynamic'

/** Quem abriu qual conta de cliente no Gerenciador da Meta (avisado pela extensão). `manager` limita a um gestor. Administrador ou dono. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  const reg = await loadRegistry()
  if (!db || !reg) return NextResponse.json({ setup: 'tables' })
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 7))
  const wanted = req.nextUrl.searchParams.get('manager')
  const mgr = wanted ? reg.managers.find(m => m.id === wanted) : null
  if (wanted && !mgr) return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 404 })
  if (mgr && !mgr.email) return NextResponse.json({ setup: 'ready', days, entries: [], noEmail: true })
  const now = Date.now()
  let q = db.from('account_visits').select('visit_id,user_key,client_slug,started_at,last_seen,active_sec').gte('last_seen', new Date(now - days * 86_400_000).toISOString()).order('last_seen', { ascending: false }).limit(10000)
  if (mgr) q = q.eq('user_key', mgr.email!)
  else { const emails = reg.managers.flatMap(m => (m.email ? [m.email] : [])); if (!emails.length) return NextResponse.json({ setup: 'ready', days, entries: [] }); q = q.in('user_key', emails) }
  const { data, error } = await q
  if (error) return NextResponse.json({ setup: /relation|schema cache|does not exist/i.test(error.message) ? 'sql' : 'error' })
  const [names, logos] = await Promise.all([clientNames(), clientLogos()])
  const byEmail = new Map(reg.managers.flatMap(m => (m.email ? [[m.email, m] as const] : [])))
  const entries = summarizeVisits((data ?? []) as VisitRow[], now).map(e => ({ ...e, clientName: names.get(e.slug) ?? e.slug, clientLogo: logos.get(e.slug) ?? null, managerId: byEmail.get(e.userKey)?.id ?? null, managerName: byEmail.get(e.userKey)?.name ?? e.userKey, managerAvatar: byEmail.get(e.userKey)?.avatarUrl ?? null }))
  return NextResponse.json({ setup: 'ready', days, entries }, { headers: { 'Cache-Control': 'no-store' } })
}
