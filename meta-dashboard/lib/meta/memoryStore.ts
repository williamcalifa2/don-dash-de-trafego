import { defaultAccountState, type AccountState, type AlertInput, type LimitStore, type UsageSummary } from './limits'
import type { UsageEntry } from './client'

/** Armazenamento em memória: usado nos testes e como referência do contrato do LimitStore. */
export class MemoryLimitStore implements LimitStore {
  states = new Map<string, AccountState>()
  settings = new Map<string, unknown>()
  usage: UsageEntry[] = []
  alerts: Array<AlertInput & { at: number }> = []
  constructor(private now: () => number = Date.now) {}

  async getState(id: string) { return { ...defaultAccountState(), ...(this.states.get(id) ?? {}) } }
  async patchState(id: string, patch: Partial<AccountState>) { this.states.set(id, { ...(await this.getState(id)), ...patch }) }
  async getSetting<T>(key: string) { return (this.settings.get(key) as T | undefined) ?? null }
  async setSetting(key: string, value: unknown) { this.settings.set(key, structuredClone(value)) }
  async callsSince(since: number, clientId?: string) {
    return this.usage
      .filter(u => u.at >= since && !u.dryRun && !u.outcome.startsWith('blocked') && (!clientId || u.clientId === clientId))
      .reduce((n, u) => n + u.calls, 0)
  }
  async insertUsage(e: UsageEntry) { this.usage.push(e) }
  async insertAlert(a: AlertInput) { this.alerts.push({ ...a, at: this.now() }) }
  async usageSummary(since: number): Promise<UsageSummary> {
    const rows = this.usage.filter(u => u.at >= since)
    const real = rows.filter(u => !u.dryRun && !u.outcome.startsWith('blocked'))
    return {
      calls: real.reduce((n, u) => n + u.calls, 0),
      rateLimitErrors: real.filter(u => u.outcome === 'rate_limit').length,
      peakAccountPct: Math.max(0, ...real.map(u => u.usage?.accountMaxPct ?? 0)),
      peakAppPct: Math.max(0, ...real.map(u => u.usage?.appMaxPct ?? 0)),
      dryRunCalls: rows.filter(u => u.dryRun).reduce((n, u) => n + u.calls, 0),
    }
  }
  async recentAlerts(limit: number) { return [...this.alerts].reverse().slice(0, limit).map(a => ({ level: a.level, kind: a.kind, clientId: a.clientId ?? null, message: a.message, at: a.at })) }
  async callsByClient(since: number, dryRun: boolean) {
    const out: Record<string, number> = {}
    for (const u of this.usage) if (u.at >= since && !!u.dryRun === dryRun && !u.outcome.startsWith('blocked') && u.clientId) out[u.clientId] = (out[u.clientId] ?? 0) + u.calls
    return out
  }
  async purgeOld(usageBefore: number, alertsBefore: number) {
    this.usage = this.usage.filter(u => u.at >= usageBefore)
    this.alerts = this.alerts.filter(a => a.at >= alertsBefore)
  }
  async tryLock(key: string, ttlMs: number, owner: string) {
    const cur = this.settings.get(`lock:${key}`) as { until: number; owner: string } | undefined
    if (cur && cur.until > this.now() && cur.owner !== owner) return false
    this.settings.set(`lock:${key}`, { until: this.now() + ttlMs, owner })
    return true
  }
  async unlock(key: string, owner: string) {
    const cur = this.settings.get(`lock:${key}`) as { owner: string } | undefined
    if (cur?.owner === owner) this.settings.delete(`lock:${key}`)
  }
  async alertSince(kind: string, clientId: string | null, since: number) {
    return this.alerts.some(a => a.kind === kind && (a.clientId ?? null) === clientId && a.at >= since)
  }
}
