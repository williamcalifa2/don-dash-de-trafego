/**
 * Controle de limites: decide, ANTES de cada chamada, se ela pode sair (gate) e, DEPOIS, o que a resposta significa (onResult).
 *
 * - circuit breaker por conta (blocked_until), com escalonamento em 24 h e suspensão após bloqueios repetidos;
 * - kill switch global (erro de app-level ou uso do app acima do limiar), com retomada gradual, uma conta por vez;
 * - tetos por hora por conta e por app, e orçamento interno (fração da quota estimada pelo nº de anúncios ativos);
 * - pausa geral e por conta, e flag "enabled" por conta, sem deploy;
 * - alertas (registro em meta_alerts + webhook).
 *
 * Tudo depende de um LimitStore (Postgres em produção, memória nos testes). Se o estado não puder ser lido, a resposta é NÃO chamar.
 * Melhor esforço entre instâncias serverless: as leituras/escritas não são atômicas; por isso os limiares são conservadores.
 */
import type { MetaConfig } from './config'
import type { GateDecision, MetaCallContext, MetaResult, UsageEntry } from './client'
import { TOKEN_KEY, tokenBlocksPipeline, type TokenReport } from './tokenCheck'

export interface AccountState {
  enabled: boolean
  paused: boolean
  suspended: boolean
  blockedUntil: number | null
  blockEvents: number[]
  freqMultiplier: number
  activeAds: number | null
  lastUsage: { maxPct: number; appMaxPct: number; accountMaxPct: number; regainMinutes: number; at: number } | null
  lastError: string | null
  /** kind -> ms da última sincronização bem-sucedida (ou 'dry_<kind>' em DRY_RUN) */
  lastSynced: Record<string, number>
  /** retomada de paginação entre ciclos */
  cursors: Record<string, string>
}

export interface UsageSummary { calls: number; rateLimitErrors: number; peakAccountPct: number; peakAppPct: number; dryRunCalls: number }

export const defaultAccountState = (): AccountState => ({
  enabled: false, paused: false, suspended: false, blockedUntil: null, blockEvents: [],
  freqMultiplier: 1, activeAds: null, lastUsage: null, lastError: null, lastSynced: {}, cursors: {},
})

export interface AlertInput { level: 'info' | 'warning' | 'critical'; kind: string; clientId?: string | null; message: string; data?: Record<string, unknown> }

export interface LimitStore {
  getState(clientId: string): Promise<AccountState>
  patchState(clientId: string, patch: Partial<AccountState>): Promise<void>
  getSetting<T>(key: string): Promise<T | null>
  setSetting(key: string, value: unknown): Promise<void>
  /** Soma de chamadas reais (não conta dry_run nem bloqueadas) desde o instante, no app todo ou por conta. */
  callsSince(sinceMs: number, clientId?: string): Promise<number>
  insertUsage(entry: UsageEntry): Promise<void>
  insertAlert(a: AlertInput): Promise<void>
  alertSince(kind: string, clientId: string | null, sinceMs: number): Promise<boolean>
  /** Resumo do uso real (não conta dry_run) e da previsão (dry_run) desde o instante, para o gate das fases do rollout. */
  usageSummary(sinceMs: number): Promise<UsageSummary>
  recentAlerts(limit: number): Promise<Array<{ level: string; kind: string; clientId: string | null; message: string; at: number }>>
  /** Chamadas por hora previstas/feitas por conta, para o painel de administração. */
  callsByClient(sinceMs: number, dryRun: boolean): Promise<Record<string, number>>
  /** Remove dados antigos (uso e alertas). */
  purgeOld(usageBeforeMs: number, alertsBeforeMs: number): Promise<void>
  /** Trava contra ciclos de cron sobrepostos. Retorna false se outra execução ainda a detém. */
  tryLock(key: string, ttlMs: number, owner: string): Promise<boolean>
  unlock(key: string, owner: string): Promise<void>
}

/** As tabelas ainda não foram criadas (SQL não rodou). O caminho antigo continua; o novo pipeline não. */
export class StoreNotMigrated extends Error {
  constructor() { super('Tabelas de sincronização não existem (rode supabase/2026-09-meta-sync.sql)'); this.name = 'StoreNotMigrated' }
}

export interface KillState { until: number; since: number; reason: string }
export interface PauseState { paused: boolean; reason: string; at: number }
interface ResumeState { admitted: Record<string, number>; lastAdmitAt: number }

export interface LimitDeps {
  store: LimitStore
  config: () => MetaConfig
  now?: () => number
  /** envio externo do alerta (webhook). Erros aqui nunca afetam o fluxo. */
  notify?: (a: AlertInput) => Promise<void> | void
}

const HOUR = 3_600_000

/** Quota estimada por hora e teto efetivo: o menor entre o teto absoluto e o orçamento interno. */
export function accountHourlyCap(cfg: MetaConfig, activeAds: number | null): number {
  const estimatedQuota = cfg.budgetBase + cfg.budgetPerActiveAd * (activeAds ?? 0)
  const budget = Math.floor(estimatedQuota * (cfg.internalBudgetPct / 100))
  return Math.max(1, Math.min(cfg.maxCallsPerAccountHour, budget))
}

export function createLimitController(deps: LimitDeps) {
  const { store, config } = deps
  const now = deps.now ?? Date.now

  async function raise(a: AlertInput) {
    const cfg = config()
    try {
      // Mesmo alerta (tipo + conta) não repete dentro da janela.
      if (await store.alertSince(a.kind, a.clientId ?? null, now() - cfg.alertDedupeMin * 60_000)) return
      await store.insertAlert(a)
    } catch { /* falha ao registrar não pode derrubar o controle */ }
    try { await deps.notify?.(a) } catch { /* idem */ }
  }

  async function activateKill(reason: string) {
    const cfg = config(); const t = now()
    const cur = await store.getSetting<KillState>('kill')
    const until = Math.max(cur?.until ?? 0, t + cfg.killSwitchMinutes * 60_000)
    await store.setSetting('kill', { until, since: cur && cur.until > t ? cur.since : t, reason } satisfies KillState)
    await store.setSetting('resume', { admitted: {}, lastAdmitAt: 0 } satisfies ResumeState)
    await raise({ level: 'critical', kind: 'kill_switch', message: `Kill switch ativado: todas as chamadas à Meta pausadas por ${cfg.killSwitchMinutes} min (${reason}).`, data: { until, reason } })
  }

  /** Erros código 4 recentes (de qualquer conta), para separar um tropeço isolado de um limite de verdade do app. */
  async function noteAppError(t: number): Promise<number> {
    const cfg = config()
    const cur = (await store.getSetting<{ at: number[] }>('app_errors'))?.at ?? []
    const keep = [...cur.filter(x => t - x < cfg.appErrorWindowMin * 60_000), t].slice(-20)
    await store.setSetting('app_errors', { at: keep })
    return keep.length
  }

  /** Espera curta só desta conta: não conta como bloqueio (não dobra espera, não suspende, não reduz frequência). */
  async function softBlockAccount(clientId: string, minutes: number, reason: string, data: Record<string, unknown>) {
    const t = now()
    const st = await store.getState(clientId)
    if (st.blockedUntil && st.blockedUntil > t) return
    await store.patchState(clientId, { blockedUntil: t + minutes * 60_000, lastError: reason.slice(0, 300) })
    await raise({ level: 'warning', kind: 'account_blocked', clientId, message: `Conta em espera por ${minutes} min (${reason}).`, data })
  }

  async function blockAccount(clientId: string, regainMinutes: number, reason: string) {
    const cfg = config(); const t = now()
    const st = await store.getState(clientId)
    // Mesmo episódio de bloqueio (chamadas em voo terminando juntas): não conta como novo evento.
    if (st.blockedUntil && st.blockedUntil > t) return
    const events = st.blockEvents.filter(e => t - e < cfg.blockWindowHours * HOUR)
    const n = events.length
    const baseSec = regainMinutes > 0 ? regainMinutes * 60 : cfg.blockDefaultWaitSec
    const waitSec = Math.min(cfg.blockMaxWaitSec, (baseSec + cfg.blockMarginSec) * cfg.blockRepeatMultiplier ** n)
    events.push(t)
    const suspended = events.length >= cfg.blockMaxPerWindow
    await store.patchState(clientId, {
      blockedUntil: t + waitSec * 1000,
      blockEvents: events,
      freqMultiplier: n >= 1 ? Math.min(cfg.freqMultiplierMax, st.freqMultiplier * 2) : st.freqMultiplier,
      suspended: st.suspended || suspended,
      lastError: reason,
    })
    await raise({ level: 'warning', kind: 'account_blocked', clientId, message: `Conta bloqueada por ${Math.round(waitSec / 60)} min (${reason}).`, data: { waitSec, events: events.length } })
    if (n >= 1) await raise({ level: 'warning', kind: 'block_recurrence', clientId, message: `Bloqueio repetido (${events.length} nas últimas ${cfg.blockWindowHours} h): espera dobrada e frequência reduzida.` })
    if (suspended) await raise({ level: 'critical', kind: 'account_suspended', clientId, message: `Conta suspensa após ${events.length} bloqueios em ${cfg.blockWindowHours} h. Só volta com liberação manual.` })
  }

  async function gateInner(ctx: MetaCallContext, req: { calls: number }): Promise<GateDecision> {
    const cfg = config(); const t = now()
    const deny = (reason: string): GateDecision => ({ allow: false, reason })

    const paused = await store.getSetting<PauseState>('system_paused')
    // A validação do token (essential) passa mesmo com o sistema pausado: é ela que decide se dá para retomar.
    if (paused?.paused && !ctx.essential) return deny('system_paused')

    const kill = await store.getSetting<KillState>('kill')
    if (kill && t < kill.until) return deny('kill_switch')

    // O pipeline só roda com o token validado (sem escopo de escrita não aceito). A própria validação está isenta.
    if (ctx.origin === 'pipeline' && !ctx.essential && !cfg.dryRun) {
      const why = tokenBlocksPipeline(await store.getSetting<TokenReport>(TOKEN_KEY), cfg, t)
      if (why) return deny(why)
    }

    // Tetos duros protegem o pipeline novo. O painel antigo (legacy) continua contado, mas protegido pelo breaker, pelo uso
    // lido dos headers e pelo kill switch: barrar o painel do cliente por um teto pensado para o worker seria uma regressão.
    const capped = ctx.origin === 'pipeline' && !ctx.essential // a validação do token nunca fica presa no teto por hora
    if (capped && (await store.callsSince(t - HOUR)) + req.calls > cfg.maxCallsPerAppHour) return deny('cap_app_hour')

    let st: AccountState | null = null
    if (ctx.clientId) {
      st = await store.getState(ctx.clientId)
      if (st.suspended) return deny('account_suspended')
      if (st.paused) return deny('account_paused')
      if (st.blockedUntil && t < st.blockedUntil) return deny('account_blocked')
      const cap = accountHourlyCap(cfg, st.activeAds)
      if (capped && (await store.callsSince(t - HOUR, ctx.clientId)) + req.calls > cap) return deny('cap_account_hour')
    }

    // Retomada gradual depois de um kill switch: uma conta nova por vez, com intervalo.
    if (kill && t >= kill.until && t < kill.until + 30 * cfg.resumeStepSec * 1000) {
      const key = ctx.clientId ?? 'global'
      const rs = (await store.getSetting<ResumeState>('resume')) ?? { admitted: {}, lastAdmitAt: 0 }
      if (!(key in rs.admitted)) {
        if (t - rs.lastAdmitAt < cfg.resumeStepSec * 1000) return deny('resuming')
        rs.admitted[key] = t; rs.lastAdmitAt = t
        await store.setSetting('resume', rs)
      }
    }
    return { allow: true }
  }

  return {
    async gate(ctx: MetaCallContext, req: { kind: string; path: string; calls: number }): Promise<GateDecision> {
      try {
        return await gateInner(ctx, req)
      } catch (e) {
        // Tabelas ausentes: o painel antigo segue funcionando (protegido pelo resfriamento em memória); o pipeline novo não roda.
        if (e instanceof StoreNotMigrated) return ctx.origin === 'legacy' ? { allow: true } : { allow: false, reason: 'store_not_migrated' }
        throw e // qualquer outra falha: o cliente central trata como "não chamar"
      }
    },

    async onResult(ctx: MetaCallContext, result: MetaResult, meta: { path: string; calls: number }): Promise<void> {
      const cfg = config(); const t = now()
      try {
        const u = result.usage
        if (u && ctx.clientId) {
          await store.patchState(ctx.clientId, { lastUsage: { maxPct: u.maxPct, appMaxPct: u.appMaxPct, accountMaxPct: u.accountMaxPct, regainMinutes: u.regainMinutes, at: t } })
        }

        const err = result.error
        const appPct = u?.appMaxPct ?? 0
        // O que a Meta disse, guardado no alerta: sem isso não dá para saber qual limite foi (código, subcódigo e mensagem).
        const detail = err ? { code: err.code ?? null, subcode: err.subcode ?? null, message: err.message.slice(0, 300), type: err.type ?? null, path: meta.path, appPct, accountPct: u?.accountMaxPct ?? 0 } : {}
        const why = err ? `código ${err.code ?? 'HTTP ' + err.status}${err.subcode ? `/${err.subcode}` : ''}: ${err.message.slice(0, 160)}` : ''
        if (err?.kind === 'rate_limit' && err.code === 4) {
          // Código 4 isolado, com o app longe do limite: só esta conta espera. Uso alto do app ou vários erros seguidos (qualquer conta): sistema todo.
          const repeats = await noteAppError(t)
          const global = appPct >= cfg.appErrorGlobalPct || repeats >= cfg.appErrorRepeat || !ctx.clientId
          if (global) { await activateKill(`erro de limite do app (${why}; uso do app ${appPct}%; ${repeats} erro(s) na última hora)`); return }
          await softBlockAccount(ctx.clientId!, cfg.softBlockMin, `limite do app, ${why}`, detail)
          return
        }
        if (appPct >= cfg.appUsageThresholdPct) {
          await activateKill(`uso do app em ${appPct}%`)
          return
        }

        if (err?.kind === 'token') {
          await store.setSetting('system_paused', { paused: true, reason: 'token_invalid', at: t } satisfies PauseState)
          await raise({ level: 'critical', kind: 'token_failure', message: `Token da Meta inválido, expirado ou revogado (código ${err.code ?? '?'}). Todas as chamadas foram pausadas; gere um token novo e retome.` })
          return
        }

        const limited = err?.kind === 'rate_limit' || (u?.accountMaxPct ?? 0) >= cfg.usageThresholdPct
        if (limited) {
          if (ctx.clientId) await blockAccount(ctx.clientId, u?.regainMinutes ?? 0, err?.kind === 'rate_limit' ? `limite da Meta (${why})` : `uso em ${u?.accountMaxPct}% (limiar ${cfg.usageThresholdPct}%)`)
          else await activateKill('limite da Meta sem conta identificada')
          return
        }

        if (err?.kind === 'permission' && ctx.clientId) {
          await store.patchState(ctx.clientId, { lastError: `permissão: ${err.message}`.slice(0, 300) })
          await raise({ level: 'warning', kind: 'permission_error', clientId: ctx.clientId, message: `A Meta negou permissão em ${meta.path}.` })
        }

        if (ctx.clientId && result.ok && ctx.origin === 'pipeline') {
          const st = await store.getState(ctx.clientId)
          const cap = accountHourlyCap(cfg, st.activeAds)
          const used = await store.callsSince(t - HOUR, ctx.clientId)
          if (used >= cap * (cfg.budgetAlertPct / 100)) {
            await raise({ level: 'warning', kind: 'budget_usage', clientId: ctx.clientId, message: `Conta usou ${used} de ${cap} chamadas/h do orçamento interno (${Math.round((used / cap) * 100)}%).` })
          }
        }
      } catch { /* o controle nunca derruba a resposta já obtida; o próximo gate relê o estado */ }
    },

    async record(entry: UsageEntry): Promise<void> { await store.insertUsage(entry) },

    // Controles manuais (painel admin / sem deploy)
    async pauseSystem(reason = 'manual') { await store.setSetting('system_paused', { paused: true, reason, at: now() } satisfies PauseState) },
    async resumeSystem() { await store.setSetting('system_paused', { paused: false, reason: '', at: now() } satisfies PauseState) },
    async triggerKill(reason: string) { await activateKill(reason) },
    async clearKill() { await store.setSetting('kill', { until: 0, since: 0, reason: 'liberado manualmente' } satisfies KillState) },
    async releaseAccount(clientId: string) { await store.patchState(clientId, { blockedUntil: null, blockEvents: [], suspended: false, freqMultiplier: 1, lastError: null }) },
    async setAccountFlags(clientId: string, f: Partial<Pick<AccountState, 'enabled' | 'paused'>>) { await store.patchState(clientId, f) },
    raise,
    activateKill,
    blockAccount,
  }
}

export type LimitController = ReturnType<typeof createLimitController>
