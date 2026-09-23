import type { MetaConfig } from './config'

/** Erro de política: a requisição jamais sai da aplicação. */
export class MetaPolicyError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message)
    this.name = 'MetaPolicyError'
  }
}

export type EndpointKind =
  | 'debug_token' | 'me_adaccounts' | 'me_accounts' | 'account' | 'account_edge' | 'object' | 'object_edge'

export interface AllowedRequest {
  /** caminho normalizado, sem barra inicial e sem query */
  path: string
  kind: EndpointKind
  query: Record<string, string>
}

const ID = '\\d{5,25}'
const ACT = `act_${ID}`

const ROUTES: Array<[RegExp, EndpointKind]> = [
  [/^debug_token$/, 'debug_token'],
  [/^me\/adaccounts$/, 'me_adaccounts'],
  [/^me\/accounts$/, 'me_accounts'],
  [new RegExp(`^${ACT}$`), 'account'],
  [new RegExp(`^${ACT}/(insights|campaigns|adsets|ads|promote_pages|customconversions)$`), 'account_edge'],
  [new RegExp(`^${ID}$`), 'object'],
  [new RegExp(`^${ID}/(leadgen_forms|leads|adsets|ads|insights|previews|media|published_posts|stories)$`), 'object_edge'],
  // Insights de um post da Página (id no formato paginaID_postID) ou de uma mídia do Instagram (só números)
  [new RegExp(`^${ID}_${ID}/insights$`), 'object_edge'],
]

const FIELD_NAMES = new Set([
  'id', 'name', 'currency', 'account_status', 'account_id', 'status', 'effective_status', 'configured_status',
  'daily_budget', 'lifetime_budget', 'updated_time', 'created_time', 'start_time', 'stop_time', 'objective',
  'spend', 'impressions', 'clicks', 'unique_clicks', 'ctr', 'cpm', 'cpc', 'frequency', 'reach',
  'actions', 'action_values', 'inline_post_engagement', 'cost_per_action_type', 'date_start', 'date_stop',
  'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name', 'form_id',
  'creative', 'thumbnail_url', 'image_url', 'video_id', 'thumbnails', 'uri', 'body', 'title', 'object_type',
  'effective_object_story_id', 'field_data', 'leads_count', 'questions', 'key', 'type', 'insights',
  'access_token', 'subscribed_fields',
  // Orgânico (Página do Facebook e Instagram): só leitura de perfil, publicações e contagens
  'username', 'followers_count', 'follows_count', 'media_count', 'profile_picture_url', 'media_type', 'media_product_type', 'media_url',
  'permalink', 'permalink_url', 'caption', 'message', 'timestamp', 'like_count', 'comments_count', 'full_picture', 'shares', 'status_type',
  'fan_count', 'picture', 'link', 'instagram_business_account', 'url', 'reactions', 'comments',
  'preview_shareable_link',
])
/** Só a leitura do token da página (necessário para ler leads) pode pedir esse campo, e só no objeto direto. */
const TOKEN_FIELD_ONLY_ON: EndpointKind = 'object'

/** Métricas de insights orgânicos (Página e Instagram). Só nomes em minúsculas e sublinhado, poucas por chamada. */
const METRIC_LIST = /^[a-z0-9_]{3,60}(,[a-z0-9_]{3,60}){0,11}$/
const PERIODS = new Set(['day', 'week', 'days_28', 'lifetime'])
const METRIC_TYPES = new Set(['total_value', 'time_series'])
const BREAKDOWN_ORGANIC = /^[a-z_]{3,40}(,[a-z_]{3,40}){0,1}$/
const DATE_OR_EPOCH = /^(\d{10}|\d{4}-\d{2}-\d{2})$/

const PRESETS = new Set(['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_28d', 'last_30d', 'this_month', 'last_month'])
const LEVELS = new Set(['account', 'campaign', 'adset', 'ad'])
const INCREMENTS = new Set(['1', '7', 'monthly', 'all_days'])
/** Recortes (breakdowns) de insights permitidos: público e posicionamento. Somente leitura. */
const BREAKDOWNS = new Set(['publisher_platform', 'platform_position', 'device_platform', 'impression_device', 'age', 'gender', 'region', 'country', 'hourly_stats_aggregated_by_advertiser_time_zone'])
const FILTER_FIELDS = new Set(['updated_time', 'time_created', 'created_time', 'effective_status'])
const FILTER_OPS = new Set(['GREATER_THAN', 'LESS_THAN', 'IN', 'EQUAL', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL'])
const STATUSES = new Set(['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED', 'IN_PROCESS', 'WITH_ISSUES', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO'])

const QUERY_KEYS: Record<EndpointKind, string[]> = {
  debug_token: ['input_token'],
  me_adaccounts: ['fields', 'limit', 'after'],
  me_accounts: ['fields', 'limit', 'after'],
  account: ['fields'],
  account_edge: ['fields', 'limit', 'after', 'date_preset', 'time_range', 'time_increment', 'level', 'filtering', 'effective_status', 'breakdowns'],
  object: ['fields'],
  object_edge: ['fields', 'limit', 'after', 'date_preset', 'time_range', 'time_increment', 'filtering', 'effective_status', 'ad_format', 'breakdowns', 'metric', 'period', 'since', 'until', 'metric_type', 'breakdown'],
}

function fail(reason: string, message: string): never {
  throw new MetaPolicyError(reason, message)
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '{' || ch === '(') depth++
    if (ch === '}' || ch === ')') depth--
    if (depth < 0) fail('fields_invalid', 'Campos com chaves desbalanceadas')
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  if (depth !== 0) fail('fields_invalid', 'Campos com chaves desbalanceadas')
  if (cur) parts.push(cur)
  return parts
}

/** Modificadores aceitos depois do nome do campo: .date_preset(x) .summary(true|total_count) .limit(n) .metric(a,b) */
const MODIFIER = /\.([a-z_]+)\(([^()]*)\)/y

function validateFields(fields: string, kind: EndpointKind, path: string): void {
  if (!fields || fields.length > 2000) fail('fields_invalid', 'Lista de campos vazia ou grande demais')
  for (const token of splitTopLevel(fields)) {
    const head = token.match(/^([a-z_]+)/)
    if (!head) fail('fields_invalid', `Campo fora do formato permitido: ${token.slice(0, 40)}`)
    const name = head[1]
    let i = name.length
    while (token[i] === '.') {
      MODIFIER.lastIndex = i
      const m = MODIFIER.exec(token)
      if (!m) fail('fields_invalid', `Campo fora do formato permitido: ${token.slice(0, 40)}`)
      const [whole, mod, arg] = m
      if (mod === 'date_preset') { if (!PRESETS.has(arg)) fail('value_invalid', `date_preset inválido: ${arg}`) }
      else if (mod === 'summary') { if (!/^(true|total_count)$/.test(arg)) fail('value_invalid', 'summary inválido') }
      else if (mod === 'limit') { if (!/^\d{1,3}$/.test(arg)) fail('value_invalid', 'limit inválido') }
      else if (mod === 'metric') { if (!METRIC_LIST.test(arg)) fail('value_invalid', 'metric inválido') }
      else fail('fields_invalid', `Modificador não permitido: ${mod}`)
      i += whole.length
    }
    let inner: string | undefined
    if (i < token.length) {
      if (token[i] !== '{' || !token.endsWith('}')) fail('fields_invalid', `Campo fora do formato permitido: ${token.slice(0, 40)}`)
      inner = token.slice(i + 1, -1)
    }
    if (!FIELD_NAMES.has(name)) fail('field_not_allowed', `Campo não permitido: ${name}`)
    if (name === 'access_token' && !(kind === TOKEN_FIELD_ONLY_ON && /^\d{5,25}$/.test(path))) fail('field_not_allowed', 'Campo access_token só é permitido na leitura do objeto da página')
    if (inner !== undefined) validateFields(inner, kind, path)
  }
}

function validateQuery(kind: EndpointKind, path: string, q: URLSearchParams, cfg: Pick<MetaConfig, 'pageSize'>): Record<string, string> {
  const out: Record<string, string> = {}
  const allowed = new Set(QUERY_KEYS[kind])
  for (const [k, v] of q) {
    if (k === 'access_token') fail('token_in_query', 'O token não pode ir na URL; o cliente o envia no cabeçalho')
    if (!allowed.has(k)) fail('param_not_allowed', `Parâmetro não permitido para este endpoint: ${k}`)
    if (k in out) fail('param_duplicated', `Parâmetro repetido: ${k}`)
    switch (k) {
      case 'fields': validateFields(v, kind, path); break
      case 'limit': { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > cfg.pageSize) fail('value_invalid', `limit deve ser entre 1 e ${cfg.pageSize}`); break }
      case 'after': if (!/^[A-Za-z0-9_=\-+/]{1,400}$/.test(v)) fail('value_invalid', 'Cursor inválido'); break
      case 'date_preset': if (!PRESETS.has(v)) fail('value_invalid', `date_preset inválido: ${v}`); break
      case 'time_increment': if (!INCREMENTS.has(v)) fail('value_invalid', `time_increment inválido: ${v}`); break
      case 'breakdowns': {
        const parts = v.split(',')
        if (parts.length < 1 || parts.length > 2 || new Set(parts).size !== parts.length || !parts.every(x => BREAKDOWNS.has(x))) fail('value_invalid', 'breakdowns inválido')
        break
      }
      case 'metric': if (!METRIC_LIST.test(v)) fail('value_invalid', 'metric inválido'); break
      case 'period': if (!PERIODS.has(v)) fail('value_invalid', 'period inválido'); break
      case 'metric_type': if (!METRIC_TYPES.has(v)) fail('value_invalid', 'metric_type inválido'); break
      case 'breakdown': if (!BREAKDOWN_ORGANIC.test(v)) fail('value_invalid', 'breakdown inválido'); break
      case 'since': case 'until': if (!DATE_OR_EPOCH.test(v)) fail('value_invalid', `${k} inválido`); break
      case 'level': if (!LEVELS.has(v)) fail('value_invalid', `level inválido: ${v}`); break
      case 'time_range': if (!/^\{"since":"\d{4}-\d{2}-\d{2}","until":"\d{4}-\d{2}-\d{2}"\}$/.test(v)) fail('value_invalid', 'time_range inválido'); break
      case 'ad_format': if (!/^[A-Z_]{3,40}$/.test(v)) fail('value_invalid', 'ad_format inválido'); break
      case 'input_token': if (!/^[A-Za-z0-9_\-|.]{10,600}$/.test(v)) fail('value_invalid', 'input_token inválido'); break
      case 'effective_status': {
        let arr: unknown
        try { arr = JSON.parse(v) } catch { fail('value_invalid', 'effective_status inválido') }
        if (!Array.isArray(arr) || arr.length > 12 || !arr.every(x => typeof x === 'string' && STATUSES.has(x))) fail('value_invalid', 'effective_status inválido')
        break
      }
      case 'filtering': {
        let arr: unknown
        try { arr = JSON.parse(v) } catch { fail('value_invalid', 'filtering inválido') }
        const ok = Array.isArray(arr) && arr.length >= 1 && arr.length <= 5 && arr.every(f =>
          f && typeof f === 'object' && FILTER_FIELDS.has((f as { field: string }).field) && FILTER_OPS.has((f as { operator: string }).operator) &&
          (typeof (f as { value: unknown }).value === 'number' || typeof (f as { value: unknown }).value === 'string' ||
            (Array.isArray((f as { value: unknown }).value) && ((f as { value: unknown[] }).value).length <= 50)))
        if (!ok) fail('value_invalid', 'filtering inválido')
        break
      }
    }
    out[k] = v
  }
  return out
}

/**
 * Valida um caminho (com ou sem query) contra a allowlist. Lança MetaPolicyError se algo estiver fora.
 * Aceita "act_123/insights?fields=..." ou "/act_123/insights?fields=...". Nunca aceita URL absoluta.
 */
export function parseRequest(pathWithQuery: string, cfg: Pick<MetaConfig, 'pageSize'>): AllowedRequest {
  if (typeof pathWithQuery !== 'string' || pathWithQuery.length === 0 || pathWithQuery.length > 4000) fail('path_invalid', 'Caminho vazio ou grande demais')
  if (/^[a-z]+:\/\//i.test(pathWithQuery) || pathWithQuery.startsWith('//')) fail('path_invalid', 'URL absoluta não é permitida')
  const qIdx = pathWithQuery.indexOf('?')
  const rawPath = (qIdx === -1 ? pathWithQuery : pathWithQuery.slice(0, qIdx)).replace(/^\/+/, '')
  const rawQuery = qIdx === -1 ? '' : pathWithQuery.slice(qIdx + 1)
  if (/[%\\]|\.\.|\/\/|\s/.test(rawPath)) fail('path_invalid', 'Caminho com caracteres não permitidos')

  const route = ROUTES.find(([re]) => re.test(rawPath))
  if (!route) fail('endpoint_not_allowed', `Endpoint fora da allowlist: ${rawPath.replace(/\d{5,}/g, '#')}`)
  const kind = route[1]
  return { path: rawPath, kind, query: validateQuery(kind, rawPath, new URLSearchParams(rawQuery), cfg) }
}

/** Método de escrita nunca sai. POST só para /batch e só com sub-requisições GET. */
export function assertReadOnly(method: string, isBatchRoot: boolean, batchItems?: Array<{ method?: string }>): void {
  const m = method.toUpperCase()
  if (m === 'GET') return
  if (m === 'POST' && isBatchRoot && Array.isArray(batchItems) && batchItems.length > 0 &&
    batchItems.every(i => (i.method ?? 'GET').toUpperCase() === 'GET')) return
  fail('method_not_allowed', `Método ${m} não é permitido: a integração é somente leitura`)
}

export const __test = { FIELD_NAMES, PRESETS }
