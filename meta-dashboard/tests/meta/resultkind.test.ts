import { describe, expect, it } from 'vitest'
import { detectKind, KIND_LABELS } from '@/lib/resultKind'
import { assembleMetrics, getConversations, getFormLeads, getLeads, getResults, getSiteLeads, listConversions, resolveDelivery } from '@/lib/meta'
import { collectLeads, type Account, type CollectDeps } from '@/lib/meta/collectors'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import { readAds, readAdsets, toPerfRows } from '@/lib/meta/read'
import { cfgWith } from './helpers'

const act = (o: Record<string, number>) => Object.entries(o).map(([action_type, v]) => ({ action_type, value: String(v) }))

describe('contagem de resultados por tipo de campanha', () => {
  it('formulário: só lead_grouped conta como lead de formulário', () => {
    const a = act({ 'onsite_conversion.lead_grouped': 5, lead: 5 })
    expect(getFormLeads(a)).toBe(5); expect(getSiteLeads(a)).toBe(0); expect(getResults(a)).toBe(5) // sem contar 2x
  })
  it('site: evento Lead do pixel; sem o evento específico, usa "lead" só quando não há formulário', () => {
    expect(getSiteLeads(act({ 'offsite_conversion.fb_pixel_lead': 8, lead: 8 }))).toBe(8)
    expect(getSiteLeads(act({ lead: 6 }))).toBe(6)
    expect(getSiteLeads(act({ lead: 6, 'onsite_conversion.lead_grouped': 6 }))).toBe(0)
  })
  it('conversas iniciadas', () => {
    const a = act({ 'onsite_conversion.messaging_conversation_started_7d': 12, link_click: 90 })
    expect(getConversations(a)).toBe(12); expect(getResults(a)).toBe(12)
  })
  it('conta que mistura tipos soma sem repetir', () => {
    expect(getResults(act({ 'onsite_conversion.lead_grouped': 3, 'offsite_conversion.fb_pixel_lead': 4, 'onsite_conversion.messaging_conversation_started_7d': 5 }))).toBe(12)
  })
  it('sem ações: zero', () => { expect(getResults(undefined)).toBe(0); expect(getResults([])).toBe(0) })
})

describe('detecção do tipo de resultado do cliente', () => {
  const k = (form_leads: number, site_leads: number, conversations: number) => detectKind({ form_leads, site_leads, conversations })
  it('sem resultado nenhum: padrão histórico (formulário), para não mudar quem já usa', () => expect(k(0, 0, 0)).toBe('form'))
  it('um tipo com 75% ou mais define o cliente', () => {
    expect(k(50, 2, 3)).toBe('form'); expect(k(2, 60, 3)).toBe('site'); expect(k(1, 1, 40)).toBe('conversa')
  })
  it('mais de um tipo relevante: misto', () => expect(k(30, 0, 30)).toBe('misto'))
  it('cada tipo tem seus rótulos', () => {
    expect(KIND_LABELS.conversa.many).toBe('Conversas'); expect(KIND_LABELS.conversa.cost).toContain('Conversa')
    expect(KIND_LABELS.site.many).toBe('Leads do site'); expect(KIND_LABELS.form.cost).toBe('CPL')
  })
})

describe('montagem das métricas para cada tipo de cliente', () => {
  const raw = (actions: Array<{ action_type: string; value: string }>) => ({
    account: { name: 'X', currency: 'BRL' }, summaryRow: { spend: '200', impressions: '10000', clicks: '400', actions },
    campaigns: [{ id: '1', name: 'Camp', effective_status: 'ACTIVE', insight: { spend: '200', actions } }],
  })
  it('cliente de conversas: resultado, custo por resultado e tipo', () => {
    const r = assembleMetrics('act_1', 'last_7d', raw(act({ 'onsite_conversion.messaging_conversation_started_7d': 20 })))
    expect(r.result_kind).toBe('conversa'); expect(r.summary.results).toBe(20); expect(r.summary.cost_per_result).toBe(10)
    expect(r.campaigns[0]).toMatchObject({ results: 20, cost_per_result: 10 })
  })
  it('cliente de site', () => {
    const r = assembleMetrics('act_1', 'last_7d', raw(act({ 'offsite_conversion.fb_pixel_lead': 8, lead: 8 })))
    expect(r.result_kind).toBe('site'); expect(r.summary.site_leads).toBe(8); expect(r.summary.cost_per_result).toBe(25)
  })
  it('cliente de formulário continua igual (leads e CPL de antes)', () => {
    const r = assembleMetrics('act_1', 'last_7d', raw(act({ 'onsite_conversion.lead_grouped': 10 })))
    expect(r.result_kind).toBe('form'); expect(r.summary.leads).toBe(10); expect(r.summary.cpl).toBe(20)
  })
  it('sem resultados: não quebra e cai no padrão', () => {
    const r = assembleMetrics('act_1', 'last_7d', raw([]))
    expect(r.result_kind).toBe('form'); expect(r.summary.results).toBe(0); expect(r.summary.cost_per_result).toBeNull()
  })
})

describe('desempenho e drill-down com resultado genérico', () => {
  it('linhas por anúncio, conjuntos e anúncios trazem results/cost_per_result', async () => {
    const conv = act({ 'onsite_conversion.messaging_conversation_started_7d': 4 })
    expect(toPerfRows([{ ad_id: '1', spend: '40', actions: conv }])[0].results).toBe(4)
    const snaps = new MemorySnapshotStore()
    await snaps.put('c1', 'structure', 'adsets', [{ id: '21', name: 'Conj', campaign_id: '11' }], 0)
    await snaps.put('c1', 'adset_insights', 'last_7d', [{ adset_id: '21', spend: '40', actions: conv }], 0)
    await snaps.put('c1', 'structure', 'ads', [{ id: '31', name: 'A', adset_id: '21' }], 0)
    await snaps.put('c1', 'ad_insights', 'last_7d', [{ ad_id: '31', spend: '40', actions: conv }], 0)
    expect((await readAdsets(snaps, 'c1', '11', 'last_7d'))[0]).toMatchObject({ results: 4, cost_per_result: 10 })
    expect((await readAds(snaps, 'c1', '21', 'last_7d'))[0]).toMatchObject({ results: 4, cost_per_result: 10 })
  })
})

describe('coletor de leads para cliente sem formulário (site/conversas)', () => {
  const acc: Account = { clientId: 'c1', slug: 's', adAccountId: 'act_1234567' }
  const NOW = Date.UTC(2026, 8, 21, 15)
  const mk = (syncLeads: CollectDeps['syncLeads'], store: MemoryLimitStore) =>
    ({ cfg: cfgWith(), now: () => NOW, get: (async () => ({ ok: true, status: 200, data: {}, attempts: 1 })) as never, snaps: new MemorySnapshotStore(), state: store, syncLeads }) as CollectDeps

  it('sem página do Facebook não é falha (nunca vai para a dead-letter) e só reconfere 1x por dia, sem chamadas', async () => {
    const store = new MemoryLimitStore(() => NOW)
    let calls = 0
    const d = mk(async () => { calls++; return { imported: 0, noPage: true, error: 'sem página' } }, store)
    expect((await collectLeads(d, acc)).status).toBe('done'); expect(calls).toBe(1)
    const st = await store.getState('c1'); expect(st.lastSynced.leads).toBe(NOW); expect(st.lastSynced.leads_nopage).toBe(NOW)
    // novos ciclos no mesmo dia: zero chamadas
    const later = { ...d, now: () => NOW + 60 * 60_000 }
    expect((await collectLeads(later, acc)).status).toBe('done'); expect(calls).toBe(1)
    // depois de 24 h reconfere (o cliente pode ter passado a usar formulário)
    const next = { ...d, now: () => NOW + 25 * 60 * 60_000 }
    await collectLeads(next, acc); expect(calls).toBe(2)
  })

  it('quando a página passa a existir, limpa a marca de "sem página"', async () => {
    const store = new MemoryLimitStore(() => NOW)
    await store.patchState('c1', { lastSynced: { leads_nopage: NOW - 30 * 60 * 60_000 } })
    const d = mk(async () => ({ imported: 2 }), store)
    await collectLeads(d, acc)
    expect((await store.getState('c1')).lastSynced.leads_nopage).toBeUndefined()
  })
})

describe('resultado do cliente no card do admin', () => {
  it('totais por período (7, 14 e 30 dias), série de 14 dias e detecção do tipo', async () => {
    const { summarizeDaily } = await import('@/lib/adminResults')
    const NOW = Date.UTC(2026, 8, 21, 15) // dia 21; a série termina em "ontem" (20)
    const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10)
    const conv = (v: number) => act({ 'onsite_conversion.messaging_conversation_started_7d': v })
    const rows = Array.from({ length: 30 }, (_, i) => ({ date_start: day(30 - i), spend: '10', impressions: '1000', clicks: '20', actions: conv(i + 1) }))
    const r = summarizeDaily(rows, NOW)
    expect(r.kind).toBe('conversa')
    expect(r.daily).toHaveLength(14); expect(r.daily[13]).toBe(30) // ontem
    expect(r.periods[7]).toMatchObject({ results: 24 + 25 + 26 + 27 + 28 + 29 + 30, spend: 70, impressions: 7000, clicks: 140, conversations: 189 })
    expect(r.periods[14].spend).toBe(140); expect(r.periods[30].spend).toBe(300)
    expect(r.spanDays).toBe(30)
  })
  it('separa leads de formulário, do site, conversas, personalizadas, compras e visitas', async () => {
    const { metaTotals } = await import('@/lib/adminResults')
    const NOW = Date.UTC(2026, 8, 21, 15)
    const y = new Date(NOW - 86_400_000).toISOString().slice(0, 10)
    const t = metaTotals([{
      date_start: y, spend: '100', impressions: '5000', clicks: '90',
      actions: act({ 'onsite_conversion.lead_grouped': 3, 'offsite_conversion.custom.7': 5, 'onsite_conversion.messaging_conversation_started_7d': 4, link_click: 80, landing_page_view: 60, purchase: 2 }),
      action_values: act({ purchase: 900 })
    }], NOW, 7)
    expect(t).toMatchObject({ formLeads: 3, custom: 5, conversations: 4, linkClicks: 80, landingViews: 60, purchases: 2, purchaseValue: 900, results: 14 })
  })
  it('sem dados na semana: zeros e cai no padrão (formulário)', async () => {
    const { summarizeDaily } = await import('@/lib/adminResults')
    const r = summarizeDaily([], Date.UTC(2026, 8, 21, 15))
    expect(r.kind).toBe('form'); expect(r.periods[7].results).toBe(0); expect(r.spanDays).toBe(0); expect(r.daily.every(n => n === 0)).toBe(true)
  })
  it('cliente de formulário continua sendo de formulário', async () => {
    const { summarizeDaily } = await import('@/lib/adminResults')
    const NOW = Date.UTC(2026, 8, 21, 15)
    const y = new Date(NOW - 86_400_000).toISOString().slice(0, 10)
    expect(summarizeDaily([{ date_start: y, spend: '50', actions: act({ 'onsite_conversion.lead_grouped': 5 }) }], NOW).kind).toBe('form')
  })
})

describe('conversões personalizadas e lista completa de ações', () => {
  it('a personalizada conta como resultado e não repete o lead do pixel', async () => {
    const { getCustomConversions, getResults, getWebResult, resultCounts } = await import('@/lib/meta')
    const a = act({ 'offsite_conversion.custom.777': 12, 'offsite_conversion.fb_pixel_lead': 12, lead: 12 })
    expect(getCustomConversions(a)).toBe(12); expect(getWebResult(a)).toBe(12); expect(getResults(a)).toBe(12) // não vira 24
    expect(resultCounts(a)).toMatchObject({ site_leads: 0, custom_conversions: 12 })
    // sem personalizada: volta a valer o lead do site
    expect(getResults(act({ 'offsite_conversion.fb_pixel_lead': 5 }))).toBe(5)
    // soma com conversas e formulário (tipos diferentes)
    expect(getResults(act({ 'offsite_conversion.custom.1': 3, 'onsite_conversion.messaging_conversation_started_7d': 4, 'onsite_conversion.lead_grouped': 2 }))).toBe(9)
    // evento personalizado do pixel também conta
    expect(getCustomConversions(act({ 'offsite_conversion.fb_pixel_custom': 6 }))).toBe(6)
  })

  it('conversas: sem o evento de conversa iniciada, usa as conexões de mensagem', async () => {
    const { getConversations } = await import('@/lib/meta')
    expect(getConversations(act({ 'onsite_conversion.total_messaging_connection': 9 }))).toBe(9)
    expect(getConversations(act({ 'onsite_conversion.messaging_conversation_started_7d': 4, 'onsite_conversion.total_messaging_connection': 9 }))).toBe(4)
  })

  it('lista TODAS as ações com nome em português; personalizada com o nome da Meta e em primeiro', async () => {
    const { listConversions } = await import('@/lib/meta')
    const l = listConversions(act({ link_click: 300, 'offsite_conversion.custom.777': 12, 'onsite_conversion.lead_grouped': 4, purchase: 2, 'tipo_desconhecido_novo': 1, zero: 0 }), 600, { '777': 'Lead qualificado' })
    expect(l.map(x => x.label)).toEqual(['Lead qualificado (personalizada)', 'Cliques no link', 'Leads de formulário', 'Compras', 'Tipo desconhecido novo'])
    expect(l[0]).toMatchObject({ custom: true, value: 12, cost: 50 })
    expect(l.some(x => x.type === 'zero')).toBe(false) // zeradas não poluem
  })

  it('conversão personalizada sem nome conhecido ganha um nome legível', async () => {
    const { labelAction } = await import('@/lib/actionLabels')
    expect(labelAction('offsite_conversion.custom.999')).toBe('Conversão personalizada 999')
    expect(labelAction('offsite_conversion.fb_pixel_lead')).toBe('Leads do site (pixel)')
  })

  it('conta de conversões personalizadas vira o tipo "custom" e mostra os rótulos de conversão', () => {
    expect(detectKind({ form_leads: 0, site_leads: 0, conversations: 2, custom_conversions: 40 })).toBe('custom')
    expect(KIND_LABELS.custom.many).toBe('Conversões')
    expect(detectKind({ form_leads: 0, site_leads: 0, conversations: 30, custom_conversions: 30 })).toBe('misto')
  })

  it('a montagem das métricas traz a lista de conversões da conta e de cada campanha', () => {
    const actions = act({ 'offsite_conversion.custom.777': 10, link_click: 100 })
    const r = assembleMetrics('act_1', 'last_7d', {
      account: { name: 'X' }, summaryRow: { spend: '100', actions }, customNames: { '777': 'Lead qualificado' },
      campaigns: [{ id: '1', name: 'C', insight: { spend: '100', actions } }],
    })
    expect(r.conversions[0]).toMatchObject({ label: 'Lead qualificado (personalizada)', value: 10, cost: 10 })
    expect(r.campaigns[0].conversions.map(c => c.type)).toEqual(['offsite_conversion.custom.777', 'link_click'])
    expect(r.summary.custom_conversions).toBe(10); expect(r.result_kind).toBe('custom')
  })
})

describe('e-commerce e detecção de vendas (sales)', () => {
  it('detecta tipo sales quando compras >= 75%', () => {
    expect(detectKind({ form_leads: 0, site_leads: 0, conversations: 0, purchases: 50 })).toBe('sales')
    expect(KIND_LABELS.sales.many).toBe('Compras')
    expect(KIND_LABELS.sales.cost).toBe('CPA')
  })

  it('compras entram em getResults', () => {
    const a = act({ purchase: 5, 'offsite_conversion.fb_pixel_purchase': 5 })
    expect(getResults(a)).toBe(5) // não duplica entre pixel e generic
  })
})

describe('conversões web (cadastros, agendamentos, contatos) e leads combinados', () => {
  it('não descarta pixel lead se houver formulário instantâneo', () => {
    const a = act({ 'onsite_conversion.lead_grouped': 10, 'offsite_conversion.fb_pixel_lead': 8, lead: 18 })
    expect(getFormLeads(a)).toBe(10)
    expect(getSiteLeads(a)).toBe(8)
    expect(getLeads(a)).toBe(18)
    expect(getResults(a)).toBe(18)
  })

  it('soma agendamentos, cadastros e contatos em getSiteLeads e getResults', () => {
    const a = act({ schedule: 4, complete_registration: 6, contact_total: 2 })
    expect(getSiteLeads(a)).toBe(12)
    expect(getResults(a)).toBe(12)
    expect(getLeads(a)).toBe(12)
  })
})

describe('resolveDelivery: inteligência de entrega sem visão de túnel', () => {
  it('campanha de formulário retorna leads e CPL', () => {
    const res = resolveDelivery({
      spend: 300,
      leads: 15,
      cpl: 20,
      conversions: listConversions(act({ 'onsite_conversion.lead_grouped': 15, link_click: 200 }), 300),
    }, 'form')
    expect(res).toMatchObject({ count: 15, label: 'leads', cost: 20, costLabel: 'CPL', badge: 'Leads', type: 'form' })
  })

  it('campanha de tráfego / cliques no link em conta de formulário NÃO fica zerada', () => {
    const res = resolveDelivery({
      spend: 100,
      leads: 0,
      cpl: null,
      results: 0,
      conversions: listConversions(act({ link_click: 250, post_engagement: 80 }), 100),
    }, 'form')
    expect(res).toMatchObject({ count: 250, label: 'cliques no link', cost: 0.4, costLabel: 'CPC', badge: 'Cliques', type: 'link_click' })
  })

  it('campanha de vídeo NÃO fica zerada', () => {
    const res = resolveDelivery({
      spend: 50,
      leads: 0,
      results: 0,
      conversions: listConversions(act({ video_view: 1000 }), 50),
    }, 'form')
    expect(res).toMatchObject({ count: 1000, label: 'views de vídeo', cost: 0.05, costLabel: 'CPV', badge: 'Views', type: 'video_view' })
  })

  it('campanha de e-commerce / compras retorna compras e CPA', () => {
    const res = resolveDelivery({
      spend: 400,
      leads: 0,
      results: 10,
      conversions: listConversions(act({ purchase: 10, link_click: 300 }), 400),
    }, 'form')
    expect(res).toMatchObject({ count: 10, label: 'compras', cost: 40, costLabel: 'CPA', badge: 'Compras', type: 'sales' })
  })

  it('campanha de WhatsApp / conversa retorna conversas e Custo/conv.', () => {
    const res = resolveDelivery({
      spend: 150,
      leads: 0,
      conversions: listConversions(act({ 'onsite_conversion.messaging_conversation_started_7d': 15 }), 150),
    }, 'form')
    expect(res).toMatchObject({ count: 15, label: 'conversas', cost: 10, costLabel: 'Custo/conv.', badge: 'Conversas', type: 'conversa' })
  })

  it('campanha sem conversões mas com cliques usa cliques e CPC', () => {
    const res = resolveDelivery({
      spend: 60,
      clicks: 120,
      impressions: 4000,
      conversions: [],
    }, 'form')
    expect(res).toMatchObject({ count: 120, label: 'cliques', cost: 0.5, costLabel: 'CPC', badge: 'Cliques', type: 'clicks' })
  })

  it('campanha com zero entrega retorna count 0 e custo null', () => {
    const res = resolveDelivery({
      spend: 0,
      clicks: 0,
      impressions: 0,
      conversions: [],
    }, 'form')
    expect(res).toMatchObject({ count: 0, cost: null, type: 'none' })
  })
})
