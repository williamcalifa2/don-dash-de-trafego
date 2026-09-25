import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getAllClientsConfig } from '@/lib/clientConfig'
import { clientNames, lastAccessByEmail, loadRegistry, readLog } from '@/lib/managersStore'
import { buildStalled, countByManager, type StalledBy } from '@/lib/stalled'

export const dynamic = 'force-dynamic'

const LOOKBACK_DAYS = 90

/** Contas da carteira dos gestores sem movimento há X dias (sem ação nas contas e/ou sem abrir o cliente no painel). Administrador ou dono. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const q = req.nextUrl.searchParams
  const days = Math.min(60, Math.max(1, Math.round(Number(q.get('days')) || 3)))
  const by: StalledBy = q.get('by') === 'action' || q.get('by') === 'access' ? q.get('by') as StalledBy : 'any'
  const reg = await loadRegistry(true)
  if (!reg) return NextResponse.json({ setup: 'tables' })
  const now = Date.now()
  const sinceIso = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString()
  const emails = reg.managers.flatMap(m => (m.email ? [m.email] : []))
  const [log, access, names] = await Promise.all([readLog({ sinceIso, limit: 20000 }), lastAccessByEmail(emails, sinceIso), clientNames()])
  const lastAction = new Map<string, string>()
  // O histórico vem do mais novo para o mais antigo. Rodada de leitura e login não contam como movimento.
  for (const r of log ?? []) if (r.kind !== 'sync' && r.kind !== 'access' && !lastAction.has(r.client_slug)) lastAction.set(r.client_slug, r.at)
  const cfgs = await getAllClientsConfig([...reg.byClient.keys()])
  const paused = new Set([...reg.byClient.keys()].filter(s => cfgs[s]?.active === false))
  const rows = buildStalled({ managers: reg.managers, byClient: new Map(reg.byClient), lastAction, lastAccess: access, names, paused, now }, days, by)
  const counts = countByManager(rows)
  return NextResponse.json({ setup: 'ready', days, by, rows, byManager: reg.managers.map(m => ({ id: m.id, name: m.name, n: counts.get(m.id) ?? 0 })).filter(m => m.n > 0), lookbackDays: LOOKBACK_DAYS })
}
