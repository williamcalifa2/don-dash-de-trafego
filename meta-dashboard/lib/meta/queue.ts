/**
 * Fila de jobs de sincronização (Postgres em produção, memória nos testes).
 *  - deduplicação: no máximo 1 job pendente por conta + tipo, e nenhum novo se o mesmo tipo já está rodando;
 *  - no máximo 1 job rodando por conta; concorrência global baixa;
 *  - lease (locked_until): job de worker que morreu volta para a fila;
 *  - tentativas limitadas; esgotadas vão para a dead-letter ("dead") e NUNCA são reprocessadas automaticamente.
 */
export type JobKind = 'insights' | 'structure' | 'leads'
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead'

export interface Job {
  id: string
  clientId: string
  kind: JobKind
  status: JobStatus
  attempts: number
  runAfter: number
  lockedUntil: number | null
  error?: string | null
  /** quando terminou (ou morreu) */
  finishedAt?: number | null
}

export interface JobStore {
  enqueue(clientId: string, kind: JobKind, runAfter: number, now: number): Promise<'created' | 'exists'>
  /** Reserva o próximo job vencido, respeitando 1 por conta e a concorrência global. */
  claim(now: number, leaseMs: number, maxRunning: number): Promise<Job | null>
  complete(id: string, now: number): Promise<void>
  /** Devolve à fila sem contar tentativa (conta bloqueada, teto, kill switch...). */
  defer(id: string, runAfter: number): Promise<void>
  /** Falha: se `retryAt` for null vai para a dead-letter. */
  fail(id: string, error: string, retryAt: number | null, now: number): Promise<void>
  /** Jobs "running" com lease vencido: voltam para pendente (ou dead, se sem tentativas). */
  reapExpired(now: number, maxAttempts: number): Promise<number>
  counts(): Promise<Record<JobStatus, number>>
  listDead(limit: number): Promise<Job[]>
  /** Único caminho para reprocessar um job morto: ação manual do admin. */
  requeueDead(id: string, now: number): Promise<boolean>
  /** Descarta um job morto (o tipo volta a poder ser enfileirado). Ação manual. */
  dismissDead(id: string): Promise<boolean>
  /** Limpeza de jobs antigos (LGPD/higiene). */
  purge(olderThanMs: number): Promise<void>
}

export class MemoryJobStore implements JobStore {
  jobs: Job[] = []
  private seq = 0
  async enqueue(clientId: string, kind: JobKind, runAfter: number, _now?: number) {
    if (this.jobs.some(j => j.clientId === clientId && j.kind === kind && (j.status === 'pending' || j.status === 'running' || j.status === 'dead'))) return 'exists' as const
    this.jobs.push({ id: `j${++this.seq}`, clientId, kind, status: 'pending', attempts: 0, runAfter, lockedUntil: null })
    return 'created' as const
  }
  async claim(now: number, leaseMs: number, maxRunning: number) {
    const running = this.jobs.filter(j => j.status === 'running' && (j.lockedUntil ?? 0) > now)
    if (running.length >= maxRunning) return null
    const busy = new Set(running.map(j => j.clientId))
    const next = this.jobs.filter(j => j.status === 'pending' && j.runAfter <= now && !busy.has(j.clientId)).sort((a, b) => a.runAfter - b.runAfter)[0]
    if (!next) return null
    next.status = 'running'; next.attempts++; next.lockedUntil = now + leaseMs
    return { ...next }
  }
  private get(id: string) { const j = this.jobs.find(x => x.id === id); if (!j) throw new Error('job inexistente'); return j }
  async complete(id: string, _now?: number) { const j = this.get(id); j.status = 'done'; j.lockedUntil = null }
  async defer(id: string, runAfter: number) { const j = this.get(id); j.status = 'pending'; j.attempts = Math.max(0, j.attempts - 1); j.runAfter = runAfter; j.lockedUntil = null }
  async fail(id: string, error: string, retryAt: number | null, _now?: number) {
    const j = this.get(id); j.error = error; j.lockedUntil = null
    if (retryAt == null) { j.status = 'dead'; j.finishedAt = _now ?? Date.now() } else { j.status = 'pending'; j.runAfter = retryAt }
  }
  async reapExpired(now: number, maxAttempts: number) {
    let n = 0
    for (const j of this.jobs) if (j.status === 'running' && (j.lockedUntil ?? 0) <= now) {
      j.lockedUntil = null; j.error = 'lease expirado'
      if (j.attempts >= maxAttempts) j.status = 'dead'; else { j.status = 'pending'; j.runAfter = now }
      n++
    }
    return n
  }
  async counts() {
    const c: Record<JobStatus, number> = { pending: 0, running: 0, done: 0, failed: 0, dead: 0 }
    for (const j of this.jobs) c[j.status]++
    return c
  }
  async listDead(limit: number) { return this.jobs.filter(j => j.status === 'dead').slice(0, limit).map(j => ({ ...j })) }
  async requeueDead(id: string, now: number) {
    const j = this.jobs.find(x => x.id === id && x.status === 'dead')
    if (!j) return false
    if (this.jobs.some(x => x !== j && x.clientId === j.clientId && x.kind === j.kind && (x.status === 'pending' || x.status === 'running'))) return false
    j.status = 'pending'; j.attempts = 0; j.runAfter = now; return true
  }
  async dismissDead(id: string) { const j = this.jobs.find(x => x.id === id && x.status === 'dead'); if (!j) return false; j.status = 'failed'; return true }
  async purge(olderThanMs: number) { this.jobs = this.jobs.filter(j => !(j.status === 'done' && (j.runAfter < olderThanMs))) }
}
