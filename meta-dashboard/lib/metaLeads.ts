import { insertMetaLeads, repairMetaLead, deleteMetaTestLeads } from './supabase'
import type { Tenant } from './tenant'
import { legacyGet, metaCooldownMinutes } from './meta/legacy'
import type { Origin } from './meta/client'
import { metaConfig } from './meta/config'

export interface GraphResult<T = Record<string, unknown>> { ok: boolean; status: number; data: T; error?: string; code?: number; blocked?: string; dryRun?: boolean }

export { metaCooldownMinutes }

// Guarda respostas que mudam pouco (token da página, lista de formulários) para gastar menos chamadas.
const memo = new Map<string, { at: number; v: unknown }>()
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, keep: (v: T) => boolean): Promise<T> {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T
  const v = await fn()
  if (keep(v)) memo.set(key, { at: Date.now(), v })
  return v
}

/** Leitura na Graph API pelo cliente central (somente GET, token no cabeçalho). */
export async function graph<T = Record<string, unknown>>(path: string, opts: { token?: string; clientId?: string | null; accountId?: string | null; origin?: Origin } = {}): Promise<GraphResult<T>> {
  const r = await legacyGet<T>(path, { token: opts.token, clientId: opts.clientId, accountId: opts.accountId, origin: opts.origin, purpose: 'leads' })
  return { ok: r.ok, status: r.status, data: r.data, code: r.error?.code, blocked: r.blocked, dryRun: r.dryRun, error: r.ok ? undefined : (r.error?.message ?? `Erro ${r.status}`) }
}

export interface RawLead {
  id?: string
  created_time?: string
  field_data?: Array<{ name: string; values: string[] }>
  ad_id?: string
  ad_name?: string
  adset_name?: string
  campaign_name?: string
}

const NAME_KEYS = ['full_name', 'nome_completo', 'nome', 'name', 'seu_nome']
const PHONE_KEYS = ['phone_number', 'telefone', 'phone', 'celular', 'whatsapp', 'seu_telefone']
const EMAIL_KEYS = ['email', 'e-mail', 'seu_email']

const norm = (k: string) => k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function pick(fields: Map<string, string>, exact: string[], contains: string[], not: string[] = []): { key: string; value: string } | null {
  for (const k of exact) { const v = fields.get(k); if (v) return { key: k, value: v } }
  for (const [k, v] of fields) if (v && contains.some(c => k.includes(c)) && !not.some(n => k.includes(n))) return { key: k, value: v }
  return null
}

const pretty = (k: string) => { const t = k.replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1) }

/** Converte um lead do Meta nos campos do painel. Os formulários nomeiam os campos de jeitos diferentes. */
export function parseLead(d: RawLead) {
  const original = new Map<string, string>()
  const fields = new Map<string, string>()
  for (const x of d.field_data ?? []) {
    const v = (x.values ?? []).filter(Boolean).join(', ')
    original.set(x.name, v)
    fields.set(norm(x.name), v)
  }
  const first = fields.get('first_name'), last = fields.get('last_name')
  const nome = pick(fields, NAME_KEYS, ['nome', 'name'], ['empresa', 'company', 'cidade', 'city'])
  const tel = pick(fields, PHONE_KEYS, ['phone', 'telefone', 'celular', 'whatsapp'])
  const mail = pick(fields, EMAIL_KEYS, ['email', 'e-mail'])
  const used = new Set([nome?.key, tel?.key, mail?.key, first ? 'first_name' : undefined, last ? 'last_name' : undefined])

  // O que sobra (perguntas do formulário) vira uma nota, para o time ver a qualificação do lead.
  const extras = [...original.entries()].filter(([k, v]) => v && !used.has(norm(k)))
    .map(([k, v]) => `• ${pretty(k)}: ${v}`)
  const notas = extras.length ? `Respostas do formulário:\n${extras.join('\n')}`.slice(0, 1900) : null

  return {
    test: [...original.values()].some(v => /^<test lead/i.test(v)),
    nome: nome?.value ?? ([first, last].filter(Boolean).join(' ') || null),
    email: mail?.value ?? null,
    telefone: tel?.value ?? null,
    notas,
    ad_name: d.ad_name || d.ad_id || null,
    campanha: d.campaign_name || null,
    conjunto: d.adset_name || null,
    date: d.created_time ? new Date(d.created_time).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    created_at: d.created_time ? new Date(d.created_time).toISOString() : undefined,
  }
}

/** Traduz erros comuns do Meta para o que fazer. */
export function friendlyMetaError(msg: string | undefined): string {
  if (!msg) return 'Erro desconhecido do Meta.'
  if (/request limit|rate limit|too many calls|reduce the amount of data/i.test(msg)) return 'O Meta pediu para reduzir o ritmo das consultas. O painel tenta de novo em alguns minutos.'
  if (/leads_retrieval|pages_manage_ads/i.test(msg)) return 'O token do Meta não tem a permissão leads_retrieval (ou pages_manage_ads). Gere um token novo com essa permissão.'
  if (/OAuth|access token/i.test(msg)) return 'O token do Meta não tem acesso a essa página, ou expirou.'
  if (/permission|\(#200\)|\(#10\)/i.test(msg)) return 'O token do Meta não tem permissão para essa página. Dê acesso à página ao usuário do token.'
  return msg
}

/** Página do Facebook do cliente: a cadastrada ou, se houver só uma, a que a conta de anúncios pode promover. */
export async function findPage(t: Tenant, origin?: Origin): Promise<{ id: string; name: string | null; source: 'cadastro' | 'conta' } | null> {
  if (t.pageId) return { id: t.pageId, name: null, source: 'cadastro' }
  if (!t.adAccountId) return null
  const r = await cached(`promo:${t.adAccountId}`, 60 * 60_000, () => graph<{ data?: Array<{ id: string; name: string }> }>(`${t.adAccountId}/promote_pages?fields=id,name&limit=25`, { clientId: t.clientId, accountId: t.adAccountId, origin }), x => x.ok)
  const pages = r.data.data ?? []
  return pages.length === 1 ? { id: pages[0].id, name: pages[0].name, source: 'conta' } : null
}

export async function pageToken(pageId: string, ctx: { clientId?: string | null; origin?: Origin } = {}): Promise<GraphResult<{ access_token?: string }>> {
  return cached(`pt:${pageId}`, 10 * 60_000, () => graph<{ access_token?: string }>(`${pageId}?fields=access_token`, ctx), r => r.ok && !!r.data.access_token)
}

export interface SyncResult { imported: number; scanned: number; forms: number; page: string | null; repaired?: number; error?: string; blocked?: string; truncated?: boolean; noPage?: boolean }

/** Importa do Meta os leads dos formulários da página do cliente (por padrão dos últimos dias). */
export async function syncLeads(t: Tenant, days = 2, opts: { repair?: boolean; origin?: Origin; sinceEpochSec?: number } = {}): Promise<SyncResult> {
  const wait = metaCooldownMinutes()
  if (wait > 0) return { imported: 0, scanned: 0, forms: 0, page: null, blocked: 'cooldown', error: `O Meta pediu para reduzir o ritmo das consultas. Nova tentativa em cerca de ${wait} min.` }
  const page = await findPage(t, opts.origin)
  if (!page) return { imported: 0, scanned: 0, forms: 0, page: null, noPage: true, error: 'Não encontrei a página do Facebook deste cliente. Cadastre a página em Opções avançadas.' }

  const ctx = { clientId: t.clientId, origin: opts.origin }
  const tok = await pageToken(page.id, ctx)
  if (!tok.ok || !tok.data.access_token) return { imported: 0, scanned: 0, forms: 0, page: page.id, blocked: tok.blocked, error: friendlyMetaError(tok.error) }
  const pt = tok.data.access_token

  const forms = await cached(`forms:${page.id}`, 30 * 60_000, () => graph<{ data?: Array<{ id: string; name: string }> }>(`${page.id}/leadgen_forms?fields=id,name&limit=100`, { token: pt, ...ctx }), r => r.ok)
  if (!forms.ok) return { imported: 0, scanned: 0, forms: 0, page: page.id, blocked: forms.blocked, error: friendlyMetaError(forms.error) }
  const formList = forms.data.data ?? []

  const since = opts.sinceEpochSec ?? Math.floor(Date.now() / 1000) - Math.min(Math.max(days, 1), 90) * 86_400
  const filtering = encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]))
  const collected: RawLead[] = []
  let truncated = false
  for (const form of formList) {
    let after: string | undefined
    for (let i = 0; ; i++) {
      if (i >= metaConfig().maxPagesPerJob) { truncated = true; break }
      const path: string = `${form.id}/leads?fields=id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name&limit=100&filtering=${filtering}${after ? `&after=${encodeURIComponent(after)}` : ''}`
      const r: GraphResult<{ data?: RawLead[]; paging?: { next?: string; cursors?: { after?: string } } }> = await graph(path, { token: pt, ...ctx })
      if (!r.ok) return { imported: 0, scanned: collected.length, forms: formList.length, page: page.id, blocked: r.blocked, error: friendlyMetaError(r.error) }
      collected.push(...(r.data.data ?? []))
      after = r.data.paging?.next ? r.data.paging.cursors?.after : undefined
      if (!after) break
    }
  }

  const rows = collected.filter(l => l.id).map(l => ({ l, p: parseLead(l) })).filter(x => !x.p.test).map(({ l, p }) => {
    const { test: _t, ...rest } = p
    void _t
    return { meta_lead_id: l.id!, status: 'Novo' as const, ...rest }
  })
  const imported = await insertMetaLeads(t.clientId, rows)
  // Corrige leads já gravados sem nome/telefone (importados antes de reconhecermos o formato do formulário).
  let repaired = 0
  if (opts.repair) await deleteMetaTestLeads(t.clientId)
  if (opts.repair) for (const r of rows) if (await repairMetaLead(t.clientId, r.meta_lead_id, { nome: r.nome, telefone: r.telefone, email: r.email, notas: r.notas })) repaired++
  return { imported, scanned: collected.length, forms: formList.length, page: page.id, repaired, truncated }
}
