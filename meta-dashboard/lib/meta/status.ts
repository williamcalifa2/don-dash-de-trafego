/** Estado agregado da integração: alimenta o endpoint de saúde e o painel de administração. Não chama a Meta. */
import type { MetaConfig } from './config'
import type { LimitStore, AccountState } from './limits'
import type { JobStore } from './queue'
import type { EventStore } from './webhook'
import type { Account } from './collectors'
import { AUTOPILOT_KEY, type AutopilotState } from './autopilot'
import { TOKEN_KEY, unacceptedNow, type TokenReport } from './tokenCheck'
import { configWarnings, KINDS } from './orchestrator'

const HOUR = 3_600_000

export interface CycleSummary { at: number; skipped?: string; enqueued: number; processed: number; dead: number }

export interface StatusDeps {
  cfg: MetaConfig
  now: () => number
  state: LimitStore
  jobs: JobStore
  events?: EventStore
  accounts: () => Promise<Account[]>
}

/** Janela de observação exibida no status. */
export const OBSERVATION_HOURS = 48

export async function buildStatus(d: StatusDeps) {
  const now = d.now()
  const [paused, kill, token, last, autopilot, accounts] = await Promise.all([
    d.state.getSetting<{ paused: boolean; reason: string; at: number }>('system_paused'),
    d.state.getSetting<{ until: number; reason: string }>('kill'),
    d.state.getSetting<TokenReport>(TOKEN_KEY),
    d.state.getSetting<CycleSummary>('last_cycle'),
    d.state.getSetting<AutopilotState>(AUTOPILOT_KEY),
    d.accounts(),
  ])
  const states = new Map<string, AccountState>(await Promise.all(accounts.map(async a => [a.clientId, await d.state.getState(a.clientId)] as const)))
  const [jobs, dead, usageObs, callsReal, callsDry, alerts, webhook] = await Promise.all([
    d.jobs.counts(), d.jobs.listDead(20),
    d.state.usageSummary(now - OBSERVATION_HOURS * HOUR),
    d.state.callsByClient(now - HOUR, false), d.state.callsByClient(now - 24 * HOUR, true),
    d.state.recentAlerts(15), d.events ? d.events.counts() : Promise.resolve(null),
  ])

  const rows = accounts.map(a => {
    const st = states.get(a.clientId)!
    const stale = Object.fromEntries(KINDS.map(k => [k, st.lastSynced[k] ?? null]))
    return {
      clientId: a.clientId, slug: a.slug, paused: st.paused, suspended: st.suspended,
      blockedUntil: st.blockedUntil && st.blockedUntil > now ? st.blockedUntil : null,
      freqMultiplier: st.freqMultiplier, activeAds: st.activeAds, lastSynced: stale, lastError: st.lastError,
      usagePct: st.lastUsage?.accountMaxPct ?? null, callsLastHour: callsReal[a.clientId] ?? 0, dryRunCallsPer24h: callsDry[a.clientId] ?? 0,
    }
  })
  // Sem nada observado ainda (nenhuma chamada real nem simulada), não há base para avançar.
  const hasData = usageObs.calls + usageObs.dryRunCalls > 0
  const readyToAdvance = hasData && usageObs.rateLimitErrors === 0 && usageObs.peakAccountPct < d.cfg.advancePeakPct && usageObs.peakAppPct < d.cfg.advancePeakPct

  return {
    at: now,
    mode: { dryRun: d.cfg.dryRun, phase: d.cfg.phase, legacyLive: d.cfg.legacyLive, apiVersion: d.cfg.apiVersion },
    system: { paused: !!paused?.paused, pauseReason: paused?.paused ? paused.reason : null, killUntil: kill && kill.until > now ? kill.until : null, killReason: kill && kill.until > now ? kill.reason : null },
    token: token ? { valid: token.valid, checkedAt: token.at, unaccepted: unacceptedNow(token, d.cfg), acceptedWrite: token.writeScopes.length - unacceptedNow(token, d.cfg).length, expiresAt: token.expiresAt, appId: token.appId, error: token.valid ? null : (token.error ?? null) } : null,
    lastCycle: last ?? null,
    autopilot: autopilot ? { ...autopilot, stageHours: d.cfg.autopilotStageHours } : null,
    accounts: { total: rows.length, blocked: rows.filter(r => r.blockedUntil).length, suspended: rows.filter(r => r.suspended).length, paused: rows.filter(r => r.paused).length, list: rows },
    jobs, deadLetter: dead.map(j => ({ id: j.id, clientId: j.clientId, kind: j.kind, attempts: j.attempts, error: j.error })),
    webhook,
    observation: { hours: OBSERVATION_HOURS, ...usageObs, hasData, readyToAdvance, criterion: `zero erros de limite e pico < ${d.cfg.advancePeakPct}%` },
    // Só avisos das últimas 24 h e que continuam valendo: aviso de token com escrita some depois que o escopo é aceito,
    // e o de token inválido some quando o token voltou a ser válido.
    alerts: alerts
      .filter(a => now - a.at < 24 * HOUR)
      .filter(a => !(a.kind === 'token_write_scope' && token && unacceptedNow(token, d.cfg).length === 0))
      .filter(a => !(a.kind === 'token_failure' && token?.valid))
      .filter(a => a.kind !== 'budget_usage')
      .map(a => ({ ...a })),
    warnings: configWarnings(d.cfg, 10),
  }
}

export type MetaStatus = Awaited<ReturnType<typeof buildStatus>>
