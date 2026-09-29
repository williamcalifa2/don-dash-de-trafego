import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from '@/lib/admin'
import { isPreviewEnvironment } from '@/lib/auth'
import { isAnswered, cleanReason } from '@/lib/managers'
import { clientLogos, clientNames, loadRegistry, loadTasks, ownersOf, saveReason } from '@/lib/managersStore'

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
  if (!admin && (!mine || (wanted && wanted !== mine.id))) return { error: NextResponse.json({ error: 'Você só vê as suas próprias otimizações.' }, { status: 403 }) }
  return { who, reg, admin, managerId, mine }
}

/** Tarefas de justificativa de um gestor (pendentes e já respondidas). */
export async function GET(req: NextRequest) {
  const demoTasks = () => NextResponse.json({
    setup: 'ready',
    manager: { id: 'mgr_1', name: 'Leonardo Dino', avatarUrl: null },
    pending: [
      {
        key: 'task_1', ids: [101], clientSlug: 'dal-moro', clientName: 'Dal Moro Advocacia', clientLogo: null,
        headline: 'Criação de nova campanha: DIREITO_BANCARIO_FEE_2026', short: 'Criou campanha "DIREITO_BANCARIO_FEE_2026"', at: new Date(Date.now() - 3600000).toISOString(),
        reason: null, reasonKinds: [], items: [{ text: 'Criou a campanha DIREITO_BANCARIO_FEE_2026', change: 'Nova campanha', objectName: 'DIREITO_BANCARIO_FEE_2026' }], actorName: 'Leonardo Dino', ownerId: 'mgr_1',
      },
      {
        key: 'task_2', ids: [102], clientSlug: 'ampari-med', clientName: 'Ampari Med', clientLogo: null,
        headline: 'Aumento de verba: CONV_WPP_CHECKUP (R$ 50 -> R$ 80/dia)', short: 'Escalou orçamento de R$ 50 para R$ 80/dia', at: new Date(Date.now() - 7200000).toISOString(),
        reason: null, reasonKinds: [], items: [{ text: 'Alterou o orçamento diário de R$ 50,00 para R$ 80,00', change: 'Escala 20%', objectName: 'CONV_WPP_CHECKUP' }], actorName: 'Leonardo Dino', ownerId: 'mgr_1',
      },
      {
        key: 'task_3', ids: [103], clientSlug: 'walkerz-club', clientName: 'Walkerz Club', clientLogo: null,
        headline: 'Substituição de criativos saturados por vídeo novo (Reels)', short: 'Trocou criativo saturado por vídeo UGC Reels', at: new Date(Date.now() - 14400000).toISOString(),
        reason: null, reasonKinds: [], items: [{ text: 'Pausou anúncio AD_01_ESTATICO e ativou AD_04_UGC_REELS', change: 'Fadiga criativa', objectName: 'AD_04_UGC_REELS' }], actorName: 'Leonardo Dino', ownerId: 'mgr_1',
      },
    ],
    answered: [
      {
        key: 'task_4', ids: [104], clientSlug: 'cavum-cirurgias', clientName: 'Cavum Cirurgias', clientLogo: null,
        headline: 'Otimização de lances e teste de público lookalike 1%', short: 'Testou novo público Lookalike 1%', at: new Date(Date.now() - 86400000).toISOString(),
        reason: 'Reduzir CPL que subiu nos últimos 3 dias', reasonKinds: ['cpl_alto', 'teste_publico'], items: [{ text: 'Adicionou público LAL 1% Cirurgias', change: 'Novo público', objectName: 'LAL 1%' }], actorName: 'Leonardo Dino', ownerId: 'mgr_1',
      },
    ],
    clients: [
      { slug: 'dal-moro', name: 'Dal Moro Advocacia', logo: null, pending: 1, answered: 0, lastAt: new Date(Date.now() - 3600000).toISOString(), headline: 'Criou campanha "DIREITO_BANCARIO_FEE_2026"', accountManager: null },
      { slug: 'ampari-med', name: 'Ampari Med', logo: null, pending: 1, answered: 0, lastAt: new Date(Date.now() - 7200000).toISOString(), headline: 'Escalou orçamento de R$ 50 para R$ 80/dia', accountManager: null },
      { slug: 'walkerz-club', name: 'Walkerz Club', logo: null, pending: 1, answered: 0, lastAt: new Date(Date.now() - 14400000).toISOString(), headline: 'Trocou criativo saturado por vídeo UGC Reels', accountManager: null },
      { slug: 'cavum-cirurgias', name: 'Cavum Cirurgias', logo: null, pending: 0, answered: 1, lastAt: new Date(Date.now() - 86400000).toISOString(), headline: 'Testou novo público Lookalike 1%', accountManager: null },
    ],
    counts: { pending: 3, answered: 1, rate: 25 },
  }, { headers: { 'Cache-Control': 'no-store' } })

  const a = await actor(req, req.nextUrl.searchParams.get('manager'))
  if ('error' in a) return isPreviewEnvironment() ? demoTasks() : a.error
  if (!a.managerId) return isPreviewEnvironment() ? demoTasks() : NextResponse.json({ setup: 'ready', manager: null, pending: [], answered: [], counts: { pending: 0, answered: 0, rate: null } })
  const r = await loadTasks()
  if ('error' in r) return isPreviewEnvironment() ? demoTasks() : NextResponse.json({ setup: r.error })
  const [names, logos] = await Promise.all([clientNames(), clientLogos()])
  const manager = a.reg.managers.find(m => m.id === a.managerId)
  const mine = r.tasks.filter(t => t.ownerId === a.managerId).map(t => ({ ...t, clientName: names.get(t.clientSlug) ?? t.clientSlug, clientLogo: logos.get(t.clientSlug) ?? null }))
  const pending = mine.filter(t => !isAnswered(t))
  const answered = mine.filter(isAnswered)
  // Resumo por cliente para os cards: quantas pendentes e justificadas, e a última alteração.
  const clients = new Map<string, { slug: string; name: string; logo: string | null; pending: number; answered: number; lastAt: string; headline: string; /** gestor da conta, quando não é o dono da otimização (a pessoa mexeu na conta de outro) */ accountManager: string | null }>()
  for (const t of mine) {
    const c = clients.get(t.clientSlug) ?? { slug: t.clientSlug, name: t.clientName, logo: t.clientLogo, pending: 0, answered: 0, lastAt: t.at, headline: t.short, accountManager: (() => { const mid = a.reg.byClient.get(t.clientSlug) ?? null; return mid && mid !== a.managerId ? a.reg.managers.find(m => m.id === mid)?.name ?? null : null })() }
    if (isAnswered(t)) c.answered++; else c.pending++
    if (t.at >= c.lastAt) { c.lastAt = t.at; if (!isAnswered(t)) c.headline = t.short }
    clients.set(t.clientSlug, c)
  }
  return NextResponse.json({
    setup: 'ready', manager: manager ? { id: manager.id, name: manager.name, avatarUrl: manager.avatarUrl } : null, pending, answered: answered.slice(0, 300),
    clients: [...clients.values()].sort((a, b) => b.pending - a.pending || b.lastAt.localeCompare(a.lastAt)),
    counts: { pending: pending.length, answered: answered.length, rate: mine.length ? Math.round((answered.length / mine.length) * 100) : null },
  })
}

/** Salva a justificativa de uma tarefa: { ids, reasonKinds, reason }. */
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
