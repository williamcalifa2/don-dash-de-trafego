import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { isAnswered, cleanReason } from '@/lib/managers'
import { clientNames, loadRegistry, loadTasks, ownersOf, saveReason } from '@/lib/managersStore'

export const dynamic = 'force-dynamic'

/** Quem é o gestor dessa pessoa e se ela pode ver as tarefas dele: administrador vê qualquer gestor; membro só as próprias (pelo e-mail de login). */
async function actor(req: NextRequest, wanted: string | null) {
  const who = await requestIdentity(req)
  if (!who || who.role === 'reader') return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const reg = await loadRegistry()
  if (!reg) return { error: NextResponse.json({ setup: 'tables' }) }
  const mine = reg.managers.find(m => m.email === who.email) ?? null
  const admin = who.role === 'owner' || who.role === 'admin'
  const managerId = admin ? wanted : mine?.id ?? null
  if (!admin && (!mine || (wanted && wanted !== mine.id))) return { error: NextResponse.json({ error: 'Você só vê as suas próprias justificativas.' }, { status: 403 }) }
  return { who, reg, admin, managerId, mine }
}

/** Tarefas de justificativa de um gestor (pendentes e já respondidas). */
export async function GET(req: NextRequest) {
  const a = await actor(req, req.nextUrl.searchParams.get('manager'))
  if ('error' in a) return a.error
  if (!a.managerId) return NextResponse.json({ setup: 'ready', manager: null, pending: [], answered: [], counts: { pending: 0, answered: 0, rate: null } })
  const r = await loadTasks()
  if ('error' in r) return NextResponse.json({ setup: r.error })
  const names = await clientNames()
  const manager = a.reg.managers.find(m => m.id === a.managerId)
  const mine = r.tasks.filter(t => t.ownerId === a.managerId).map(t => ({ ...t, clientName: names.get(t.clientSlug) ?? t.clientSlug }))
  const pending = mine.filter(t => !isAnswered(t))
  const answered = mine.filter(isAnswered)
  return NextResponse.json({
    setup: 'ready', manager: manager ? { id: manager.id, name: manager.name, avatarUrl: manager.avatarUrl } : null, pending, answered: answered.slice(0, 60),
    counts: { pending: pending.length, answered: answered.length, rate: mine.length ? Math.round((answered.length / mine.length) * 100) : null },
  })
}

/** Salva a justificativa de uma tarefa: { ids, reasonKind, reason }. */
export async function POST(req: NextRequest) {
  const a = await actor(req, null)
  if ('error' in a) return a.error
  const b = await req.json().catch(() => ({})) as { ids?: unknown }
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((n): n is number => Number.isInteger(n) && n > 0))].slice(0, 500) : []
  if (!ids.length) return NextResponse.json({ error: 'Nada para justificar.' }, { status: 400 })
  const v = cleanReason(b)
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  if (!a.admin) {
    const owners = await ownersOf(ids)
    if (!owners || !owners.length || owners.some(o => o !== a.mine!.id)) return NextResponse.json({ error: 'Essa tarefa é de outro gestor.' }, { status: 403 })
  }
  const err = await saveReason(ids, v, a.who.email)
  return err ? NextResponse.json({ error: err }, { status: 400 }) : NextResponse.json({ ok: true })
}
