import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'node:crypto'
import { getSupabaseServer } from '@/lib/supabase'
import { tenantBySlug } from '@/lib/tenant'
import { syncLeads } from '@/lib/metaLeads'
import { metaConfig } from '@/lib/meta/config'
import { ensureRuntime } from '@/lib/meta/runtime'
import { StoreNotMigrated } from '@/lib/meta/limits'
import { runPipelineCycle, stores, purgeLeadsBefore, listAccounts, organicDeps } from '@/lib/meta/pipeline'
import { runOrganicCycle } from '@/lib/meta/organic'
import { runRetention } from '@/lib/meta/retention'
import { runWebhookEvents } from '@/lib/meta/webhookRunner'
import type { CycleReport } from '@/lib/meta/orchestrator'
import { refreshAccountsIfStale } from '@/lib/metaAccountsList'
import { liveOrigin } from '@/lib/meta/mode'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// O ciclo todo (fila 30 s + leads do caminho antigo + resto) precisa caber em 60 s da função.
const BUDGET_MS = 15_000
const lastRun = new Map<string, number>()

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : (req.nextUrl.searchParams.get('key') ?? '')
  const a = Buffer.from(given), b = Buffer.from(secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Caminho antigo (transitório): importa leads de cada cliente a cada chamada do cron.
 * Só roda antes do corte automático (legacy ligado) e só para contas que o novo pipeline ainda NÃO controla nesta fase.
 * No corte final (META_LEGACY_LIVE=false) este bloco deixa de existir na prática.
 */
async function legacyLeads(owned: Set<string>): Promise<Array<{ slug: string; imported?: number; skipped?: string; error?: string }>> {
  const db = getSupabaseServer()
  if (!db) return []
  const { data } = await db.from('clients').select('slug').order('slug')
  const started = Date.now()
  const results: Array<{ slug: string; imported?: number; skipped?: string; error?: string }> = []
  for (const { slug } of (data ?? []) as Array<{ slug: string }>) {
    if (Date.now() - started > BUDGET_MS) { results.push({ slug, skipped: 'sem tempo nesta rodada' }); continue }
    if (Date.now() - (lastRun.get(slug) ?? 0) < 45_000) { results.push({ slug, skipped: 'sincronizado há pouco' }); continue }
    const t = await tenantBySlug(slug)
    if (!t?.adAccountId) { results.push({ slug, skipped: 'sem conta de anúncios' }); continue }
    // O pipeline só assume os leads de uma conta depois de PROVAR que os coletou recentemente; até lá o caminho antigo segue como rede de segurança.
    if (owned.has(t.clientId)) {
      const last = (await stores.limit.getState(t.clientId).catch(() => null))?.lastSynced.leads
      if (last && Date.now() - last < metaConfig().ttlLeadsReconcileMin * 60_000 * 3) { results.push({ slug, skipped: 'controlado pelo novo pipeline' }); continue }
    }
    try {
      lastRun.set(slug, Date.now())
      const r = await syncLeads(t, 7)
      results.push(r.error ? { slug, error: r.error } : { slug, imported: r.imported })
    } catch (e) {
      results.push({ slug, error: e instanceof Error ? e.message : 'erro' })
    }
  }
  return results
}

/** Chamado pelo agendador externo (a cada 10 min) e pelo cron diário do Vercel. Só enfileira e processa a fila; nada é exposto sem o segredo. */
async function execute() {
  const startedAt = Date.now()
  await ensureRuntime(true)
  let pipeline: CycleReport | { skipped: string }
  try {
    const report = await runPipelineCycle()
    pipeline = report
    // Guarda o resumo do ciclo para o endpoint de saúde e para o painel de administração.
    await stores.limit.setSetting('last_cycle', { at: Date.now(), skipped: report.skipped, enqueued: report.enqueued, processed: report.processed, dead: report.dead })
    await runRetention({ cfg: metaConfig(), now: Date.now, state: stores.limit, jobs: stores.jobs, purgeLeads: purgeLeadsBefore })
  } catch (e) {
    pipeline = { skipped: e instanceof StoreNotMigrated ? 'tabelas não migradas (rode supabase/2026-09-meta-sync.sql)' : 'erro no pipeline' }
    if (!(e instanceof StoreNotMigrated)) console.error('[cron] pipeline:', e instanceof Error ? e.message : e)
  }

  // Orgânico (Página e Instagram): poucas contas por ciclo, só se sobrou tempo. Falha aqui nunca derruba o ciclo dos anúncios.
  let organic: unknown = null
  try {
    const c = metaConfig()
    if (!c.dryRun && Date.now() - startedAt < 30_000) {
      organic = await runOrganicCycle(organicDeps(), await listAccounts(), { hourBr: c.organicHourBr, perCycle: c.organicPerCycle, deadline: startedAt + 45_000 })
    }
  } catch (e) { if (!(e instanceof StoreNotMigrated)) console.error('[cron] organico:', e instanceof Error ? e.message : e) }

  // Mantém guardada a lista de contas do cadastro de clientes (2 consultas a cada 12 h; falha em silêncio).
  await refreshAccountsIfStale(await liveOrigin()).catch(() => { })

  // Eventos de webhook que ficaram pendentes (falha ou limite): reprocessa com o mesmo controle de limites.
  let webhook: unknown = null
  try { webhook = await runWebhookEvents() } catch (e) { if (!(e instanceof StoreNotMigrated)) console.error('[cron] webhook') }

  await ensureRuntime(true)
  const cfg = metaConfig() // já com o modo que o piloto automático decidiu neste ciclo
  const owned = new Set('owned' in pipeline ? pipeline.owned : [])
  const results = cfg.legacyLive ? await legacyLeads(owned) : []
  return NextResponse.json({
    ok: true, mode: { dryRun: cfg.dryRun, phase: cfg.phase, legacyLive: cfg.legacyLive, autopilot: cfg.autopilot },
    pipeline, webhook, organic, imported: results.reduce((s, r) => s + (r.imported ?? 0), 0), results,
  })
}

/**
 * O agendador externo desiste da chamada em 30 s e marca "falhou", mas o ciclo leva mais que isso.
 * Por isso responde na hora e faz o trabalho em segundo plano (o resumo fica salvo em last_cycle). Com ?wait=1 espera e devolve o relatório.
 */
async function run(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (req.nextUrl.searchParams.get('wait') === '1') return NextResponse.json(await execute())
  after(async () => { try { await execute() } catch (e) { console.error('[cron] falha no ciclo:', e instanceof Error ? e.message : e) } })
  return NextResponse.json({ ok: true, accepted: true })
}

export const GET = run
export const POST = run
