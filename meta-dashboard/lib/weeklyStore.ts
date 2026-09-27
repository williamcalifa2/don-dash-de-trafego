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
import { buildWeeklyMessage, last7Range, organicWeekly, profileCampaignSpend, weekKeyBr, type WeekCampaign, type WeekNumbers } from './weeklyReport'
import { readOrganic } from './meta/organicRead'
import type { MetricsSummary } from './meta'

/** Versão do formato da mensagem: mudou o texto, os relatórios da versão antiga são refeitos. */
export const FORMAT = 3

export interface WeeklyReport {
  v?: number
  /** segunda-feira da semana em que foi gerado (identifica o relatório) */
  weekKey: string
  range: { since: string; until: string }
  /** ready = mensagem pronta · empty = sem veiculação na semana */
  status: 'ready' | 'empty'
  text: string | null
  /** texto que a pessoa ajustou e salvou; vale no lugar do gerado */
  edited?: string | null
  editedAt?: number
  generatedAt: number
  /** números que deram origem à mensagem, guardados para consultar o histórico */
  kind?: string
  current?: WeekNumbers
  previous?: WeekNumbers | null
  top?: { name: string; spend: number; results: number } | null
}

export interface WeeklyClient { id: string; slug: string; name: string; logoUrl: string | null; adAccountId: string; active: boolean }

/** Um relatório por cliente e por semana: fica guardado (histórico), sem SQL (meta_settings). */
const key = (slug: string, week: string) => `weekly_report:${slug}:${week}`

export async function readWeekly(slug: string, week: string): Promise<WeeklyReport | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('meta_settings').select('value').eq('key', key(slug, week)).maybeSingle()
  const v = (data as { value?: WeeklyReport } | null)?.value
  return v && typeof v === 'object' && typeof v.weekKey === 'string' ? v : null
}

/** Semanas guardadas de um cliente, da mais nova para a mais antiga. */
export async function listWeekly(slug: string, limit = 26): Promise<WeeklyReport[]> {
  const db = getSupabaseServer()
  if (!db) return []
  const { data } = await db.from('meta_settings').select('key,value').like('key', `weekly_report:${slug}:%`).order('key', { ascending: false }).limit(limit)
  return ((data ?? []) as Array<{ value: WeeklyReport }>).map(r => r.value).filter(v => v && typeof v.weekKey === 'string')
}

async function saveWeekly(slug: string, r: WeeklyReport): Promise<void> {
  const db = getSupabaseServer()
  if (!db) return
  await db.from('meta_settings').upsert({ key: key(slug, r.weekKey), value: r, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/** Guarda o texto que a pessoa ajustou. Devolve false se essa semana não existe. */
export async function saveEdited(slug: string, week: string, text: string): Promise<boolean> {
  const r = await readWeekly(slug, week)
  if (!r) return false
  await saveWeekly(slug, { ...r, edited: text.slice(0, 4000), editedAt: Date.now() })
  return true
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

const toWeek = (s: MetricsSummary): WeekNumbers => ({
  spend: s.spend, reach: s.reach, leads: s.leads, results: s.results, cpl: s.cpl, cost_per_result: s.cost_per_result,
  purchase_value: s.purchase_value, roas: s.roas,
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
  const current = toWeek(resp.summary)
  const previous = resp.summary_prev ? toWeek(resp.summary_prev) : null
  const campaigns: WeekCampaign[] = resp.campaigns.map(x => ({ name: x.name, spend: x.spend, results: x.results, leads: x.leads }))
  // Visitas ao perfil e seguidores novos: dado orgânico real (Instagram/Facebook Insights), sem SQL nem chamada extra à Meta (já coletado pelo ciclo do sistema).
  const organic = await readOrganic(stores.snaps, c.id, 'last_7d', now).catch(() => null)
  const profile = organicWeekly(organic, profileCampaignSpend(campaigns))
  const text = buildWeeklyMessage({
    business: c.name, range, kind: resp.result_kind,
    current, previous, campaigns, profile,
  })
  const top = [...campaigns].filter(x => (resp.result_kind === 'form' ? x.leads : x.results) > 0 && x.spend > 0).sort((a, b) => (resp.result_kind === 'form' ? b.leads - a.leads : b.results - a.results))[0]
  const report: WeeklyReport = { v: FORMAT, weekKey: weekKeyBr(now), range, status: text ? 'ready' : 'empty', text, generatedAt: now, kind: resp.result_kind, current, previous, top: top ? { name: top.name, spend: top.spend, results: resp.result_kind === 'form' ? top.leads : top.results } : null }
  await saveWeekly(c.slug, report)
  return { ok: true, report }
}

/** Gera o que falta da semana atual (clientes ativos sem relatório desta semana), dentro do tempo dado. Idempotente. */
export async function runWeeklyBatch(budgetMs = 45_000, now = Date.now()): Promise<{ week: string; total: number; missing: number; generated: number; pending: number; remaining: number; errors: Array<{ slug: string; reason: string }> }> {
  const week = weekKeyBr(now)
  const clients = (await weeklyClients()).filter(c => c.active)
  const todo: WeeklyClient[] = []
  for (const c of clients) { const r = await readWeekly(c.slug, week); if (!r || r.v !== FORMAT) todo.push(c) }
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
