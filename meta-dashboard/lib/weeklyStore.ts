/** Relatório semanal por cliente: gera a mensagem a partir dos números lidos da Meta e guarda o último de cada cliente (sem SQL: meta_settings). */
import { getSupabaseServer } from './supabase'
import { getAllClientsConfig } from './clientConfig'
import { logoPublicUrl } from './logo'
import { metaConfig } from './meta/config'
import { accountStateOrNull, snapshotMode } from './meta/mode'
import { ensureRuntime } from './meta/runtime'
import { readMetrics } from './meta/read'
import { refreshNow } from './meta/refreshNow'
import { stores } from './meta/pipeline'
import { buildWeeklyMessage, last7Range, weekKeyBr, type WeekNumbers } from './weeklyReport'

export interface WeeklyReport {
  /** segunda-feira da semana em que foi gerado */
  weekKey: string
  range: { since: string; until: string }
  /** ready = mensagem pronta · empty = sem veiculação na semana */
  status: 'ready' | 'empty'
  text: string | null
  generatedAt: number
}

export interface WeeklyClient { id: string; slug: string; name: string; logoUrl: string | null; adAccountId: string; active: boolean }

const key = (slug: string) => `weekly_report:${slug}`

export async function readWeekly(slug: string): Promise<WeeklyReport | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('meta_settings').select('value').eq('key', key(slug)).maybeSingle()
  const v = (data as { value?: WeeklyReport } | null)?.value
  return v && typeof v === 'object' && typeof v.weekKey === 'string' ? v : null
}

async function saveWeekly(slug: string, r: WeeklyReport): Promise<void> {
  const db = getSupabaseServer()
  if (!db) return
  await db.from('meta_settings').upsert({ key: key(slug), value: r, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/** Clientes com conta de anúncios, ativos primeiro. `slugs` limita a lista. */
export async function weeklyClients(slugs?: string[]): Promise<WeeklyClient[]> {
  const db = getSupabaseServer()
  if (!db) return []
  let q = db.from('clients').select('id,slug,display_name,logo_url,ad_account_id').not('ad_account_id', 'is', null).order('display_name')
  if (slugs) q = q.in('slug', slugs)
  const { data } = await q
  const rows = (data ?? []) as Array<{ id: string; slug: string; display_name: string | null; logo_url: string | null; ad_account_id: string }>
  const cfgs = await getAllClientsConfig(rows.map(r => r.slug))
  return rows.map(r => ({ id: r.id, slug: r.slug, name: r.display_name ?? r.slug, logoUrl: logoPublicUrl(r.slug, r.logo_url), adAccountId: r.ad_account_id, active: cfgs[r.slug]?.active !== false }))
}

const toWeek = (s: { spend: number; clicks: number; link_clicks: number; ctr: number; leads: number; results: number; cpl: number | null; cost_per_result: number | null; purchase_value: number; roas: number | null }): WeekNumbers => ({
  spend: s.spend, clicks: s.clicks, link_clicks: s.link_clicks, ctr: s.ctr, leads: s.leads, results: s.results, cpl: s.cpl, cost_per_result: s.cost_per_result, purchase_value: s.purchase_value, roas: s.roas,
})

export type GenerateResult = { ok: true; report: WeeklyReport } | { ok: false; reason: 'pending' | 'no_snapshot_mode' | 'blocked' | 'error'; detail?: string }

/**
 * Gera o relatório de um cliente. Precisa dos números de ontem: se a leitura guardada dos últimos 7 dias é de antes de hoje
 * (não cobre o último dia), busca de novo na Meta antes. Se a Meta não puder ser lida agora, devolve "pending" e a próxima rodada tenta.
 */
export async function generateWeekly(c: WeeklyClient, opts: { refresh?: boolean } = {}, now = Date.now()): Promise<GenerateResult> {
  await ensureRuntime()
  if (!(await snapshotMode())) return { ok: false, reason: 'no_snapshot_mode' }
  const cfg = metaConfig()
  const dayStartBr = Math.floor((now - 3 * 3_600_000) / 86_400_000) * 86_400_000 + 3 * 3_600_000
  const read = async () => readMetrics(stores.snaps, c.id, c.adAccountId, 'last_7d', cfg, await accountStateOrNull(c.id), now)
  let resp = await read()
  const coversYesterday = resp.freshness.updatedAt != null && resp.freshness.updatedAt >= dayStartBr
  if (opts.refresh !== false && (resp.freshness.pending || !coversYesterday)) {
    const r = await refreshNow({ clientId: c.id, slug: c.slug, adAccountId: c.adAccountId, pageId: null }, 'last_7d').catch(() => ({ done: false, reason: 'error' }))
    if (!r.done) return { ok: false, reason: r.reason === 'error' ? 'error' : 'blocked', detail: r.reason }
    resp = await read()
  }
  if (resp.freshness.pending) return { ok: false, reason: 'pending' }
  const range = last7Range(now)
  const text = buildWeeklyMessage({
    business: c.name, range, kind: resp.result_kind,
    current: toWeek(resp.summary), previous: resp.summary_prev ? toWeek(resp.summary_prev) : null,
    campaigns: resp.campaigns.map(x => ({ name: x.name, spend: x.spend, results: x.results, leads: x.leads })),
  })
  const report: WeeklyReport = { weekKey: weekKeyBr(now), range, status: text ? 'ready' : 'empty', text, generatedAt: now }
  await saveWeekly(c.slug, report)
  return { ok: true, report }
}

/** Gera o que falta da semana atual (clientes ativos sem relatório desta semana), dentro do tempo dado. Idempotente. */
export async function runWeeklyBatch(budgetMs = 45_000, now = Date.now()): Promise<{ week: string; total: number; missing: number; generated: number; pending: number; remaining: number; errors: Array<{ slug: string; reason: string }> }> {
  const week = weekKeyBr(now)
  const clients = (await weeklyClients()).filter(c => c.active)
  const todo: WeeklyClient[] = []
  for (const c of clients) { const r = await readWeekly(c.slug); if (!r || r.weekKey !== week) todo.push(c) }
  const deadline = Date.now() + budgetMs
  let generated = 0, pending = 0
  const errors: Array<{ slug: string; reason: string }> = []
  for (const c of todo) {
    if (Date.now() > deadline) break
    const r = await generateWeekly(c, {}, now)
    if (r.ok) generated++
    else { pending++; errors.push({ slug: c.slug, reason: r.detail ?? r.reason }) }
  }
  return { week, total: clients.length, missing: todo.length, generated, pending, remaining: Math.max(0, todo.length - generated - pending), errors: errors.slice(0, 10) }
}
