import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { requireTenant } from '@/lib/tenant'
import { allow } from '@/lib/rateLimit'
import { metaConfig } from '@/lib/meta/config'
import { stores } from '@/lib/meta/pipeline'
import { snapshotMode, accountStateOrNull, snapshotGuard } from '@/lib/meta/mode'
import { readMetrics, readPerformance } from '@/lib/meta/read'
import { readOrganic } from '@/lib/meta/organicRead'
import { refreshNow, refreshOrganicNow } from '@/lib/meta/refreshNow'
import { cleanNotes, draftAnalysis, EMPTY_NOTES, monthEndsAt, organicSection, paidSection, reportPeriodOf, type ReportData, type ReportNotes, type ReportPreset } from '@/lib/report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Relatório mensal ou semanal. Só a equipe da agência (membro ou acima). Lê do banco; "preparar" busca na Meta (poucas chamadas). */
const notesKey = (slug: string, periodKey: string) => `report_notes:${slug}:${periodKey}`
const baseKey = (slug: string) => `report_base:${slug}`

async function loadNotes(slug: string, periodKey: string): Promise<ReportNotes> {
  const [saved, base] = await Promise.all([stores.limit.getSetting<ReportNotes>(notesKey(slug, periodKey)), stores.limit.getSetting<Partial<ReportNotes>>(baseKey(slug))])
  if (saved) return cleanNotes(saved)
  // Período novo: objetivo e metas do cliente vêm do último relatório base; análise e próximos passos começam em branco.
  return { ...EMPTY_NOTES, objective: cleanNotes(base).objective, goals: cleanNotes(base).goals }
}

export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  if (!(await snapshotMode())) return NextResponse.json({ error: 'O relatório usa os dados guardados e só funciona com a sincronização central ligada.' }, { status: 409 })
  if (!tenant.adAccountId) return NextResponse.json({ error: 'A conta de anúncios deste cliente ainda não foi configurada.' }, { status: 409 })
  const account = tenant.adAccountId

  const { searchParams } = new URL(req.url)
  const preset: ReportPreset = searchParams.get('preset') === 'last_7d' ? 'last_7d' : 'last_month'

  return snapshotGuard(async () => {
    const period = reportPeriodOf(preset, Date.now())
    const cfg = metaConfig()
    const st = await accountStateOrNull(tenant.clientId)
    const [organic, metrics, perf, struct, notes] = await Promise.all([
      readOrganic(stores.snaps, tenant.clientId, preset),
      readMetrics(stores.snaps, tenant.clientId, account, preset, cfg, st),
      readPerformance(stores.snaps, tenant.clientId, preset, cfg, st),
      stores.snaps.get<Array<{ id: string; creative?: Record<string, unknown> }>>(tenant.clientId, 'structure', 'ads'),
      loadNotes(tenant.slug, period.key),
    ])
    // Sem o resumo guardado, os números ainda não foram buscados.
    const summary = await stores.snaps.get(tenant.clientId, 'summary', preset)
    const notBefore = preset === 'last_month' ? monthEndsAt(period) : 0
    const hasPaid = preset === 'last_month'
      ? (!!summary && summary.fetchedAt >= notBefore)
      : (!!summary && (metrics.summary?.spend != null || metrics.summary?.impressions != null))
    const paid = paidSection(hasPaid ? metrics : null, perf.rows, struct?.payload ?? [])
    const { currency, ...paidOut } = paid
    const data: ReportData = {
      month: period, client: { name: tenant.name, logoUrl: tenant.logoUrl }, currency,
      organic: organicSection(organic, notBefore), paid: paidOut, notes,
    }
    return NextResponse.json({ ...data, draftAnalysis: draftAnalysis(data) }, { headers: { 'Cache-Control': 'no-store' } })
  })
}

export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const body = await req.json().catch(() => ({})) as { action?: string; notes?: unknown; preset?: string }
  const preset: ReportPreset = body.preset === 'last_7d' ? 'last_7d' : 'last_month'
  const period = reportPeriodOf(preset, Date.now())

  if (body.action === 'save') {
    const notes = cleanNotes(body.notes)
    await stores.limit.setSetting(notesKey(tenant.slug, period.key), notes)
    await stores.limit.setSetting(baseKey(tenant.slug), { objective: notes.objective, goals: notes.goals })
    return NextResponse.json({ saved: true })
  }

  if (body.action === 'prepare') {
    if (!(await snapshotMode())) return NextResponse.json({ error: 'Disponível só com a sincronização central ligada.' }, { status: 409 })
    if (!tenant.adAccountId) return NextResponse.json({ error: 'A conta de anúncios deste cliente ainda não foi configurada.' }, { status: 409 })
    if (!allow(`report:${tenant.slug}`, 1, 60_000)) return NextResponse.json({ prepared: false, reason: 'cooldown', retryInSec: 60 })
    const acc = { clientId: tenant.clientId, slug: tenant.slug, adAccountId: tenant.adAccountId, pageId: tenant.pageId }
    // Anúncios do período e orgânico, em paralelo. Passam por todos os freios do sistema.
    const [ads, org] = await Promise.all([refreshNow(acc, preset), refreshOrganicNow(acc)])
    return NextResponse.json({ prepared: ads.done && org.done, ads, organic: org })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
