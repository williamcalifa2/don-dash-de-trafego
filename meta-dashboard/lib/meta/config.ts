/**
 * Configuração central da integração com a Meta.
 * Todo valor (TTL, limiar, teto, janela, concorrência) vem de variável de ambiente,
 * com um padrão conservador. Nenhum número fixo fora deste arquivo.
 */

type Env = Record<string, string | undefined>

const num = (env: Env, key: string, def: number, min = 0): number => {
  const raw = env[key]
  if (raw === undefined || raw.trim() === '') return def
  const n = Number(raw)
  return Number.isFinite(n) && n >= min ? n : def
}

/** Booleano. Sem valor, vale o padrão (que é sempre o lado seguro). */
const bool = (env: Env, key: string, def: boolean): boolean => {
  const raw = env[key]?.trim().toLowerCase()
  if (raw === undefined || raw === '') return def
  if (['1', 'true', 'yes', 'sim', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'nao', 'não', 'off'].includes(raw)) return false
  return def
}

const list = (env: Env, key: string, def: string[]): string[] => {
  const raw = env[key]
  if (raw === undefined) return def
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export interface MetaConfig {
  // API
  apiVersion: string
  /** Data (ISO) em que a versão da API deixa de funcionar; vazio = desconhecida. */
  apiDeprecationDate: string | null
  apiDeprecationWarnDays: number
  graphBaseUrl: string

  // Piloto automático: conduz sozinho as fases 0 -> 3 e o corte final, com os mesmos critérios de segurança.
  // Ligado, ele manda em dryRun/phase/legacyLive (as variáveis META_DRY_RUN/META_SYNC_PHASE/META_LEGACY_LIVE viram só o ponto de partida seguro).
  autopilot: boolean
  /** Horas de observação limpa em cada etapa antes de avançar. */
  autopilotStageHours: number
  autopilotCheckMin: number
  /** Uso máximo (%) tolerado na observação para avançar. */
  advancePeakPct: number
  /** Conta suspensa volta sozinha (em observação) após N horas; 0 = só liberação manual. */
  suspendAutoReleaseHours: number

  // Modos e chaves de segurança
  /** Registra o que seria chamado, sem chamar. Padrão: ligado (falha segura). */
  dryRun: boolean
  /** Permite chamadas vindas do caminho antigo (disparadas pelo painel). Desligar = corte final. */
  legacyLive: boolean
  /** Fase de rollout: 0 dry-run geral, 1 uma conta, 2 poucas contas, 3 todas. */
  phase: number
  phaseMaxAccounts: Record<number, number>

  // HTTP
  timeoutMs: number
  netRetries: number
  backoffBaseMs: number
  backoffMaxMs: number
  retryStatuses: number[]
  pageSize: number
  maxPagesPerJob: number
  batchMax: number

  // Limites da Meta
  rateLimitCodes: number[]
  usageThresholdPct: number
  appUsageThresholdPct: number
  blockMarginSec: number
  blockWindowHours: number
  blockMaxPerWindow: number
  blockRepeatMultiplier: number
  blockMaxWaitSec: number
  /** Espera quando a Meta não informa o tempo estimado de liberação. */
  blockDefaultWaitSec: number
  freqMultiplierMax: number
  killSwitchMinutes: number
  resumeStepSec: number

  // Tetos absolutos
  maxCallsPerAccountHour: number
  maxCallsPerAppHour: number

  // Orçamento interno (fração conservadora da quota estimada)
  internalBudgetPct: number
  budgetBase: number
  budgetPerActiveAd: number

  // TTLs (minutos)
  ttlInsightsMin: number
  ttlStructureMin: number
  ttlLeadsReconcileMin: number
  /** Público (plataforma, idade, gênero, hora, região): muda devagar, atualiza raramente. */
  ttlAudienceMin: number
  insightsWindowDays: number
  fullHistoryDays: number

  // Orquestração
  workerGlobalConcurrency: number
  jobMaxAttempts: number
  jobStaggerMaxSec: number
  cronLockSec: number
  manualRefreshCooldownSec: number
  /** Validade dos dados orgânicos (Página e Instagram) e quantas contas atualizar por ciclo do cron. */
  /** Hora do Brasil em que o orgânico de todos os clientes é atualizado, uma vez por dia (dados do dia anterior). */
  organicHourBr: number
  organicPerCycle: number
  /** Por quanto tempo o caminho antigo (painel ao vivo) reaproveita a mesma resposta da Meta. 0 = desliga. */
  legacyCacheSec: number
  offHoursIntervalMultiplier: number
  businessHoursStart: number
  businessHoursEnd: number
  businessTimezone: string
  idleAccountCheckHours: number
  jobRetryBaseSec: number
  jobRetryMaxSec: number
  /** Depois de quantos minutos um job que morreu (esgotou tentativas) volta sozinho para a fila. */
  deadRetryMin: number
  jobLeaseSec: number
  /** Tempo máximo de uma execução do worker (a função serverless tem 60 s). */
  workerBudgetSec: number
  /** Teto de jobs novos por ciclo de cron: evita rajada depois de pane, deploy ou atraso. */
  maxEnqueuePerCycle: number
  /** Períodos "frios" (14/30 dias) atualizam menos: TTL × este fator. */
  coldPresetTtlMult: number
  leadsOverlapMin: number

  // Escopos do token
  writeScopes: string[]
  acceptedWriteScopes: string[]

  // Observabilidade
  usageRetentionDays: number
  /** 0 = nunca apaga leads (padrão). >0 apaga leads mais antigos que N dias (dado pessoal, LGPD). */
  leadsRetentionDays: number
  alertWebhookUrl: string | null
  budgetAlertPct: number
  alertDedupeMin: number
  tokenExpiryAlertDays: number
  /** Idade máxima da última validação do token para o pipeline poder chamar. */
  tokenCheckMaxAgeHours: number
}

export function readMetaConfig(env: Env = process.env): MetaConfig {
  const version = (env.META_API_VERSION ?? 'v20.0').trim()
  return {
    autopilot: bool(env, 'META_AUTOPILOT', true),
    autopilotStageHours: num(env, 'META_AUTOPILOT_STAGE_HOURS', 48, 0.1),
    autopilotCheckMin: num(env, 'META_AUTOPILOT_CHECK_MIN', 60, 1),
    advancePeakPct: num(env, 'META_ADVANCE_PEAK_PCT', 30, 1),
    suspendAutoReleaseHours: num(env, 'META_SUSPEND_AUTO_RELEASE_HOURS', 24),
    apiVersion: /^v\d+\.\d+$/.test(version) ? version : 'v20.0',
    apiDeprecationDate: env.META_API_DEPRECATION_DATE?.trim() || null,
    apiDeprecationWarnDays: num(env, 'META_API_DEPRECATION_WARN_DAYS', 60),
    graphBaseUrl: (env.META_GRAPH_URL ?? 'https://graph.facebook.com').replace(/\/+$/, ''),

    dryRun: bool(env, 'META_DRY_RUN', true),
    legacyLive: bool(env, 'META_LEGACY_LIVE', true),
    phase: Math.floor(num(env, 'META_SYNC_PHASE', 0)),
    phaseMaxAccounts: {
      0: 0,
      1: Math.floor(num(env, 'META_PHASE1_MAX_ACCOUNTS', 1)),
      2: Math.floor(num(env, 'META_PHASE2_MAX_ACCOUNTS', 5)),
      3: Math.floor(num(env, 'META_PHASE3_MAX_ACCOUNTS', 10_000)),
    },

    timeoutMs: num(env, 'META_HTTP_TIMEOUT_MS', 15_000, 1000),
    netRetries: Math.min(2, Math.floor(num(env, 'META_NET_RETRIES', 2))),
    backoffBaseMs: num(env, 'META_BACKOFF_BASE_MS', 500, 1),
    backoffMaxMs: num(env, 'META_BACKOFF_MAX_MS', 8_000, 1),
    retryStatuses: list(env, 'META_RETRY_STATUSES', ['502', '503', '504']).map(Number).filter(Number.isFinite),
    pageSize: Math.floor(num(env, 'META_PAGE_SIZE', 100, 1)),
    maxPagesPerJob: Math.floor(num(env, 'META_MAX_PAGES_PER_JOB', 8, 1)),
    batchMax: Math.min(50, Math.floor(num(env, 'META_BATCH_MAX', 25, 1))),

    rateLimitCodes: list(env, 'META_RATE_LIMIT_CODES', ['4', '17', '613', '80000', '80004', '80005']).map(Number).filter(Number.isFinite),
    usageThresholdPct: num(env, 'META_USAGE_THRESHOLD_PCT', 60),
    appUsageThresholdPct: num(env, 'META_APP_USAGE_THRESHOLD_PCT', 60),
    blockMarginSec: num(env, 'META_BLOCK_MARGIN_SEC', 120),
    blockWindowHours: num(env, 'META_BLOCK_WINDOW_HOURS', 24),
    blockMaxPerWindow: Math.floor(num(env, 'META_BLOCK_MAX_PER_WINDOW', 3, 1)),
    blockRepeatMultiplier: num(env, 'META_BLOCK_REPEAT_MULTIPLIER', 2, 1),
    blockMaxWaitSec: num(env, 'META_BLOCK_MAX_WAIT_SEC', 6 * 3600),
    blockDefaultWaitSec: num(env, 'META_BLOCK_DEFAULT_WAIT_SEC', 900),
    freqMultiplierMax: num(env, 'META_FREQ_MULTIPLIER_MAX', 8, 1),
    killSwitchMinutes: num(env, 'META_KILL_SWITCH_MINUTES', 30),
    resumeStepSec: num(env, 'META_RESUME_STEP_SEC', 120),

    maxCallsPerAccountHour: Math.floor(num(env, 'META_MAX_CALLS_PER_ACCOUNT_HOUR', 60, 1)),
    maxCallsPerAppHour: Math.floor(num(env, 'META_MAX_CALLS_PER_APP_HOUR', 450, 1)),

    internalBudgetPct: num(env, 'META_INTERNAL_BUDGET_PCT', 40),
    // Valores provisórios e conservadores. Confirmar na documentação atual da Meta;
    // a fonte de verdade em produção são os headers de uso.
    budgetBase: num(env, 'META_BUDGET_BASE', 300),
    budgetPerActiveAd: num(env, 'META_BUDGET_PER_ACTIVE_AD', 40),

    ttlInsightsMin: num(env, 'META_TTL_INSIGHTS_MIN', 45, 1),
    ttlStructureMin: num(env, 'META_TTL_STRUCTURE_MIN', 8 * 60, 1),
    ttlLeadsReconcileMin: num(env, 'META_TTL_LEADS_RECONCILE_MIN', 20, 1),
    ttlAudienceMin: num(env, 'META_TTL_AUDIENCE_MIN', 180, 1),
    insightsWindowDays: Math.floor(num(env, 'META_INSIGHTS_WINDOW_DAYS', 3, 1)),
    fullHistoryDays: Math.floor(num(env, 'META_FULL_HISTORY_DAYS', 60, 1)),

    workerGlobalConcurrency: Math.floor(num(env, 'META_WORKER_CONCURRENCY', 2, 1)),
    jobMaxAttempts: Math.floor(num(env, 'META_JOB_MAX_ATTEMPTS', 3, 1)),
    jobStaggerMaxSec: num(env, 'META_JOB_STAGGER_MAX_SEC', 240),
    cronLockSec: num(env, 'META_CRON_LOCK_SEC', 240, 1),
    manualRefreshCooldownSec: num(env, 'META_MANUAL_REFRESH_COOLDOWN_SEC', 600),
    legacyCacheSec: num(env, 'META_LEGACY_CACHE_SEC', 240),
    organicHourBr: Math.min(23, Math.max(0, Math.floor(num(env, 'META_ORGANIC_HOUR', 4)))),
    organicPerCycle: Math.floor(num(env, 'META_ORGANIC_PER_CYCLE', 1, 1)),
    offHoursIntervalMultiplier: num(env, 'META_OFF_HOURS_INTERVAL_MULTIPLIER', 4, 1),
    businessHoursStart: num(env, 'META_BUSINESS_HOURS_START', 7),
    businessHoursEnd: num(env, 'META_BUSINESS_HOURS_END', 22),
    businessTimezone: env.META_BUSINESS_TIMEZONE?.trim() || 'America/Sao_Paulo',
    jobRetryBaseSec: num(env, 'META_JOB_RETRY_BASE_SEC', 300),
    jobRetryMaxSec: num(env, 'META_JOB_RETRY_MAX_SEC', 3600),
    deadRetryMin: num(env, 'META_DEAD_RETRY_MIN', 30, 5),
    jobLeaseSec: num(env, 'META_JOB_LEASE_SEC', 120),
    workerBudgetSec: num(env, 'META_WORKER_BUDGET_SEC', 30),
    maxEnqueuePerCycle: Math.floor(num(env, 'META_MAX_ENQUEUE_PER_CYCLE', 10)),
    coldPresetTtlMult: num(env, 'META_COLD_PRESET_TTL_MULT', 4, 1),
    leadsOverlapMin: num(env, 'META_LEADS_OVERLAP_MIN', 10),
    idleAccountCheckHours: num(env, 'META_IDLE_ACCOUNT_CHECK_HOURS', 24, 1),

    writeScopes: list(env, 'META_WRITE_SCOPES', [
      'ads_management', 'business_management', 'pages_manage_ads', 'pages_manage_metadata',
      'pages_manage_posts', 'pages_manage_engagement', 'manage_pages', 'publish_pages',
    ]),
    acceptedWriteScopes: list(env, 'META_ACCEPTED_WRITE_SCOPES', []),

    usageRetentionDays: num(env, 'META_USAGE_RETENTION_DAYS', 30, 1),
    leadsRetentionDays: Math.floor(num(env, 'META_LEADS_RETENTION_DAYS', 0)),
    alertWebhookUrl: env.ALERT_WEBHOOK_URL?.trim() || null,
    budgetAlertPct: num(env, 'META_BUDGET_ALERT_PCT', 50),
    alertDedupeMin: num(env, 'META_ALERT_DEDUPE_MIN', 60),
    tokenExpiryAlertDays: num(env, 'META_TOKEN_EXPIRY_ALERT_DAYS', 10),
    tokenCheckMaxAgeHours: num(env, 'META_TOKEN_CHECK_MAX_AGE_HOURS', 36, 1),
  }
}

let base: MetaConfig | null = null
let merged: MetaConfig | null = null
let override: { dryRun: boolean; phase: number; legacyLive: boolean } | null = null

/** Config das variáveis de ambiente, sem o piloto automático. */
export function baseMetaConfig(): MetaConfig { return (base ??= readMetaConfig()) }

/** Modo decidido pelo piloto automático (guardado no banco). null = usar só as variáveis de ambiente. */
export function setRuntimeOverride(o: { dryRun: boolean; phase: number; legacyLive: boolean } | null) {
  override = o; merged = null
}

/** Config do processo, já com o modo do piloto automático. Os testes usam readMetaConfig(env) direto. */
export function metaConfig(): MetaConfig {
  const b = baseMetaConfig()
  if (!b.autopilot || !override) return b
  return (merged ??= { ...b, ...override })
}
export function resetMetaConfigForTests() { base = null; merged = null; override = null }
