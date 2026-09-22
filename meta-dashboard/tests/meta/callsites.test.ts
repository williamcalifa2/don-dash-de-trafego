import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMetrics, type DatePreset } from '@/lib/meta'
import { parseRequest } from '@/lib/meta/allowlist'
import { resetMetaConfigForTests, metaConfig } from '@/lib/meta/config'
import { __resetLegacyCooldown } from '@/lib/meta/legacy'
import { json } from './helpers'

// O cliente do processo aqui não usa banco: só a rede simulada de cada teste.
vi.mock('@/lib/meta/instance', async () => {
  const { createMetaClient } = await import('@/lib/meta/client')
  return { meta: createMetaClient(), limits: () => { throw new Error('sem banco nos testes') } }
})

beforeEach(() => { process.env.META_ACCESS_TOKEN = 'TOKEN_TESTE_123456'; resetMetaConfigForTests(); __resetLegacyCooldown() })
afterEach(() => { vi.unstubAllGlobals(); delete process.env.META_ACCESS_TOKEN; resetMetaConfigForTests() })

describe('fetchMetrics pelo cliente central', () => {
  it.each(['today', 'last_7d', 'last_14d', 'last_30d'] as DatePreset[])('preset %s: 5 leituras GET, todas na allowlist, token no cabeçalho', async preset => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${new URL(url).pathname}`)
      expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
      expect(url).not.toContain('access_token')
      if (url.includes('/campaigns')) return json({ data: [{ id: '9', name: 'C', effective_status: 'ACTIVE', insights: { data: [{ spend: '10', actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '2' }] }] } }] })
      if (url.includes('time_increment=1')) return json({ data: [{ date_start: '2026-09-01', spend: '5' }, { date_start: '2026-09-02', spend: '5' }] })
      if (url.includes('/insights')) return json({ data: [{ spend: '10', impressions: '100', actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '2' }] }] })
      return json({ name: 'Conta', currency: 'BRL' })
    }))
    const r = await fetchMetrics('TOKEN_TESTE_123456', 'act_1234567', preset)
    expect(r.account_name).toBe('Conta')
    expect(r.campaigns).toHaveLength(1)
    expect(r.summary_prev).toBeDefined()
    expect(r.daily?.dates).toHaveLength(2)
    expect(seen.length).toBeGreaterThanOrEqual(5) // 5 leituras (+1 com os nomes das conversões personalizadas, guardado por 1 h)
    expect(seen.length).toBeLessThanOrEqual(6)
    expect(seen.every(s => s.startsWith('GET '))).toBe(true)
  })

  it('erro da Meta na conta vira exceção legível (a rota responde 502)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 190, message: 'Token expirado' } }, { status: 400 })))
    await expect(fetchMetrics('T', 'act_1234567', 'last_7d')).rejects.toThrow('Token expirado')
  })
})

describe('caminhos usados pelo painel passam na allowlist', () => {
  const cfg = () => metaConfig()
  const paths = [
    'act_1234567/insights?level=ad&fields=ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions&date_preset=last_7d&limit=100',
    '123456789/adsets?fields=id,name,status,daily_budget,lifetime_budget,insights.date_preset(last_7d){spend,impressions,clicks,ctr,frequency,actions,cost_per_action_type}&limit=50',
    '123456789/ads?fields=id,name,status,creative{id,name,thumbnail_url,image_url,video_id,body,title,object_type},insights.date_preset(last_30d){spend,impressions,clicks,ctr,actions,cost_per_action_type}&limit=50',
    '555555555?fields=thumbnails',
    '123456789/previews?ad_format=MOBILE_FEED_STANDARD',
    '123456789?fields=account_id',
    'me/adaccounts?fields=account_id,name,currency,account_status&limit=100',
    'me/accounts?fields=id,name&limit=100',
    'act_1234567/promote_pages?fields=id,name&limit=25',
    '123456789?fields=access_token',
    '123456789/leadgen_forms?fields=id,name&limit=100',
    `123456789/leads?fields=id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name&limit=100&filtering=${encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: 1700000000 }]))}&after=QVFI`,
    '987654321?fields=field_data,created_time,ad_name,campaign_name,adset_name',
    'act_1234567/insights?fields=actions&date_preset=last_30d',
    'debug_token?input_token=EAAtokenlongodeteste123456',
  ]
  it.each(paths)('%s', p => { expect(() => parseRequest(p, cfg())).not.toThrow() })
})
