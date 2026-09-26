import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { isRangePeriod, usageRange } from '@/lib/usage'
import { clientLogos, clientNames, loadRegistry, readLog } from '@/lib/managersStore'
import { addCounts, emptyCounts, summarize } from '@/lib/periodSummary'

export const dynamic = 'force-dynamic'

/**
 * Resumo do período: quantos objetos cada gestor criou, pausou, ativou e quantos orçamentos, públicos, lances e criativos alterou.
 * Sem `manager`: uma linha por gestor. Com `manager`: o total dele e uma linha por cliente. Feito por quem fez (usuário da Meta ou e-mail). Administrador ou dono.
 */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const reg = await loadRegistry()
  if (!reg) return NextResponse.json({ setup: 'tables' })
  const qp = req.nextUrl.searchParams.get('period')
  const period = isRangePeriod(qp) ? qp : '7'
  const { sinceMs, untilMs } = usageRange(period)
  const rows = await readLog({ sinceIso: new Date(sinceMs).toISOString(), untilIso: new Date(untilMs).toISOString(), limit: 40000 })
  if (!rows) return NextResponse.json({ setup: 'error' })

  const owner = new Map<string, string>()
  for (const m of reg.managers) { if (m.metaActorId) owner.set(`meta:${m.metaActorId}`, m.id); if (m.email) owner.set(m.email.toLowerCase(), m.id) }
  const ownerOf = (r: { actor_key: string | null }) => (r.actor_key ? owner.get(r.actor_key) ?? owner.get(r.actor_key.toLowerCase()) ?? null : null)

  const wanted = req.nextUrl.searchParams.get('manager')
  if (wanted) {
    if (!reg.managers.some(m => m.id === wanted)) return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 404 })
    const mine = rows.filter(r => ownerOf(r) === wanted)
    const [names, logos] = await Promise.all([clientNames(), clientLogos()])
    const byClient = summarize(mine, r => r.client_slug)
    const total = [...byClient.values()].reduce(addCounts, emptyCounts())
    return NextResponse.json({ setup: 'ready', period, total, byClient: [...byClient.entries()].map(([slug, counts]) => ({ slug, name: names.get(slug) ?? slug, logoUrl: logos.get(slug) ?? null, counts })) })
  }
  const byManager = summarize(rows, r => ownerOf(r))
  const list = reg.managers.map(m => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl, counts: byManager.get(m.id) ?? emptyCounts() }))
  const total = list.reduce((a, m) => addCounts(a, m.counts), emptyCounts())
  return NextResponse.json({ setup: 'ready', period, total, byManager: list })
}
