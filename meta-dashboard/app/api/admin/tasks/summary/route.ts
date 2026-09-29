import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { isPreviewEnvironment } from '@/lib/auth'
import { isAnswered } from '@/lib/managers'
import { loadRegistry, loadTasks } from '@/lib/managersStore'

export const dynamic = 'force-dynamic'

/** Para o menu lateral: quantas justificativas pendentes tem quem está logado (pelo e-mail de login do gestor). */
export async function GET(req: NextRequest) {
  const who = await requestIdentity(req)
  if (!who || who.role === 'reader') return NextResponse.json({ managerId: null, pending: 0 })
  const reg = await loadRegistry()
  const mine = reg?.managers.find(m => m.email === who.email)
  if (!mine) {
    if (isPreviewEnvironment()) return NextResponse.json({ managerId: 'mgr_1', pending: 3 }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ managerId: null, pending: 0 })
  }
  const r = await loadTasks()
  if ('error' in r) return NextResponse.json({ managerId: mine.id, pending: 0 })
  return NextResponse.json({ managerId: mine.id, pending: r.tasks.filter(t => t.ownerId === mine.id && !isAnswered(t)).length }, { headers: { 'Cache-Control': 'no-store' } })
}
