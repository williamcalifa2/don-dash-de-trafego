/**
 * Webhook de leads (leadgen): validar assinatura, extrair os IDs, guardar e responder rápido.
 * O processamento (buscar o lead e gravar) roda depois, em fila, e é idempotente por leadgen_id.
 * Nenhum dado pessoal é guardado na fila nem vai para log.
 */
import crypto from 'node:crypto'

/** Confere X-Hub-Signature-256 (HMAC-SHA256 do corpo BRUTO com o segredo do app), em tempo constante. */
export function verifySignature(rawBody: string, signature: string | null | undefined, appSecret: string): boolean {
  if (!signature || !appSecret) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(signature), b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export interface LeadEvent { leadgenId: string; pageId: string; adId: string }

/** Extrai só os IDs dos eventos leadgen. Ignora o resto do payload. */
export function extractLeadEvents(payload: unknown): LeadEvent[] {
  const out: LeadEvent[] = []
  const entries = (payload && typeof payload === 'object' ? (payload as { entry?: unknown }).entry : undefined)
  if (!Array.isArray(entries)) return out
  for (const entry of entries as Array<Record<string, unknown>>) {
    const changes = Array.isArray(entry?.changes) ? entry.changes as Array<Record<string, unknown>> : []
    for (const ch of changes) {
      if (ch?.field !== 'leadgen' || !ch.value || typeof ch.value !== 'object') continue
      const v = ch.value as Record<string, unknown>
      const leadgenId = String(v.leadgen_id ?? '')
      if (!/^\d{5,25}$/.test(leadgenId)) continue
      out.push({ leadgenId, pageId: String(v.page_id ?? entry.id ?? '').replace(/[^\d]/g, ''), adId: String(v.ad_id ?? '').replace(/[^\d]/g, '') })
    }
  }
  return out
}

export interface EventRow { leadgenId: string; pageId: string; adId: string; status: 'pending' | 'done' | 'failed'; attempts: number; runAfter: number; error?: string | null }

export interface EventStore {
  /** Retorna true se o evento é novo (false = já recebido: entrega duplicada). */
  add(e: LeadEvent, now: number): Promise<boolean>
  claimDue(now: number, limit: number): Promise<EventRow[]>
  done(id: string, now: number): Promise<void>
  retry(id: string, runAfter: number, error: string): Promise<void>
  fail(id: string, error: string, now: number): Promise<void>
  /** Volta o evento à fila sem contar tentativa (conta bloqueada/limite). */
  defer(id: string, runAfter: number): Promise<void>
  counts(): Promise<{ pending: number; failed: number }>
}

export class MemoryEventStore implements EventStore {
  rows = new Map<string, EventRow>()
  async add(e: LeadEvent, now: number) {
    if (this.rows.has(e.leadgenId)) return false
    this.rows.set(e.leadgenId, { ...e, status: 'pending', attempts: 0, runAfter: now }); return true
  }
  async claimDue(now: number, limit: number) {
    const due = [...this.rows.values()].filter(r => r.status === 'pending' && r.runAfter <= now).slice(0, limit)
    for (const r of due) r.attempts++
    return due.map(r => ({ ...r }))
  }
  async done(id: string) { this.rows.get(id)!.status = 'done' }
  async retry(id: string, runAfter: number, error: string) { const r = this.rows.get(id)!; r.runAfter = runAfter; r.error = error }
  async fail(id: string, error: string) { const r = this.rows.get(id)!; r.status = 'failed'; r.error = error }
  async defer(id: string, runAfter: number) { const r = this.rows.get(id)!; r.attempts = Math.max(0, r.attempts - 1); r.runAfter = runAfter }
  async counts() { const v = [...this.rows.values()]; return { pending: v.filter(r => r.status === 'pending').length, failed: v.filter(r => r.status === 'failed').length } }
}

export interface ProcessDeps {
  store: EventStore
  now: () => number
  maxAttempts: number
  retryBaseSec: number
  batch: number
  resolveClient: (pageId: string, adId: string) => Promise<string | null>
  /** Busca o lead na Meta. blocked = gate/limite/cooldown: não conta tentativa. */
  fetchLead: (leadgenId: string, clientId: string) => Promise<{ ok: boolean; data?: unknown; blocked?: string; error?: string }>
  saveLead: (clientId: string, leadgenId: string, adId: string, data: unknown) => Promise<boolean>
  onFailed?: (id: string, error: string) => Promise<void> | void
}

export interface ProcessReport { processed: number; saved: number; deferred: number; failed: number }

export async function processEvents(d: ProcessDeps): Promise<ProcessReport> {
  const rep: ProcessReport = { processed: 0, saved: 0, deferred: 0, failed: 0 }
  const rows = await d.store.claimDue(d.now(), d.batch)
  for (const e of rows) {
    rep.processed++
    const giveUp = async (error: string) => {
      if (e.attempts >= d.maxAttempts) { await d.store.fail(e.leadgenId, error, d.now()); rep.failed++; await d.onFailed?.(e.leadgenId, error) }
      else await d.store.retry(e.leadgenId, d.now() + d.retryBaseSec * 1000 * 2 ** (e.attempts - 1), error)
    }
    try {
      const clientId = await d.resolveClient(e.pageId, e.adId)
      if (!clientId) { await giveUp('cliente não identificado'); continue }
      const r = await d.fetchLead(e.leadgenId, clientId)
      if (r.blocked) { await d.store.defer(e.leadgenId, d.now() + d.retryBaseSec * 1000); rep.deferred++; continue }
      if (!r.ok) { await giveUp(r.error ?? 'falha ao buscar o lead'); continue }
      if (await d.saveLead(clientId, e.leadgenId, e.adId, r.data)) rep.saved++
      await d.store.done(e.leadgenId, d.now())
    } catch (err) {
      await giveUp(err instanceof Error ? err.message.slice(0, 200) : 'erro')
    }
  }
  return rep
}
