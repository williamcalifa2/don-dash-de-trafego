import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRequest, MetaPolicyError } from '@/lib/meta/allowlist'
import { collectOrganic, dayKey, parseBreakdown, parseSeries, parseTotals, windows, type OrganicDeps, type OrganicSnapshot } from '@/lib/meta/organic'
import { buildOrganicView } from '@/lib/meta/organicRead'
import { MemoryLimitStore } from '@/lib/meta/memoryStore'
import { MemorySnapshotStore } from '@/lib/meta/snapshots'
import type { Account } from '@/lib/meta/collectors'
import type { MetaResult } from '@/lib/meta/client'

const cfg = { pageSize: 100 }
const okReq = (p: string) => expect(() => parseRequest(p, cfg), p).not.toThrow()
const badReq = (p: string, reason?: string) => { try { parseRequest(p, cfg); throw new Error('deveria ter bloqueado: ' + p) } catch (e) { expect(e).toBeInstanceOf(MetaPolicyError); if (reason) expect((e as MetaPolicyError).reason).toBe(reason) } }

describe('allowlist do orgânico (somente leitura)', () => {
  it('permite ler Página, insights, posts, mídia, stories e insights de post', () => {
    okReq('123456789?fields=access_token,name,fan_count,followers_count,link,picture{url},instagram_business_account{id,username,followers_count,media_count,profile_picture_url}')
    okReq('123456789/insights?metric=page_media_view&period=day&since=2026-07-01&until=2026-09-21')
    okReq('17841400000000000/insights?metric=reach,views,accounts_engaged&metric_type=total_value&period=day&since=2026-09-01&until=2026-09-08')
    okReq('17841400000000000/insights?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=age')
    okReq('123456789/published_posts?fields=id,message,created_time,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)&limit=25')
    okReq('17841400000000000/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=30')
    okReq('17841400000000000/stories?fields=id,media_type,media_url,permalink,timestamp&limit=25')
    okReq('123456789_987654321/insights?metric=post_media_view,post_total_media_view_unique')
    okReq('17890000000000000/insights?metric=reach,views,likes,comments,shares,saved,total_interactions')
  })
  it('continua bloqueando escrita e o que não é leitura de orgânico', () => {
    badReq('123456789/feed', 'endpoint_not_allowed')
    badReq('123456789/photos', 'endpoint_not_allowed')
    badReq('123456789/comments', 'endpoint_not_allowed')
    badReq('123456789/subscribed_apps', 'endpoint_not_allowed')
    badReq('17841400000000000/media_publish', 'endpoint_not_allowed')
  })
  it('valida métricas, períodos, datas e modificadores', () => {
    badReq('123456789/insights?metric=PAGE_MEDIA_VIEW&period=day', 'value_invalid')
    badReq('123456789/insights?metric=a;b&period=day', 'value_invalid')
    badReq('123456789/insights?metric=page_media_view&period=forever', 'value_invalid')
    badReq('123456789/insights?metric=page_media_view&since=ontem', 'value_invalid')
    badReq('123456789/insights?metric=page_media_view&metric_type=write', 'value_invalid')
    badReq('123456789/published_posts?fields=id,reactions.delete(1)', 'fields_invalid')
    badReq('123456789/published_posts?fields=id,message.limit(abc)', 'value_invalid')
    badReq('act_1234567/insights?fields=spend&metric=reach', 'param_not_allowed') // metric só vale para objetos, não para a conta de anúncios
    badReq('123456789?fields=access_token,secret_field', 'field_not_allowed')
  })
})

describe('leitura das respostas', () => {
  it('séries, totais e recortes', () => {
    expect(parseSeries({ data: [{ values: [{ value: 5, end_time: '2026-09-02T07:00:00+0000' }, { value: 'x', end_time: '2026-09-03T07:00:00+0000' }] }] })).toEqual([{ d: '2026-09-01', v: 5 }])
    expect(parseTotals({ data: [{ name: 'reach', total_value: { value: 10 } }, { name: 'views', total_value: {} }] })).toEqual({ reach: 10 })
    expect(parseBreakdown({ data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['18-24'], value: 5 }, { dimension_values: ['25-34'], value: 9 }] }] } }] })).toEqual([{ label: '25-34', value: 9 }, { label: '18-24', value: 5 }])
  })
  it('janelas: 7/14/30 terminam ontem e o mês vai do dia 1 até ontem, sem sobrepor o período anterior', () => {
    const w = windows('2026-09-21')
    expect(w['7']).toEqual({ cur: ['2026-09-14', '2026-09-21'], prev: ['2026-09-07', '2026-09-14'] })
    expect(w.month).toEqual({ cur: ['2026-09-01', '2026-09-21'], prev: ['2026-08-01', '2026-08-21'] })
    expect(windows('2026-09-01').month).toBeNull()
  })
})

// ── coleta ────────────────────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 8, 21, 15, 0, 0)
const acc: Account = { clientId: 'c1', slug: 'cliente', adAccountId: 'act_1234567', pageId: '123456789' }
const res = <T,>(data: T, over: Partial<MetaResult<T>> = {}): MetaResult<T> => ({ ok: true, status: 200, data, attempts: 1, ...over })
const series = (n: number, v = 10) => ({ data: [{ values: Array.from({ length: n }, (_, i) => ({ value: v + i, end_time: new Date(NOW - (n - i - 1) * 86_400_000).toISOString() })) }] })

type AnyGet = (p: string, ctx: { token?: string }) => Promise<unknown>
function makeDeps(over: { token?: string | undefined; get?: AnyGet; batch?: OrganicDeps['batch'] } = {}) {
  const paths: string[] = []
  const tokens: Array<string | undefined> = []
  const get = (over.get ?? (async (p: string, ctx: { token?: string }) => {
    paths.push(p); tokens.push(ctx.token)
    if (p.startsWith('123456789?')) return res({ access_token: 'PAGE_TOKEN', name: 'Loja Boa', fan_count: 900, followers_count: 1000, link: 'https://fb.com/lojaboa', picture: { data: { url: 'https://img/p.jpg' } }, instagram_business_account: { id: '17841400000000000', username: 'lojaboa', followers_count: 5000, follows_count: 100, media_count: 80, profile_picture_url: 'https://img/ig.jpg' } })
    if (p.includes('/insights?metric=page_')) return res(series(60))
    if (p.includes('/published_posts')) return res({ data: [{ id: '123456789_111', message: 'Promo', created_time: '2026-09-19T12:00:00+0000', permalink_url: 'https://fb/p1', full_picture: 'https://img/f1.jpg', status_type: 'added_photos', shares: { count: 2 }, reactions: { summary: { total_count: 30 } }, comments: { summary: { total_count: 4 } } }] })
    if (p.includes('metric=reach&period=day&metric_type=time_series')) return res(series(30))
    if (p.includes('metric=follower_count')) return res(series(30, 1))
    if (p.includes('metric_type=total_value&period=day')) return res({ data: [{ name: 'reach', total_value: { value: 1000 } }, { name: 'views', total_value: { value: 3000 } }, { name: 'total_interactions', total_value: { value: 200 } }] })
    if (p.includes('follower_demographics')) return res({ data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: [p.includes('breakdown=age') ? '25-34' : 'F'], value: 50 }] }] } }] })
    if (p.includes('/media?')) return res({ data: [{ id: '17890000000000001', caption: 'Reels novo', media_type: 'VIDEO', media_product_type: 'REELS', thumbnail_url: 'https://img/r.jpg', permalink: 'https://ig/r', timestamp: '2026-09-18T15:00:00+0000', like_count: 40, comments_count: 3 }] })
    if (p.includes('/stories?')) return res({ data: [{ id: '17890000000000009', media_type: 'IMAGE', media_url: 'https://img/s.jpg', permalink: 'https://ig/s', timestamp: '2026-09-21T10:00:00+0000' }] })
    return res({})
  })) as OrganicDeps['get']
  const batch = (over.batch ?? (async (ps: string[], ctx: { token?: string }) => {
    tokens.push(ctx.token)
    return res(ps.map(p => p.includes('post_media_view')
      ? res({ data: [{ name: 'post_media_view', values: [{ value: 800 }] }, { name: 'post_total_media_view_unique', values: [{ value: 500 }] }] })
      : res({ data: [{ name: 'reach', values: [{ value: 900 }] }, { name: 'views', values: [{ value: 1500 }] }, { name: 'saved', values: [{ value: 12 }] }, { name: 'shares', values: [{ value: 7 }] }, { name: 'total_interactions', values: [{ value: 62 }] }] })))
  })) as OrganicDeps['batch']
  const snaps = new MemorySnapshotStore(), state = new MemoryLimitStore(() => NOW)
  const deps: OrganicDeps = { now: () => NOW, get, batch, snaps, state, token: 'token' in over ? over.token : 'ORG_TOKEN' }
  return { deps, snaps, state, paths, tokens }
}
const snapOf = async (snaps: MemorySnapshotStore) => (await snaps.get<OrganicSnapshot>('c1', 'organic', 'all'))!.payload

describe('coleta do orgânico', () => {
  let ctx: ReturnType<typeof makeDeps>
  beforeEach(() => { ctx = makeDeps() })

  it('guarda perfil, séries, janelas, publicações com insights, público e stories', async () => {
    const out = await collectOrganic(ctx.deps, acc)
    expect(out.status).toBe('done')
    const s = await snapOf(ctx.snaps)
    expect(s.status).toBe('ok')
    expect(s.profile.fb).toMatchObject({ id: '123456789', name: 'Loja Boa', followers: 1000 })
    expect(s.profile.ig).toMatchObject({ id: '17841400000000000', username: 'lojaboa', followers: 5000 })
    expect(Object.keys(s.fb!.series).sort()).toEqual(['page_follows', 'page_media_view', 'page_post_engagements', 'page_total_media_view_unique'])
    expect(s.fb!.posts[0]).toMatchObject({ type: 'Foto', reactions: 30, comments: 4, shares: 2, views: 800, reach: 500 })
    expect(s.ig!.windows['7'].cur).toMatchObject({ reach: 1000, views: 3000 })
    expect(s.ig!.windows['7'].prev).toMatchObject({ reach: 1000 })
    expect(s.ig!.media[0]).toMatchObject({ type: 'Reels', likes: 40, reach: 900, saves: 12, shares: 7, interactions: 62 })
    expect(s.ig!.demo.age[0]).toEqual({ label: '25-34', value: 50 })
    expect(s.ig!.stories).toHaveLength(1)
    expect((await ctx.state.getState('c1')).lastSynced.organic).toBe(NOW)
  })

  it('só usa o token do orgânico (nunca o dos anúncios) e o token da Página nas leituras dela', async () => {
    await collectOrganic(ctx.deps, acc)
    expect(ctx.tokens[0]).toBe('ORG_TOKEN') // leitura da Página com o token do orgânico
    expect(ctx.tokens.slice(1).every(t => t === 'PAGE_TOKEN')).toBe(true)
    expect(JSON.stringify(await snapOf(ctx.snaps))).not.toContain('PAGE_TOKEN') // o token da Página nunca é guardado
    expect(JSON.stringify(await snapOf(ctx.snaps))).not.toContain('ORG_TOKEN')
  })

  it('todas as chamadas passam na allowlist', async () => {
    await collectOrganic(ctx.deps, acc)
    for (const p of ctx.paths) expect(() => parseRequest(p, cfg), p).not.toThrow()
  })

  it('sem token: guarda "no_token" e não chama a Meta', async () => {
    const c = makeDeps({ token: undefined })
    expect((await collectOrganic(c.deps, acc)).status).toBe('done')
    expect((await snapOf(c.snaps)).status).toBe('no_token'); expect(c.paths).toHaveLength(0)
  })

  it('sem Página cadastrada e sem uma única Página na conta: "no_page"', async () => {
    const c = makeDeps({ get: async (p: string) => (p.includes('promote_pages') ? res({ data: [{ id: '1' }, { id: '2' }] }) : res({})) })
    await collectOrganic(c.deps, { ...acc, pageId: null })
    expect((await snapOf(c.snaps)).status).toBe('no_page')
  })

  it('pausa por proteção (kill switch) adia em vez de falhar, e nada é gravado', async () => {
    const c = makeDeps({ get: async () => res({}, { ok: false, blocked: 'kill_switch', error: { kind: 'client', status: 0, message: 'x' } }) })
    const out = await collectOrganic(c.deps, acc)
    expect(out).toMatchObject({ status: 'deferred', reason: 'kill_switch' })
    expect(await c.snaps.get('c1', 'organic', 'all')).toBeNull()
  })

  it('uma métrica indisponível não derruba o resto', async () => {
    const base = makeDeps()
    const c = makeDeps({ get: async (p, x) => (p.includes('metric=page_follows') ? res({}, { ok: false, error: { kind: 'client', status: 400, message: 'invalid metric' } }) : base.deps.get(p, { purpose: 'x', ...x })) })
    expect((await collectOrganic(c.deps, acc)).status).toBe('done')
    const s = await snapOf(c.snaps)
    expect(s.fb!.unavailable).toContain('page_follows'); expect(s.fb!.series.page_media_view.length).toBeGreaterThan(0)
  })
})

// ── visão por período ─────────────────────────────────────────────────────────
describe('visão do orgânico por período', () => {
  it('monta números, série, publicações do período e melhores dias; compara só com histórico completo', async () => {
    const c = makeDeps(); await collectOrganic(c.deps, acc)
    const snap = (await c.snaps.get<OrganicSnapshot>('c1', 'organic', 'all'))!
    const v = buildOrganicView(snap, 'last_7d', NOW)
    expect(v.status).toBe('ok'); expect(v.hasIg && v.hasFb).toBe(true)
    expect(v.series.dates).toHaveLength(7); expect(v.series.dates.at(-1)).toBe(dayKey(NOW - 86_400_000))
    const reach = v.kpis.all.find(k => k.key === 'reach')!
    expect(reach.value).toBeGreaterThan(1000) // Instagram (janela) + Facebook (soma dos dias)
    expect(v.kpis.ig.find(k => k.key === 'followers')?.value).toBe(5000)
    expect(v.posts.map(p => p.platform).sort()).toEqual(['fb', 'ig']) // os dois posts são dos últimos 7 dias
    expect(v.weekdays).toHaveLength(7); expect(v.weekdays.some(w => w.posts > 0)).toBe(true)
    // série de 60 dias cobre o período anterior de 7 dias, então há comparação
    expect(v.kpis.fb.find(k => k.key === 'views')?.prev).not.toBeNull()
    // "este mês" no dia 21: 20 dias fechados
    expect(buildOrganicView(snap, 'this_month', NOW).series.dates).toHaveLength(20)
    // "hoje" mostra 7 dias com aviso
    expect(buildOrganicView(snap, 'today', NOW).note).toMatch(/últimos 7 dias/)
  })

  it('sem dados guardados: pendente; sem token/Página: mensagens próprias', async () => {
    expect(buildOrganicView(null, 'last_7d', NOW).status).toBe('pending')
    const c = makeDeps({ token: undefined }); await collectOrganic(c.deps, acc)
    expect(buildOrganicView((await c.snaps.get<OrganicSnapshot>('c1', 'organic', 'all')), 'last_7d', NOW).status).toBe('no_token')
  })

  it('período anterior não coberto pela série guardada não gera variação', async () => {
    const c = makeDeps({ get: undefined })
    await collectOrganic(c.deps, acc)
    const snap = (await c.snaps.get<OrganicSnapshot>('c1', 'organic', 'all'))!
    // 30 dias: o anterior (30-60 dias atrás) só é coberto se a série chega a 60 dias; corta para 40 e não deve comparar
    for (const k of Object.keys(snap.payload.fb!.series)) snap.payload.fb!.series[k] = snap.payload.fb!.series[k].slice(-40)
    expect(buildOrganicView(snap, 'last_30d', NOW).kpis.fb.find(k => k.key === 'views')?.prev).toBeNull()
  })
})

import { lastScheduledAt, runOrganicCycle } from '@/lib/meta/organic'

describe('orgânico: uma vez por dia, às 6h do Brasil', () => {
  const brt = (d: number, h: number, m = 0) => Date.UTC(2026, 8, d, h + 3, m) // horário de Brasília -> UTC
  it('a hora marcada é hoje às 06:00 depois das 6h e ontem às 06:00 antes das 6h', () => {
    expect(lastScheduledAt(brt(21, 7), 6)).toBe(brt(21, 6))
    expect(lastScheduledAt(brt(21, 5, 59), 6)).toBe(brt(20, 6))
    expect(lastScheduledAt(brt(21, 6), 6)).toBe(brt(21, 6))
  })

  const accs: Account[] = [1, 2, 3].map(i => ({ clientId: `c${i}`, slug: `s${i}`, adAccountId: `act_100000${i}`, pageId: '123456789' }))
  const run = async (now: number, fresh: Record<string, number>) => {
    const c = makeDeps(); const deps: OrganicDeps = { ...c.deps, now: () => now }
    for (const [id, at] of Object.entries(fresh)) await c.state.patchState(id, { lastSynced: { organic: at } })
    const out = await runOrganicCycle(deps, accs, { hourBr: 6, perCycle: 2, deadline: now + 60_000 })
    return out.map(o => o.slug)
  }

  it('antes das 6h não faz nada se todos já foram atualizados ontem às 6h ou depois', async () => {
    expect(await run(brt(21, 4), { c1: brt(20, 6, 10), c2: brt(20, 6, 20), c3: brt(20, 7) })).toEqual([])
  })
  it('depois das 6h pega as contas ainda não atualizadas hoje, poucas por ciclo, das mais atrasadas', async () => {
    expect(await run(brt(21, 6, 10), { c1: brt(20, 6, 30), c2: brt(20, 6, 10), c3: brt(21, 6, 5) })).toEqual(['s2', 's1']) // c3 já foi hoje; c2 é a mais atrasada
    expect(await run(brt(21, 6, 10), {})).toHaveLength(2) // limite de 2 por ciclo
  })
  it('conta atualizada hoje depois das 6h não é refeita; cliente novo entra no mesmo dia', async () => {
    expect(await run(brt(21, 15), { c1: brt(21, 6, 30), c2: brt(21, 7), c3: brt(21, 8) })).toEqual([])
    expect(await run(brt(21, 15), { c1: brt(21, 6, 30), c2: brt(21, 7) })).toEqual(['s3']) // c3 nunca coletado
  })
})

describe('orgânico: menos chamadas por conta', () => {
  const named = (n: number) => ({ data: ['page_media_view', 'page_total_media_view_unique', 'page_post_engagements', 'page_follows'].map(name => ({ name, values: series(n).data[0].values })) })
  const withInsights = (over: Parameters<typeof makeDeps>[0] = {}) => {
    const base = makeDeps()
    const batch = vi.fn(base.deps.batch) as unknown as OrganicDeps['batch'] & ReturnType<typeof vi.fn>
    const c = makeDeps({
      batch,
      get: async (p, x) => {
        if (p.includes('/insights?metric=page_media_view,page_total_media_view_unique')) return res(named(60))
        if (p.includes('/published_posts') && p.includes('insights.metric(')) return res({ data: [{ id: '123456789_111', message: 'Promo', created_time: '2026-09-19T12:00:00+0000', status_type: 'added_photos', insights: { data: [{ name: 'post_media_view', values: [{ value: 800 }] }, { name: 'post_total_media_view_unique', values: [{ value: 500 }] }] } }] })
        if (p.includes('/media?') && p.includes('insights.metric(')) return res({ data: [{ id: '17890000000000001', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-09-18T15:00:00+0000', like_count: 40, comments_count: 3, insights: { data: [{ name: 'reach', values: [{ value: 900 }] }, { name: 'saved', values: [{ value: 12 }] }, { name: 'total_interactions', values: [{ value: 62 }] }] } }] })
        return base.deps.get(p, { purpose: 'x', ...x })
      },
      ...over,
    })
    return { c, batch }
  }

  it('métricas da Página numa chamada e insights dos posts aninhados na lista, sem lote', async () => {
    const { c, batch } = withInsights()
    const paths: string[] = []
    const get = c.deps.get; c.deps.get = (async (p: string, x: never) => { paths.push(p); return get(p, x) }) as OrganicDeps['get']
    const out = await collectOrganic(c.deps, acc)
    const s = await snapOf(c.snaps)
    expect(batch).not.toHaveBeenCalled()
    expect(paths.filter(p => p.includes('/insights?metric=page_'))).toHaveLength(1)
    expect(Object.keys(s.fb!.series)).toHaveLength(4)
    expect(s.fb!.posts[0]).toMatchObject({ views: 800, reach: 500 })
    expect(s.ig!.media[0]).toMatchObject({ reach: 900, saves: 12, interactions: 62, likes: 40 })
    for (const p of paths) expect(() => parseRequest(p, cfg), p).not.toThrow()
    expect(out.status === 'done' && out.calls).toBeLessThanOrEqual(27) // eram ~40 (26 com o mês fechado do relatório)
  })

  it('se a Meta recusa o insights aninhado, cai na lista simples + lote', async () => {
    const base = makeDeps()
    const batch = vi.fn(base.deps.batch) as unknown as OrganicDeps['batch'] & ReturnType<typeof vi.fn>
    const c = makeDeps({ batch, get: async (p, x) => (p.includes('insights.metric(') ? res({}, { ok: false, error: { kind: 'client', status: 400, message: 'bad' } }) : base.deps.get(p, { purpose: 'x', ...x })) })
    await collectOrganic(c.deps, acc)
    const s = await snapOf(c.snaps)
    expect(batch).toHaveBeenCalled()
    expect(s.fb!.posts[0]).toMatchObject({ views: 800, reach: 500 })
    expect(s.ig!.media[0]).toMatchObject({ reach: 900 })
  })
})
