/**
 * Orquestração. O cron só ENFILEIRA; o worker processa a fila devagar.
 *  - trava contra ciclos sobrepostos;
 *  - só enfileira o que passou do TTL (a maioria dos ciclos de 10 min não gera nenhuma chamada);
 *  - escalonamento aleatório entre contas; teto de jobs novos por ciclo (proteção contra rajada após pane/deploy);
 *  - frequência adaptativa (fora do horário comercial, conta perto do limiar, conta sem anúncios ativos, reincidência de bloqueio);
 *  - fases de rollout limitam quantas contas rodam de verdade.
 */
import type { MetaConfig } from './config'
import type { LimitController, LimitStore, AccountState } from './limits'
import type { Job, JobKind, JobStore } from './queue'
import type { Account, CollectDeps, CollectOutcome } from './collectors'
import { COLLECTORS } from './collectors'
import { inBusinessHours } from './time'
import { AUTOPILOT_KEY, evaluateAutopilot, initialAutopilot, runtimeFor, type AutopilotState } from './autopilot'
import { setRuntimeOverride } from './config'
import { tokenBlocksPipeline, unacceptedNow, TOKEN_KEY, type TokenReport } from './tokenCheck'

const MIN = 60_000
const HOUR = 60 * MIN
export const KINDS: JobKind[] = ['insights', 'structure', 'leads']

export interface OrchDeps {
  cfg: MetaConfig
  now: () => number
  random: () => number
  jobs: JobStore
  state: LimitStore
  limits: LimitController
  accounts: () => Promise<Account[]>
  collect: CollectDeps
  /** roda a validação do token (debug_token) e grava o resultado */
  checkToken: () => Promise<TokenReport>
  /** impressão digital do token em uso agora; se mudar, o token é revalidado na hora (troca de token sem esperar 24 h) */
  tokenFingerprint?: () => string | undefined
  /** executa o coletor; injetável para testes */
  collectors?: Record<JobKind, (d: CollectDeps, acc: Account) => Promise<CollectOutcome>>
  /** uso interno: evento do piloto automático neste ciclo */
  event?: string
}

export { inBusinessHours }

const baseTtlMin = (cfg: MetaConfig, kind: JobKind) => kind === 'insights' ? cfg.ttlInsightsMin : kind === 'structure' ? cfg.ttlStructureMin : cfg.ttlLeadsReconcileMin

/** Intervalo efetivo entre coletas de um tipo para uma conta, já com todos os ajustes de frequência. */
export function effectiveIntervalMs(cfg: MetaConfig, kind: JobKind, st: AccountState, nowMs: number): number {
  if (st.activeAds === 0) return cfg.idleAccountCheckHours * HOUR // sem anúncios ativos: 1 checagem por dia
  let mult = Math.max(1, st.freqMultiplier)
  if (!inBusinessHours(cfg, nowMs)) mult *= cfg.offHoursIntervalMultiplier
  if (st.lastUsage && st.lastUsage.accountMaxPct >= cfg.usageThresholdPct * 0.75) mult *= 2 // perto do limiar: espaça
  return baseTtlMin(cfg, kind) * MIN * mult
}

export function isDue(cfg: MetaConfig, kind: JobKind, st: AccountState, nowMs: number): boolean {
  const last = st.lastSynced[`${cfg.dryRun ? 'dry_' : ''}${kind}`]
  return last === undefined || nowMs - last >= effectiveIntervalMs(cfg, kind, st, nowMs)
}

export function configWarnings(cfg: MetaConfig, cronIntervalMin: number): string[] {
  const w: string[] = []
  const smallest = Math.min(cfg.ttlInsightsMin, cfg.ttlStructureMin, cfg.ttlLeadsReconcileMin)
  if (smallest < cronIntervalMin) w.push(`O menor TTL (${smallest} min) é menor que o intervalo do cron (${cronIntervalMin} min): o TTL não pode ser respeitado.`)
  if (cfg.usageThresholdPct > 80) w.push('Limiar de uso da conta acima de 80%: pouco conservador.')
  if (cfg.dryRun === false && cfg.phase === 0) w.push('DRY_RUN desligado com fase 0: nada deve rodar de verdade na fase 0.')
  return w
}

export interface CycleReport {
  skipped?: string
  enqueued: number
  processed: number
  outcomes: Array<{ kind: JobKind; clientId: string; status: string; reason?: string }>
  dead: number
  warnings: string[]
  /** contas que o pipeline controla de verdade neste ciclo (o cron antigo de leads pula essas) */
  owned: string[]
  autopilot?: { phase: number; cutover: boolean; event?: string }
}

async function eligibleAccounts(d: OrchDeps): Promise<Array<{ acc: Account; st: AccountState }>> {
  const all = await d.accounts()
  const withState = await Promise.all(all.map(async acc => ({ acc, st: await d.state.getState(acc.clientId) })))
  const usable = withState.filter(x => !x.st.paused && !x.st.suspended && !(x.st.blockedUntil && x.st.blockedUntil > d.now()))
  if (d.cfg.dryRun) return usable // DRY_RUN: simula todas as contas para prever o volume
  // Sem chave por conta: toda conta com anúncios entra sozinha, na ordem estável, até o limite da fase.
  const ordered = [...usable].sort((a, b) => a.acc.clientId.localeCompare(b.acc.clientId))
  const max = d.cfg.phase === 0 ? 0 : (d.cfg.phaseMaxAccounts[d.cfg.phase] ?? 0)
  return ordered.slice(0, max)
}

/** Só decide e enfileira. Não chama a Meta (exceto a validação diária do token, feita antes em runCycle). */
export async function enqueueDue(d: OrchDeps): Promise<number> {
  const now = d.now()
  const items = await eligibleAccounts(d)
  // Justiça: a conta mais atrasada primeiro (evita que as mesmas contas fiquem sempre na frente).
  const oldest = (st: AccountState) => Math.min(...KINDS.map(k => st.lastSynced[`${d.cfg.dryRun ? 'dry_' : ''}${k}`] ?? 0))
  items.sort((a, b) => oldest(a.st) - oldest(b.st))
  let created = 0
  for (const { acc, st } of items) {
    for (const kind of KINDS) {
      if (created >= d.cfg.maxEnqueuePerCycle) return created
      if (!isDue(d.cfg, kind, st, now)) continue
      const runAfter = now + Math.floor(d.random() * d.cfg.jobStaggerMaxSec * 1000)
      if ((await d.jobs.enqueue(acc.clientId, kind, runAfter, now)) === 'created') created++
    }
  }
  return created
}

function retryDelayMs(cfg: MetaConfig, attempts: number, random: () => number): number {
  const base = Math.min(cfg.jobRetryMaxSec, cfg.jobRetryBaseSec * 2 ** Math.max(0, attempts - 1))
  return Math.round(base * 1000 * (0.5 + random() * 0.5))
}

async function deferUntil(d: OrchDeps, job: Job, reason: string, hint?: number): Promise<number> {
  const now = d.now()
  let until = hint ?? 0
  if (reason === 'account_blocked') until = Math.max(until, (await d.state.getState(job.clientId)).blockedUntil ?? 0)
  if (reason === 'kill_switch') until = Math.max(until, (await d.state.getSetting<{ until: number }>('kill'))?.until ?? 0)
  // Piso: nunca reentra "imediatamente" (sem recuperação em rajada); jitter para não alinhar contas.
  const floor = now + d.cfg.resumeStepSec * 1000 + Math.floor(d.random() * d.cfg.jobStaggerMaxSec * 1000)
  return Math.max(until, floor)
}

/**
 * Um job que esgotou as tentativas (por exemplo, permissão da Meta negada por um tempo) trava aquele tipo de coleta da conta e deixa o alerta vermelho.
 * Depois de um tempo ele volta sozinho para a fila; se ainda falhar, morre de novo e espera outro ciclo. Nada de insistir em rajada.
 */
export async function retryStaleDead(d: OrchDeps): Promise<number> {
  const now = d.now(), stale = d.cfg.deadRetryMin * 60_000
  let n = 0
  for (const j of await d.jobs.listDead(50)) {
    if (now - (j.finishedAt ?? j.runAfter) < stale) continue
    if (await d.jobs.requeueDead(j.id, now)) n++
  }
  return n
}

/** Processa a fila dentro do orçamento de tempo. Falhou o bastante: dead-letter + alerta; nunca reprocessa sozinho. */
export async function workQueue(d: OrchDeps, report: CycleReport, startedAt: number): Promise<void> {
  const deadline = startedAt + d.cfg.workerBudgetSec * 1000
  const collectors = d.collectors ?? COLLECTORS
  await d.jobs.reapExpired(d.now(), d.cfg.jobMaxAttempts)
  await retryStaleDead(d)

  while (d.now() < deadline) {
    const job = await d.jobs.claim(d.now(), d.cfg.jobLeaseSec * 1000, d.cfg.workerGlobalConcurrency)
    if (!job) break
    const acc = (await d.accounts()).find(a => a.clientId === job.clientId)
    let outcome: CollectOutcome
    try {
      outcome = acc ? await collectors[job.kind](d.collect, acc) : { status: 'failed', error: 'conta não encontrada', calls: 0 }
    } catch (e) {
      outcome = { status: 'failed', error: e instanceof Error ? e.message : 'erro', calls: 0 }
    }
    report.processed++
    report.outcomes.push({ kind: job.kind, clientId: job.clientId, status: outcome.status, reason: outcome.status === 'deferred' ? outcome.reason : outcome.status === 'failed' ? outcome.error : undefined })

    if (outcome.status === 'done' || outcome.status === 'dry') { await d.jobs.complete(job.id, d.now()); continue }
    if (outcome.status === 'deferred') { await d.jobs.defer(job.id, await deferUntil(d, job, outcome.reason, outcome.runAfter)); continue }

    // Falha real: conta a tentativa. Esgotou => dead-letter.
    const error = outcome.error.slice(0, 300)
    if (job.attempts >= d.cfg.jobMaxAttempts) {
      await d.jobs.fail(job.id, error, null, d.now())
      report.dead++
      await d.limits.raise({ level: 'critical', kind: 'dead_letter', clientId: job.clientId, message: `Job ${job.kind} foi para a dead-letter após ${job.attempts} tentativas: ${error}` })
    } else {
      await d.jobs.fail(job.id, error, d.now() + retryDelayMs(d.cfg, job.attempts, d.random), d.now())
    }
    await d.state.patchState(job.clientId, { lastError: error })
  }
}

/** Conta suspensa volta sozinha, "em observação" (frequência mínima e histórico de bloqueio mantido), depois de N horas. */
export async function autoReleaseSuspended(d: OrchDeps): Promise<string[]> {
  const hours = d.cfg.suspendAutoReleaseHours
  if (hours <= 0) return []
  const released: string[] = []
  for (const acc of await d.accounts()) {
    const st = await d.state.getState(acc.clientId)
    if (!st.suspended) continue
    const lastBlock = Math.max(0, ...st.blockEvents)
    if (d.now() - lastBlock < hours * 3_600_000) continue
    // Mantém só o último bloqueio no histórico: se a Meta bloquear de novo, a espera dobra e a suspensão volta mais rápido.
    await d.state.patchState(acc.clientId, { suspended: false, blockedUntil: null, blockEvents: [lastBlock], lastError: null })
    await d.limits.raise({ level: 'info', kind: 'account_auto_released', clientId: acc.clientId, message: `Conta voltou sozinha após ${hours} h suspensa, em observação (frequência reduzida).` })
    released.push(acc.clientId)
  }
  return released
}

/** Decide sozinho o modo (fase, simulação, corte). Roda no máximo a cada `autopilotCheckMin` minutos. */
export async function runAutopilot(d: OrchDeps, tokenOk: boolean): Promise<CycleReport['autopilot'] | undefined> {
  if (!d.cfg.autopilot) return undefined
  const now = d.now()
  const saved = (await d.state.getSetting<AutopilotState>(AUTOPILOT_KEY)) ?? initialAutopilot(now)
  let st = saved

  if (now - saved.lastEval >= d.cfg.autopilotCheckMin * 60_000) {
    const [obs, kill, accounts] = await Promise.all([d.state.usageSummary(saved.since), d.state.getSetting<{ until: number }>('kill'), d.accounts()])
    const states = await Promise.all(accounts.map(async a => ({ a, st: await d.state.getState(a.clientId) })))
    const fresh = await Promise.all(states.filter(x => !x.st.paused && !x.st.suspended).map(async x => {
      const s = await d.collect.snaps.get(x.a.clientId, 'summary', 'last_7d')
      return !!s && now - s.fetchedAt <= d.cfg.ttlInsightsMin * 60_000 * 3 * Math.max(1, x.st.freqMultiplier)
    }))
    const r = evaluateAutopilot(saved, { hasData: obs.calls + obs.dryRunCalls > 0, rateLimitErrors: obs.rateLimitErrors, peakAccountPct: obs.peakAccountPct, peakAppPct: obs.peakAppPct },
      { tokenOk, killActive: !!kill && kill.until > now, suspendedCount: states.filter(x => x.st.suspended).length, allFresh: fresh.length > 0 && fresh.every(Boolean) }, d.cfg, now)
    st = r.state
    if (r.event) {
      const e = r.event
      const text = e.kind === 'advance' ? `Piloto automático avançou da fase ${e.from} para a ${e.to} (${e.reason}).`
        : e.kind === 'regress' ? `Piloto automático recuou da fase ${e.from} para a ${e.to}: ${e.reason}.`
        : e.kind === 'cutover' ? `Piloto automático concluiu o corte: o painel agora lê só do banco (${e.reason}).`
        : `Piloto automático desfez o corte (painel voltou ao modo ao vivo): ${e.reason}.`
      await d.limits.raise({ level: e.kind === 'regress' || e.kind === 'rollback_cutover' ? 'warning' : 'info', kind: `autopilot_${e.kind}`, message: text })
    }
    await d.state.setSetting(AUTOPILOT_KEY, st)
    d.event = r.event?.kind
  }

  // Aplica o modo a este processo já neste ciclo.
  const rt = runtimeFor(st)
  setRuntimeOverride(rt)
  d.cfg = { ...d.cfg, ...rt }
  d.collect.cfg = d.cfg
  return { phase: st.phase, cutover: st.cutover, event: d.event }
}

/** Um ciclo completo, chamado pelo cron externo. Seguro contra sobreposição, reinício e atraso. */
export async function runCycle(d: OrchDeps, owner: string): Promise<CycleReport> {
  const report: CycleReport = { enqueued: 0, processed: 0, outcomes: [], dead: 0, warnings: configWarnings(d.cfg, 10), owned: [] }
  const startedAt = d.now()

  if (!(await d.state.tryLock('cron', d.cfg.cronLockSec * 1000, owner))) return { ...report, skipped: 'ciclo anterior ainda em execução' }
  try {
    await autoReleaseSuspended(d)

    // O piloto automático avalia mesmo com o sistema pausado (kill switch conta como problema e faz recuar a etapa).
    let tok = await d.state.getSetting<TokenReport>(TOKEN_KEY)
    const tokenOk = () => !!tok && tok.valid && unacceptedNow(tok, d.cfg).length === 0
    report.autopilot = await runAutopilot(d, tokenOk())

    // Token trocado: revalida já. Pausa por token inválido: revalida a cada 5 min e retoma sozinha quando o token voltar a valer
    // (nada de depender de alguém liberar à mão).
    const fp = d.tokenFingerprint?.()
    let pause = await d.state.getSetting<{ paused?: boolean; reason?: string }>('system_paused')
    // Revalida na hora se: o token foi trocado (ou o registro é antigo e não tem impressão digital); ou o último resultado foi "inválido"
    // e já faz 5 min (assim uma troca de token, mesmo sem pausa, não espera as 24 h).
    if (tok && fp && tok.fp !== fp) tok = await d.checkToken()
    else if (tok && !tok.valid && d.now() - tok.at >= 5 * MIN) tok = await d.checkToken()
    if (pause?.paused && pause.reason === 'token_invalid' && tok?.valid && unacceptedNow(tok, d.cfg).length === 0) {
      await d.limits.resumeSystem()
      await d.limits.raise({ level: 'info', kind: 'token_recovered', message: 'O token da Meta voltou a valer. As sincronizações foram retomadas sozinhas.' })
      pause = null
    }
    if (pause?.paused) return { ...report, skipped: 'sistema pausado' }
    const kill = await d.state.getSetting<{ until: number }>('kill')
    if (kill && d.now() < kill.until) return { ...report, skipped: 'kill switch ativo' }

    // Token validado (no máximo 1 chamada por dia). Sem token válido e sem escopo de escrita não aceito, nada roda.
    if (!tok || d.now() - tok.at > 24 * HOUR) tok = await d.checkToken()
    // Em DRY_RUN nada sai para a Meta, então o estado do token não trava a previsão (o alerta continua).
    const why = d.cfg.dryRun ? null : tokenBlocksPipeline(tok, d.cfg, d.now())
    if (why) return { ...report, skipped: `token: ${why}` }

    await workQueue(d, report, startedAt)
    report.enqueued = await enqueueDue(d)
    if (!d.cfg.dryRun) report.owned = (await eligibleAccounts(d)).map(x => x.acc.clientId)
    return report
  } finally {
    await d.state.unlock('cron', owner)
  }
}
