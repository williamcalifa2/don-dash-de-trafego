import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { loadRegistry } from '@/lib/managersStore'

export const dynamic = 'force-dynamic'

/** Lista leve de gestores e de quem cuida de cada cliente, para escolher o responsável ao cadastrar. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const reg = await loadRegistry()
  if (!reg) return NextResponse.json({ ready: false, managers: [], byClient: {} })
  return NextResponse.json({ ready: true, managers: reg.managers.map(m => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl })), byClient: Object.fromEntries(reg.byClient) })
}
