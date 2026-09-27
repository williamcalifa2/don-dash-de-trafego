import { NextRequest, NextResponse, after } from 'next/server'
import { requireRole } from '@/lib/admin'
import { loadRegistry } from '@/lib/activityLog'
import { allow } from '@/lib/rateLimit'
import { FORMAT, generateWeekly, readWeekly, weeklyClients, type WeeklyReport } from '@/lib/weeklyStore'
import { weekKeyBr } from '@/lib/weeklyReport'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Relatórios semanais dos clientes de um gestor. Sem `manager`: todos os clientes. Administrador ou dono. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const reg = await loadRegistry().catch(() => null)
  const wanted = req.nextUrl.searchParams.get('manager')
  const slugs = wanted && reg ? [...reg.byClient.entries()].filter(([, id]) => id === wanted).map(([s]) => s) : undefined
  const clients = (await weeklyClients(slugs)).filter(c => c.active)
  const week = weekKeyBr()
  const items = await Promise.all(clients.map(async c => {
    const r = await readWeekly(c.slug)
    const current = !!r && r.weekKey === week && r.v === FORMAT
    return { slug: c.slug, name: c.name, logoUrl: c.logoUrl, report: r as WeeklyReport | null, state: current ? (r!.status === 'ready' ? 'ready' : 'empty') : r ? 'old' : 'none' as 'ready' | 'empty' | 'old' | 'none' }
  }))
  // Abrir a aba puxa o que falta da semana (até 3 por vez, no máximo a cada 3 min): a segunda de madrugada já deixa quase tudo pronto.
  const missing = clients.filter((_, i) => items[i].state === 'old' || items[i].state === 'none').slice(0, 3)
  if (missing.length && allow(`weekly:${wanted ?? 'all'}`, 1, 3 * 60_000)) after(async () => { for (const c of missing) { try { await generateWeekly(c) } catch (e) { console.error('[weekly]', e instanceof Error ? e.message : e) } } })
  return NextResponse.json({ week, items }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Gera de novo o relatório de um cliente agora (busca os números na Meta se precisar). Corpo: { slug }. */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const { slug } = await req.json().catch(() => ({})) as { slug?: unknown }
  if (typeof slug !== 'string') return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })
  if (!allow(`weekly-now:${slug}`, 1, 20_000)) return NextResponse.json({ ok: false, reason: 'cooldown' })
  const c = (await weeklyClients([slug]))[0]
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  const r = await generateWeekly(c)
  return NextResponse.json(r.ok ? { ok: true, report: r.report } : { ok: false, reason: r.reason, detail: r.detail })
}
