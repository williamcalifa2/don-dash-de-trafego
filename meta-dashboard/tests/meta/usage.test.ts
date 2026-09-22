import { describe, expect, it } from 'vitest'
import { classifyError, parseUsage } from '@/lib/meta/usage'
import { readMetaConfig } from '@/lib/meta/config'
import { redact, redactPii } from '@/lib/meta/redact'

const cfg = readMetaConfig({})
const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null

describe('headers de uso', () => {
  it('lê os três headers e calcula os máximos', () => {
    const u = parseUsage(headers({
      'x-app-usage': JSON.stringify({ call_count: 12, total_cputime: 30, total_time: 8 }),
      'x-business-use-case-usage': JSON.stringify({ '111': [{ type: 'ads_insights', call_count: 55, total_cputime: 20, total_time: 10, estimated_time_to_regain_access: 7 }] }),
      'x-ad-account-usage': JSON.stringify({ acc_id_util_pct: 71.5, reset_time_duration: 300, ads_api_access_tier: 'standard_access' }),
    }))
    expect(u.appMaxPct).toBe(30)
    expect(u.accountMaxPct).toBe(71.5)
    expect(u.maxPct).toBe(71.5)
    expect(u.regainMinutes).toBe(7)
    expect(u.adAccount?.tier).toBe('standard_access')
  })
  it('ausência ou lixo nos headers vira zero, sem quebrar', () => {
    expect(parseUsage(headers({})).maxPct).toBe(0)
    expect(parseUsage(headers({ 'x-app-usage': 'não é json', 'x-business-use-case-usage': '[]' })).maxPct).toBe(0)
  })
})

describe('classificação de erro', () => {
  it.each([4, 17, 613, 80000, 80004, 80005])('código %i é limite', code => {
    expect(classifyError(400, { error: { code, message: 'x' } }, cfg).kind).toBe('rate_limit')
  })
  it('HTTP 429 é limite', () => expect(classifyError(429, {}, cfg).kind).toBe('rate_limit'))
  it('190 e 463 são token; 10 e 200 são permissão', () => {
    expect(classifyError(400, { error: { code: 190 } }, cfg).kind).toBe('token')
    expect(classifyError(400, { error: { code: 463 } }, cfg).kind).toBe('token')
    expect(classifyError(400, { error: { code: 10 } }, cfg).kind).toBe('permission')
    expect(classifyError(403, { error: { code: 200 } }, cfg).kind).toBe('permission')
  })
  it('5xx listado e código 2 são transitórios; 400 comum é erro do cliente', () => {
    expect(classifyError(503, {}, cfg).kind).toBe('transient')
    expect(classifyError(500, { error: { code: 2 } }, cfg).kind).toBe('transient')
    expect(classifyError(400, { error: { code: 100 } }, cfg).kind).toBe('client')
  })
  it('a lista de códigos de limite vem da configuração', () => {
    const c = readMetaConfig({ META_RATE_LIMIT_CODES: '4,999' })
    expect(classifyError(400, { error: { code: 999 } }, c).kind).toBe('rate_limit')
    expect(classifyError(400, { error: { code: 613 } }, c).kind).not.toBe('rate_limit')
  })
  it('a mensagem de erro sai sem segredos', () => {
    const e = classifyError(400, { error: { code: 100, message: 'falhou access_token=EAABsecretsecretsecret123 fim' } }, cfg)
    expect(e.message).not.toContain('EAABsecret')
  })
})

describe('redação', () => {
  it('remove tokens de URL, cabeçalho e JSON', () => {
    const t = redact('GET /x?access_token=EAABabcdefghijklmnopqrstu&fields=a Authorization: Bearer EAABzzzzzzzzzzzzzzzzzzzzzz {"access_token":"abc123"}')
    expect(t).not.toMatch(/EAAB[a-z]/)
    expect(t).not.toContain('abc123')
    expect(t).toContain('[REDACTED]')
  })
  it('remove segredos vindos do ambiente', () => {
    process.env.META_APP_SECRET = 'segredo-super-longo-123'
    expect(redact('erro: segredo-super-longo-123 vazou')).not.toContain('segredo-super-longo-123')
    delete process.env.META_APP_SECRET
  })
  it('remove dados pessoais dos logs', () => {
    const t = redactPii('lead maria@x.com telefone +55 (51) 99999-1111')
    expect(t).not.toContain('maria@x.com')
    expect(t).not.toContain('99999')
  })
})

describe('configuração', () => {
  it('nasce em modo seguro', () => {
    const c = readMetaConfig({})
    expect(c.dryRun).toBe(true)
    expect(c.phase).toBe(0)
    expect(c.acceptedWriteScopes).toEqual([])
    expect(c.usageThresholdPct).toBe(60)
    expect(c.internalBudgetPct).toBe(40)
  })
  it('valor inválido volta ao padrão conservador', () => {
    const c = readMetaConfig({ META_USAGE_THRESHOLD_PCT: 'abc', META_NET_RETRIES: '9', META_DRY_RUN: 'talvez' })
    expect(c.usageThresholdPct).toBe(60)
    expect(c.netRetries).toBe(2) // nunca mais que 2
    expect(c.dryRun).toBe(true)
  })
})
