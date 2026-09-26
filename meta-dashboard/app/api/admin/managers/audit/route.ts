import { pagedAll } from '@/lib/pagedRows'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { getAllClientsConfig } from '@/lib/clientConfig'
import { listMembers } from '@/lib/team'
import { backfillManager, loadRegistry } from '@/lib/managersStore'
import { auditManagers, type AuditInput } from '@/lib/managersAudit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAYS = 90

async function collect(): Promise<AuditInput | null> {
  const db = getSupabaseServer()
  const reg = await loadRegistry(true)
  if (!db || !reg) return null
  const [cl, mc, log, sync, members] = await Promise.all([
    db.from('clients').select('slug,display_name,ad_account_id,page_id'),
    db.from('manager_clients').select('client_slug,manager_id'),
    pagedAll(() => db.from('activity_log').select('client_slug,manager_id,actor_key,actor_name,source').gte('at', new Date(Date.now() - DAYS * 86_400_000).toISOString()).order('id'), { max: 50000 }),
    db.from('activity_sync').select('client_slug,last_error').not('last_error', 'is', null),
    listMembers().catch(() => null),
  ])
  if (cl.error || mc.error) return null
  const clients = (cl.data ?? []) as Array<{ slug: string; display_name: string | null; ad_account_id: string | null; page_id: string | null }>
  const cfgs = await getAllClientsConfig(clients.map(c => c.slug))
  const grouped = new Map<string, AuditInput['log'][number]>()
  for (const r of (log.data ?? []) as Array<{ client_slug: string; manager_id: string | null; actor_key: string | null; actor_name: string | null; source: string }>) {
    const k = `${r.client_slug}|${r.manager_id ?? ''}|${r.actor_key ?? ''}|${r.source}`
    const g = grouped.get(k)
    if (g) g.n++; else grouped.set(k, { slug: r.client_slug, managerId: r.manager_id, actorKey: r.actor_key, actorName: r.actor_name, source: r.source, n: 1 })
  }
  return {
    clients: clients.map(c => ({ slug: c.slug, name: c.display_name ?? c.slug, adAccountId: c.ad_account_id, pageId: c.page_id, active: cfgs[c.slug]?.active !== false })),
    managers: reg.managers.map(m => ({ id: m.id, name: m.name, email: m.email, metaActorId: m.metaActorId })),
    carteira: ((mc.data ?? []) as Array<{ client_slug: string; manager_id: string }>).map(r => ({ slug: r.client_slug, managerId: r.manager_id })),
    members: (members ?? []).map(m => ({ email: m.email, role: m.role })),
    log: [...grouped.values()],
    syncErrors: ((sync.data ?? []) as Array<{ client_slug: string; last_error: string }>).map(r => ({ slug: r.client_slug, error: r.last_error.slice(0, 120) })),
  }
}

/** Conferência dos dados dos gestores (carteira, e-mails, autores da Meta, histórico). Administrador ou dono. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const input = await collect()
  if (!input) return NextResponse.json({ setup: 'tables' })
  return NextResponse.json({ setup: 'ready', days: DAYS, ...auditManagers(input) }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Corrige o que tem conserto seguro: ações antigas sem gestor passam ao gestor atual da conta. */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const reg = await loadRegistry(true)
  if (!reg) return NextResponse.json({ setup: 'tables' })
  const by = new Map<string, string[]>()
  for (const [slug, mid] of reg.byClient) if (reg.managers.some(m => m.id === mid)) by.set(mid, [...(by.get(mid) ?? []), slug])
  let fixed = 0
  for (const [mid, slugs] of by) fixed += await backfillManager(slugs, mid)
  return NextResponse.json({ ok: true, fixed })
}
