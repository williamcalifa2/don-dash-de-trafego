import { describe, expect, it } from 'vitest'
import { assertReadOnly, MetaPolicyError, parseRequest } from '@/lib/meta/allowlist'

const cfg = { pageSize: 100 }
const ok = (p: string) => parseRequest(p, cfg)
const blocked = (p: string, reason?: string) => {
  try { parseRequest(p, cfg) } catch (e) {
    expect(e).toBeInstanceOf(MetaPolicyError)
    if (reason) expect((e as MetaPolicyError).reason).toBe(reason)
    return
  }
  throw new Error(`deveria bloquear: ${p}`)
}

describe('allowlist de endpoints', () => {
  it('permite insights no nível da conta com paginação e cursor', () => {
    const r = ok('act_1234567/insights?fields=spend,impressions,actions&level=ad&date_preset=last_7d&time_increment=1&limit=100&after=QVFIUn9')
    expect(r.kind).toBe('account_edge')
    expect(r.query.level).toBe('ad')
  })

  it('permite estrutura, leads e páginas promovíveis', () => {
    ok('act_1234567/campaigns?fields=id,name,effective_status,updated_time&limit=50')
    ok('act_1234567/ads?fields=id,name,creative{thumbnail_url,effective_object_story_id}')
    ok('act_1234567/promote_pages?fields=id,name')
    ok('1234567890/leadgen_forms?fields=id,name')
    ok('1234567890/leads?fields=id,created_time,field_data,ad_id&limit=100&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":1700000000}]')
    ok('debug_token?input_token=ABCDEFGHIJKLMNOP')
    ok('me/adaccounts?fields=account_id,name&limit=100')
  })

  it('aceita a borda aninhada de insights por campanha', () => {
    ok('act_1234567/campaigns?fields=id,name,insights.date_preset(last_7d){spend,impressions,actions}&limit=50')
  })

  it.each([
    ['act_1234567/adcreatives', 'endpoint_not_allowed'],
    ['1234567890/subscribed_apps', 'endpoint_not_allowed'],
    ['me/permissions', 'endpoint_not_allowed'],
    ['act_1234567/adaccounts', 'endpoint_not_allowed'],
    ['act_1234567/campaigns/', 'endpoint_not_allowed'],
    ['1234567890/feed', 'endpoint_not_allowed'],
    ['oauth/access_token?client_id=1', 'endpoint_not_allowed'],
    ['act_1234567/customaudiences', 'endpoint_not_allowed'],
  ])('bloqueia endpoint fora da lista: %s', (p, reason) => blocked(p, reason))

  it.each([
    'https://graph.facebook.com/v20.0/act_1234567/insights',
    '//evil.com/act_1234567/insights',
    'act_1234567/../me/accounts',
    'act_1234567/insights%2f..',
    'act_1234567/insights\\x',
    '',
  ])('bloqueia caminho perigoso: %s', p => blocked(p))

  it('não aceita o token na URL', () => blocked('act_1234567/insights?fields=spend&access_token=EAAB1234', 'token_in_query'))

  it('bloqueia campo fora da lista e campo access_token fora do objeto da página', () => {
    blocked('act_1234567/insights?fields=spend,billing_event', 'field_not_allowed')
    blocked('act_1234567/campaigns?fields=id,access_token', 'field_not_allowed')
    blocked('1234567890/leads?fields=access_token', 'field_not_allowed')
    ok('1234567890?fields=access_token') // leitura do token da página (necessária para ler leads)
  })

  it('bloqueia parâmetros e valores inválidos', () => {
    blocked('act_1234567/insights?fields=spend&action_breakdowns=action_type', 'param_not_allowed')
    blocked('act_1234567/insights?fields=spend&limit=101', 'value_invalid')
    blocked('act_1234567/insights?fields=spend&limit=0', 'value_invalid')
    blocked('act_1234567/insights?fields=spend&date_preset=lifetime', 'value_invalid')
    blocked('act_1234567/insights?fields=spend&level=creative', 'value_invalid')
    blocked('act_1234567/insights?fields=spend&time_increment=2', 'value_invalid')
    blocked('act_1234567/insights?fields=spend&filtering=[{"field":"spend","operator":"GREATER_THAN","value":1}]', 'value_invalid')
    blocked('act_1234567/insights?fields=spend&limit=10&limit=20', 'param_duplicated')
    blocked('act_1234567/insights?fields=spend,actions{', 'fields_invalid')
  })

  it('respeita o tamanho de página configurado', () => {
    expect(() => parseRequest('act_1234567/ads?fields=id&limit=60', { pageSize: 50 })).toThrow(MetaPolicyError)
    expect(parseRequest('act_1234567/ads?fields=id&limit=50', { pageSize: 50 }).query.limit).toBe('50')
  })
})

describe('somente leitura', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('bloqueia %s fora do batch', m => {
    expect(() => assertReadOnly(m, false)).toThrow(MetaPolicyError)
  })
  it('permite GET', () => expect(() => assertReadOnly('GET', false)).not.toThrow())
  it('permite POST só no batch e só com sub-requisições GET', () => {
    expect(() => assertReadOnly('POST', true, [{ method: 'GET' }, {}])).not.toThrow()
    expect(() => assertReadOnly('POST', true, [{ method: 'GET' }, { method: 'POST' }])).toThrow(MetaPolicyError)
    expect(() => assertReadOnly('POST', true, [{ method: 'DELETE' }])).toThrow(MetaPolicyError)
    expect(() => assertReadOnly('POST', true, [])).toThrow(MetaPolicyError)
    expect(() => assertReadOnly('POST', false, [{ method: 'GET' }])).toThrow(MetaPolicyError)
  })
})

describe('recortes de público (breakdowns)', () => {
  it('permite os recortes de público e posicionamento, até 2 juntos', () => {
    for (const b of ['publisher_platform', 'device_platform', 'region', 'hourly_stats_aggregated_by_advertiser_time_zone', 'age,gender', 'publisher_platform,platform_position'])
      expect(() => parseRequest(`act_1234567/insights?fields=spend,impressions,reach&breakdowns=${b}&date_preset=last_7d&limit=100`, cfg)).not.toThrow()
  })
  it('bloqueia recorte fora da lista, repetido ou com mais de 2', () => {
    for (const b of ['ad_id', 'dma', 'age,gender,region', 'age,age', '', 'age;drop'])
      expect(() => parseRequest(`act_1234567/insights?fields=spend&breakdowns=${b}&date_preset=last_7d`, cfg), b).toThrow(MetaPolicyError)
  })
})
