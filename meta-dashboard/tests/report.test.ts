import { describe, expect, it } from 'vitest'
import { compact, cleanNotes, delta, draftAnalysis, lastMonthOf, monthEndsAt, organicSection, paidStats, topAds, type ReportData } from '@/lib/report'
import { buildSlides, proxied } from '@/lib/reportSlides'
import { buildOrganicView } from '@/lib/meta/organicRead'
import { dayKey, windows, type OrganicSnapshot } from '@/lib/meta/organic'
import type { MetricsSummary } from '@/lib/meta'

const brt = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h + 3)

describe('relatório mensal: mês', () => {
  it('no dia 1 o mês fechado é o anterior inteiro; em qualquer dia do mês também', () => {
    expect(lastMonthOf(brt(2026, 9, 1, 8))).toMatchObject({ key: '2026-08', label: 'agosto de 2026', since: '2026-08-01', until: '2026-08-31' })
    expect(lastMonthOf(brt(2026, 9, 21))).toMatchObject({ key: '2026-08' })
    expect(lastMonthOf(brt(2026, 1, 2))).toMatchObject({ key: '2025-12', since: '2025-12-01', until: '2025-12-31' })
    expect(lastMonthOf(brt(2026, 3, 1, 0))).toMatchObject({ key: '2026-02', until: '2026-02-28' })
  })
  it('a janela "mês anterior" do orgânico é o mês fechado contra o mês antes dele, inteiros', () => {
    const w = windows('2026-09-01')
    expect(w.last_month).toEqual({ cur: ['2026-08-01', '2026-09-01'], prev: ['2026-07-01', '2026-08-01'] })
    expect(windows('2026-03-10').last_month).toEqual({ cur: ['2026-02-01', '2026-03-01'], prev: ['2026-01-01', '2026-02-01'] })
  })
})

describe('relatório mensal: formatação e variação', () => {
  it('números compactos em português', () => {
    expect(compact(9600)).toBe('9,6 mil'); expect(compact(98700)).toBe('98,7 mil'); expect(compact(7900)).toBe('7,9 mil')
    expect(compact(704)).toBe('704'); expect(compact(1_250_000)).toBe('1,25 mi'); expect(compact(null)).toBe('—'); expect(compact(10_400)).toBe('10,4 mil')
  })
  it('variação: só compara com base positiva', () => {
    expect(delta(148, 100)).toBe(48); expect(delta(50, 100)).toBe(-50); expect(delta(10, 0)).toBeNull(); expect(delta(null, 5)).toBeNull()
  })
  it('textos: limita tamanho e ignora o que não é texto', () => {
    expect(cleanNotes({ objective: 'a'.repeat(5000), goals: 3, analysis: 'ok' })).toEqual({ objective: 'a'.repeat(1500), goals: '', analysis: 'ok', next: '' })
    expect(cleanNotes(null)).toEqual({ objective: '', goals: '', analysis: '', next: '' })
  })
})

// ── orgânico do mês fechado ──
const IGW = (cur: Record<string, number>, prev: Record<string, number> | null) => ({ cur, prev })
const series = (from: string, n: number, v: number) => Array.from({ length: n }, (_, i) => ({ d: new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), v }))
const snap = (over: Partial<OrganicSnapshot['ig']> = {}): { payload: OrganicSnapshot; fetchedAt: number } => ({
  fetchedAt: brt(2026, 9, 1, 5),
  payload: {
    status: 'ok', fetchedAt: brt(2026, 9, 1, 5),
    profile: { fb: null, ig: { id: '1', username: 'advfontana', name: null, followers: 1200, follows: 10, mediaCount: 50, picture: null } },
    fb: null,
    ig: {
      reach: [], gained: series('2026-07-01', 62, 10),
      windows: { last_month: IGW({ reach: 9600, views: 98700, total_interactions: 4300, profile_links_taps: 7900, profile_views: 10400 }, { reach: 3870, views: 29200, total_interactions: 800, profile_links_taps: 3950, profile_views: 1600 }) },
      media: [
        { id: 'a', type: 'Reels', caption: 'A', thumb: 'https://x.fbcdn.net/a.jpg', url: null, at: '2026-08-10T12:00:00+0000', likes: 1, comments: 1, reach: 2600, views: 3100, shares: 1, saves: 1, interactions: 150 },
        { id: 'b', type: 'Reels', caption: 'B', thumb: null, url: null, at: '2026-08-20T12:00:00+0000', likes: 1, comments: 1, reach: 2100, views: 2500, shares: 1, saves: 1, interactions: 70 },
        { id: 'c', type: 'Foto', caption: 'C', thumb: null, url: null, at: '2026-09-01T09:00:00+0000', likes: 1, comments: 1, reach: 9999, views: 9999, shares: 1, saves: 1, interactions: 999 },
        { id: 'd', type: 'Foto', caption: 'D', thumb: null, url: null, at: '2026-07-29T09:00:00+0000', likes: 1, comments: 1, reach: 5000, views: 5000, shares: 1, saves: 1, interactions: 500 },
      ],
      stories: [], demo: { age: [], gender: [], city: [], country: [] }, unavailable: [], ...over,
    },
  },
})

describe('relatório mensal: orgânico do mês fechado', () => {
  const now = brt(2026, 9, 1, 8)
  const view = buildOrganicView(snap(), 'last_month', now)
  const org = organicSection(view)

  it('usa o mês inteiro e compara com o mês antes dele', () => {
    expect(view.series.dates).toHaveLength(31); expect(view.series.dates[0]).toBe('2026-08-01'); expect(view.series.dates.at(-1)).toBe('2026-08-31')
    const byLabel = Object.fromEntries(org.stats.map(s => [s.label, s]))
    expect(byLabel['Alcance']).toMatchObject({ value: '9,6 mil', delta: 148.1 })
    expect(byLabel['Visualizações'].value).toBe('98,7 mil')
    expect(byLabel['Visitas ao perfil']).toMatchObject({ value: '10,4 mil', delta: 550 })
    expect(byLabel['Cliques no link'].value).toBe('7,9 mil')
    expect(byLabel['Novos seguidores'].value).toBe('310'); expect(byLabel['Novos seguidores'].delta).toBeCloseTo(0, 0) // 31 dias contra 31 dias
    expect(org.handle).toBe('@advfontana'); expect(org.status).toBe('ok')
  })
  it('só entram publicações do mês fechado (nada de 1º de setembro nem de julho) e o top 3 vem por alcance', () => {
    expect(view.posts.map(p => p.key).sort()).toEqual(['ig:a', 'ig:b'])
    expect(org.top.map(p => p.reach)).toEqual([2600, 2100])
  })
  it('coleta antiga, sem a janela do mês fechado: avisa em vez de mostrar outro período', () => {
    const old = buildOrganicView(snap({ windows: {} }), 'last_month', now)
    expect(organicSection(old).status).toBe('incomplete')
    expect(organicSection(null).status).toBe('pending')
  })
  it('coleta de antes da virada do mês (a janela ainda é a do mês retrasado) não vira relatório', () => {
    const month = lastMonthOf(now)
    expect(monthEndsAt(month)).toBe(Date.UTC(2026, 8, 1, 3)) // 1º de setembro, 00:00 no Brasil
    const fresh = buildOrganicView(snap(), 'last_month', now) // coletado em 1º/set às 05:00 (BRT)
    expect(organicSection(fresh, monthEndsAt(month)).status).toBe('ok')
    const stale = { ...snap(), fetchedAt: brt(2026, 8, 31, 4) }
    expect(organicSection(buildOrganicView(stale, 'last_month', now), monthEndsAt(month)).status).toBe('incomplete')
  })
  it('a aba Orgânico não muda: os novos indicadores não aparecem lá e presets antigos seguem iguais', () => {
    const v7 = buildOrganicView(snap(), 'last_7d', brt(2026, 9, 21))
    expect(v7.series.dates).toHaveLength(7)
    expect(dayKey(now)).toBe('2026-09-01')
  })
})

// ── anúncios ──
const sum = (o: Partial<MetricsSummary>) => ({ spend: 2941.3, reach: 131012, impressions: 320685, frequency: 2.45, link_clicks: 7537, cost_per_link_click: 0.39, ctr: 2.62, cpm: 9.17, results: 34, cost_per_result: 86.5, landing_page_views: 5000, post_engagement: 900, ...o }) as MetricsSummary
describe('relatório mensal: anúncios', () => {
  it('12 números, formatados, com variação e "cair é bom" nos custos', () => {
    const st = paidStats(sum({}), sum({ spend: 2000, cost_per_result: 100 }), 'BRL', 'Conversas', 'Custo por conversa iniciada')
    expect(st).toHaveLength(12)
    expect(st[0]).toMatchObject({ label: 'Investimento', delta: 47.1 }); expect(st[0].value).toMatch(/2\.941,30/)
    expect(st.find(s => s.label === 'Conversas')!.value).toBe('34')
    expect(st.find(s => s.label === 'Custo por conversa iniciada')).toMatchObject({ lowerIsBetter: true, delta: -13.5 })
    expect(paidStats(undefined, undefined, 'BRL', 'x', 'y')).toEqual([])
  })
  const rows = [
    { ad_id: '1', ad_name: 'Vídeo A', adset_name: '', campaign_id: 'c', campaign_name: '', spend: 100, impressions: 1000, clicks: 50, meta_leads: 0, results: 10 },
    { ad_id: '2', ad_name: 'Imagem B', adset_name: '', campaign_id: 'c', campaign_name: '', spend: 50, impressions: 800, clicks: 40, meta_leads: 0, results: 10 },
    { ad_id: '3', ad_name: 'C', adset_name: '', campaign_id: 'c', campaign_name: '', spend: 300, impressions: 5000, clicks: 200, meta_leads: 0, results: 2 },
    { ad_id: '4', ad_name: 'Sem gasto', adset_name: '', campaign_id: 'c', campaign_name: '', spend: 0, impressions: 0, clicks: 0, meta_leads: 0, results: 99 },
    { ad_id: '5', ad_name: 'E', adset_name: '', campaign_id: 'c', campaign_name: '', spend: 10, impressions: 100, clicks: 1, meta_leads: 0, results: 0 },
  ]
  it('top 3: mais resultados, desempate pelo menor custo, ignora anúncio sem gasto, com miniatura do criativo', () => {
    const top = topAds(rows, [{ id: '2', creative: { image_url: 'https://x.fbcdn.net/b.jpg', thumbnail_url: 'https://x.fbcdn.net/t.jpg' } }, { id: '1', creative: { thumbnail_url: 'https://x.fbcdn.net/a.jpg' } }])
    expect(top.map(a => a.id)).toEqual(['2', '1', '3'])
    expect(top[0]).toMatchObject({ thumb: 'https://x.fbcdn.net/b.jpg', costPerResult: 5, ctr: 5 }); expect(top[1].thumb).toBe('https://x.fbcdn.net/a.jpg'); expect(top[2].thumb).toBeNull()
  })
  it('sem nenhum resultado no mês, ordena por cliques', () => {
    expect(topAds(rows.map(r => ({ ...r, results: 0 })), []).map(a => a.id)).toEqual(['3', '1', '2'])
  })
})

describe('relatório mensal: slides', () => {
  const data: ReportData = {
    month: lastMonthOf(brt(2026, 9, 1)), client: { name: 'Advocacia Fontana', logoUrl: null }, currency: 'BRL',
    organic: organicSection(buildOrganicView(snap(), 'last_month', brt(2026, 9, 1, 8))),
    paid: { status: 'ok', resultLabel: 'Conversas', stats: paidStats(sum({}), sum({ spend: 2000 }), 'BRL', 'Conversas', 'Custo por conversa iniciada'), top: topAds([{ ad_id: '1', ad_name: 'A', adset_name: '', campaign_id: 'c', campaign_name: '', spend: 100, impressions: 1000, clicks: 50, meta_leads: 0, results: 10 }], []) },
    notes: { objective: 'Posicionar como referência', goals: '- Alcance', analysis: '', next: '' },
  }
  const slides = buildSlides(data, data.notes)
  it('10 slides, capa com mês e cliente, público, plataformas e textos da equipe editáveis', () => {
    expect(slides.map(s => s.id)).toEqual(['cover', 'objective', 'organic', 'content', 'paid', 'audience', 'platforms', 'creatives', 'analysis', 'next'])
    const cover = slides[0].els.filter(e => e.t === 'text').map(e => (e as { text: string }).text).join(' ')
    expect(cover).toContain('RESULTADOS DE AGOSTO DE 2026'); expect(cover).toContain('ADVOCACIA FONTANA')
    const editable = slides.flatMap(s => s.els).filter(e => e.t === 'text' && e.edit).map(e => (e as { edit: string }).edit)
    expect(editable.sort()).toEqual(['analysis', 'goals', 'next', 'objective'])
  })
  it('tudo cabe no palco 1280 x 720', () => {
    for (const s of slides) for (const e of s.els) { expect(e.x, `${s.id}`).toBeGreaterThanOrEqual(0); expect(e.y).toBeGreaterThanOrEqual(0); expect(e.x + e.w, `${s.id} x`).toBeLessThanOrEqual(1280); expect(e.y + e.h, `${s.id} y`).toBeLessThanOrEqual(720) }
  })
  it('miniaturas passam pelo proxy do app (nunca direto da Meta) e mostram os números', () => {
    expect(proxied('https://x.fbcdn.net/a.jpg')).toBe('/api/report/img?u=https%3A%2F%2Fx.fbcdn.net%2Fa.jpg'); expect(proxied(null)).toBeNull()
    const imgs = slides[3].els.filter(e => e.t === 'img') as Array<{ src: string | null }>
    expect(imgs).toHaveLength(2); expect(imgs[0].src).toContain('/api/report/img?u=')
    expect(slides[3].els.some(e => e.t === 'text' && e.text === '2,6 mil')).toBe(true)
  })
  it('rascunho da análise só afirma o que os dados mostram', () => {
    const text = draftAnalysis(data)
    expect(text).toContain('investimos'); expect(text).toContain('alcance foi de 9,6 mil (+148,1% contra o mês anterior)'); expect(text).toContain('um Reels')
    expect(draftAnalysis({ ...data, paid: { status: 'pending', resultLabel: 'x', stats: [], top: [] }, organic: { status: 'pending', handle: null, stats: [], top: [] } })).toBe('')
  })
  it('sem dados do mês: slides avisam em vez de mostrar zeros', () => {
    const empty = buildSlides({ ...data, paid: { status: 'pending', resultLabel: 'x', stats: [], top: [] }, organic: { status: 'incomplete', handle: null, stats: [], top: [] } }, data.notes)
    const txt = (i: number) => empty[i].els.filter(e => e.t === 'text').map(e => (e as { text: string }).text).join(' ')
    expect(txt(2)).toContain('ainda não foram coletados'); expect(txt(4)).toContain('ainda não foram buscados')
  })
})
