import { describe, expect, it } from 'vitest'
import { cleanLabel, deviceOf, fmtDuration, topElements, heatBins, isOnline, normalizeBeat, summarizeUsage, usageSince, viewLabel, type SessionRow, type ViewRow } from '@/lib/usage'

const NOW = Date.parse('2026-09-24T15:00:00Z')
const ago = (s: number) => new Date(NOW - s * 1000).toISOString()

describe('normalizeBeat', () => {
  const base = { sid: 'abcdef123456', view: 'leads', client: 'magtag', w: 1280, entries: [{ client: 'magtag', view: 'leads', delta: 14 }], clicks: [{ sel: 'body>main>button', rx: 0.5, ry: 0.25 }] }
  it('aceita um batimento válido e define o tipo de aparelho pela largura', () => {
    const b = normalizeBeat(base)
    expect(b).toMatchObject({ sid: 'abcdef123456', view: 'leads', client: 'magtag', device: 'desktop' })
    expect(b?.entries).toEqual([{ client: 'magtag', view: 'leads', delta: 14 }])
    expect(b?.clicks).toEqual([{ sel: 'body>main>button', rx: 0.5, ry: 0.25, view: null, client: null, label: null }])
    expect(normalizeBeat({ ...base, w: 390 })?.device).toBe('mobile')
  })
  it('recusa sessão ou tela inválidas', () => {
    expect(normalizeBeat({ ...base, sid: 'a b' })).toBeNull()
    expect(normalizeBeat({ ...base, view: 'Leads!' })).toBeNull()
    expect(normalizeBeat(null)).toBeNull()
    expect(normalizeBeat('x')).toBeNull()
  })
  it('limita o tempo por batimento e descarta entradas ruins', () => {
    const b = normalizeBeat({ ...base, entries: [{ client: 'magtag', view: 'leads', delta: 9999 }, { client: 'x y', view: 'leads', delta: 5 }, { client: '', view: 'admin', delta: 0 }, { client: '', view: 'admin', delta: 7 }] })
    expect(b?.entries).toEqual([{ client: 'magtag', view: 'leads', delta: 30 }, { client: '', view: 'admin', delta: 7 }])
  })
  it('descarta clique sem posição, fora de 0–1 vira limite, seletor enorme cai', () => {
    const b = normalizeBeat({ ...base, clicks: [{ sel: '', rx: 0.1, ry: 0.1 }, { sel: 'a', rx: 'x', ry: 0.1 }, { sel: 'b', rx: 2, ry: -1 }, { sel: 'c'.repeat(301), rx: 0.1, ry: 0.1 }] })
    expect(b?.clicks).toEqual([{ sel: 'b', rx: 1, ry: 0, view: null, client: null, label: null }])
  })
  it('cliente inválido no topo vira vazio; no máximo 100 cliques por lote', () => {
    expect(normalizeBeat({ ...base, client: '../etc' })?.client).toBe('')
    expect(normalizeBeat({ ...base, clicks: Array.from({ length: 150 }, () => ({ sel: 'a', rx: 0.1, ry: 0.1 })) })?.clicks).toHaveLength(100)
  })
})

describe('deviceOf, isOnline, viewLabel, fmtDuration', () => {
  it('classifica largura', () => { expect(deviceOf(1440)).toBe('desktop'); expect(deviceOf(800)).toBe('tablet'); expect(deviceOf(375)).toBe('mobile') })
  it('online = sinal nos últimos 50 s', () => { expect(isOnline(ago(30), NOW)).toBe(true); expect(isOnline(ago(80), NOW)).toBe(false) })
  it('nome amigável da tela, com fallback', () => { expect(viewLabel('ecommerce')).toBe('E-commerce'); expect(viewLabel('admin/heatmap')).toBe('Heatmap'); expect(viewLabel('xyz')).toBe('xyz') })
  it('formata duração', () => { expect(fmtDuration(45)).toBe('45s'); expect(fmtDuration(600)).toBe('10 min'); expect(fmtDuration(3900)).toBe('1 h 05 min') })
})

describe('summarizeUsage', () => {
  const s = (sid: string, user: string, role: string, seen: number, active: number, view: string | null, client: string | null): SessionRow => ({ sid, user_key: user, role, started_at: ago(3600), last_seen: ago(seen), active_sec: active, last_view: view, last_client: client, device: 'desktop' })
  const sessions = [s('a1', 'ana@x.com', 'admin', 10, 600, 'leads', 'magtag'), s('a2', 'ana@x.com', 'admin', 5000, 300, 'admin', null), s('b1', 'bia@x.com', 'member', 4000, 120, 'metrics', 'becker')]
  const views: ViewRow[] = [
    { sid: 'a1', client_slug: 'magtag', view: 'leads', seconds: 500 }, { sid: 'a1', client_slug: 'magtag', view: 'ecommerce', seconds: 100 },
    { sid: 'a2', client_slug: '', view: 'admin', seconds: 300 }, { sid: 'b1', client_slug: 'becker', view: 'metrics', seconds: 120 },
  ]
  it('KPIs, presença e pessoas', () => {
    const r = summarizeUsage(sessions, views, NOW)
    expect(r.kpis).toEqual({ online: 1, sessions: 3, activeSec: 1020, users: 2 })
    expect(r.online).toHaveLength(1)
    expect(r.online[0]).toMatchObject({ userKey: 'ana@x.com', view: 'leads', client: 'magtag' })
    expect(r.people[0]).toMatchObject({ userKey: 'ana@x.com', sessions: 2, activeSec: 900, topClient: 'magtag', topView: 'leads' })
  })
  it('tempo por cliente e por tela, somando pessoas distintas', () => {
    const r = summarizeUsage(sessions, views, NOW)
    expect(r.byClient).toEqual([{ slug: 'magtag', sec: 600, users: 1 }, { slug: 'becker', sec: 120, users: 1 }])
    expect(r.byView.map(v => [v.view, v.sec])).toEqual([['leads', 500], ['admin', 300], ['metrics', 120], ['ecommerce', 100]])
  })
  it('filtro por pessoa muda só os blocos de tempo, não a lista de pessoas', () => {
    const r = summarizeUsage(sessions, views, NOW, 'bia@x.com')
    expect(r.byClient).toEqual([{ slug: 'becker', sec: 120, users: 1 }])
    expect(r.people).toHaveLength(2)
  })
  it('sem dados devolve zeros', () => {
    expect(summarizeUsage([], [], NOW).kpis).toEqual({ online: 0, sessions: 0, activeSec: 0, users: 0 })
  })
})

describe('heatBins e usageSince', () => {
  it('agrupa cliques do mesmo elemento em quadrinhos e ordena pelo mais clicado', () => {
    const r = heatBins([{ sel: 'a', rx: 0.51, ry: 0.5 }, { sel: 'a', rx: 0.52, ry: 0.53 }, { sel: 'a', rx: 0.9, ry: 0.9 }, { sel: 'b', rx: 0.51, ry: 0.5 }])
    expect(r[0]).toMatchObject({ sel: 'a', n: 2 })
    expect(r).toHaveLength(3)
  })
  it('respeita o limite e ignora vazio', () => {
    expect(heatBins([])).toEqual([])
    expect(heatBins([{ sel: 'a', rx: 0, ry: 0 }, { sel: 'b', rx: 0, ry: 0 }], 1)).toHaveLength(1)
  })
  it('período em dias corridos no horário do Brasil', () => {
    expect(new Date(usageSince('today', NOW)).toISOString()).toBe('2026-09-24T03:00:00.000Z')
    expect(new Date(usageSince('7', NOW)).toISOString()).toBe('2026-09-18T03:00:00.000Z')
    expect(new Date(usageSince('30', NOW)).toISOString()).toBe('2026-08-26T03:00:00.000Z')
  })
})

import { buildVisits, focusClient } from '@/lib/usage'

describe('focusClient e buildVisits (quem acessou um cliente)', () => {
  const s = (sid: string, user: string, startedSecAgo: number, active: number): SessionRow => ({ sid, user_key: user, role: 'admin', started_at: ago(startedSecAgo), last_seen: ago(5), active_sec: active, last_view: 'leads', last_client: 'magtag', device: 'desktop' })
  const sessions = [s('s1', 'ana@x.com', 7200, 900), s('s2', 'bia@x.com', 3600, 400), s('s3', 'ana@x.com', 100, 50)]
  const views: ViewRow[] = [
    { sid: 's1', client_slug: 'magtag', view: 'leads', seconds: 500 }, { sid: 's1', client_slug: 'magtag', view: 'ecommerce', seconds: 200 }, { sid: 's1', client_slug: 'becker', view: 'metrics', seconds: 200 },
    { sid: 's2', client_slug: 'becker', view: 'metrics', seconds: 400 },
    { sid: 's3', client_slug: 'magtag', view: 'campaigns', seconds: 50 },
  ]
  it('recorta para um cliente e usa só o tempo dentro dele', () => {
    const f = focusClient(sessions, views, 'magtag')
    expect(f.sessions.map(x => [x.sid, x.active_sec])).toEqual([['s1', 700], ['s3', 50]])
    expect(f.views.every(v => v.client_slug === 'magtag')).toBe(true)
    const r = summarizeUsage(f.sessions, f.views, NOW)
    expect(r.kpis).toMatchObject({ sessions: 2, activeSec: 750, users: 1 })
    expect(r.byView.map(v => [v.view, v.sec])).toEqual([['leads', 500], ['ecommerce', 200], ['campaigns', 50]])
    expect(r.people[0]).toMatchObject({ userKey: 'ana@x.com', sessions: 2, activeSec: 750 })
  })
  it('cliente sem acesso devolve vazio', () => {
    const f = focusClient(sessions, views, 'dal-moro')
    expect(f.sessions).toEqual([]); expect(summarizeUsage(f.sessions, f.views, NOW).kpis.users).toBe(0)
  })
  it('um acesso por sessão, do mais recente ao mais antigo, com as telas da que mais prendeu à que menos', () => {
    const f = focusClient(sessions, views, 'magtag')
    const v = buildVisits(f.sessions, f.views)
    expect(v.map(x => x.sid)).toEqual(['s3', 's1'])
    expect(v[1]).toMatchObject({ seconds: 700, topView: 'leads' })
    expect(v[1].views).toEqual([{ view: 'leads', sec: 500 }, { view: 'ecommerce', sec: 200 }])
  })
  it('respeita o limite', () => {
    const f = focusClient(sessions, views, 'magtag')
    expect(buildVisits(f.sessions, f.views, 1)).toHaveLength(1)
  })
})


describe('cliques com tela, cliente e rótulo', () => {
  const base = { sid: 'abcdef123456', view: 'leads', client: 'magtag', w: 1280, entries: [] }
  it('guarda a tela e o cliente do instante do clique (o lote pode sair depois de trocar de tela)', () => {
    const b = normalizeBeat({ ...base, clicks: [{ sel: 'a', rx: 0.1, ry: 0.2, view: 'ecommerce/live', client: 'becker', label: 'Novo lead' }] })
    expect(b?.clicks[0]).toMatchObject({ view: 'ecommerce/live', client: 'becker', label: 'Novo lead' })
  })
  it('tela ou cliente inválidos no clique viram nulos, não derrubam o clique', () => {
    const b = normalizeBeat({ ...base, clicks: [{ sel: 'a', rx: 0.1, ry: 0.2, view: 'A B', client: '../x' }] })
    expect(b?.clicks[0]).toMatchObject({ view: null, client: null })
  })
  it('rótulo com e-mail, número comprido ou texto longo é descartado', () => {
    expect(cleanLabel('Novo lead')).toBe('Novo lead')
    expect(cleanLabel('  Exportar   CSV ')).toBe('Exportar CSV')
    expect(cleanLabel('ana@x.com')).toBeNull()
    expect(cleanLabel('Ligar 11999998888')).toBeNull()
    expect(cleanLabel('x'.repeat(41))).toBeNull()
    expect(cleanLabel('')).toBeNull()
    expect(cleanLabel(42)).toBeNull()
  })
  it('nome amigável de janelas e sub-abas', () => {
    expect(viewLabel('ecommerce/live')).toBe('E-commerce › Live View')
    expect(viewLabel('leads/detalhe-do-lead')).toBe('Leads › Detalhe do lead')
    expect(viewLabel('admin/reports/novo-relatorio')).toBe('Report Studio (equipe) › Novo relatorio')
    expect(viewLabel('admin/clientes')).toBe('Painel › Clientes')
    expect(viewLabel('admin/reports')).toBe('Report Studio (equipe)')
  })
  it('elementos mais clicados, com o nome do botão', () => {
    const r = topElements([{ sel: 'a', label: 'Novo lead' }, { sel: 'a', label: 'Novo lead' }, { sel: 'b', label: null }, { sel: 'a', label: 'Novo lead' }])
    expect(r).toEqual([{ sel: 'a', label: 'Novo lead', n: 3 }, { sel: 'b', label: null, n: 1 }])
    expect(topElements([{ sel: 'a' }, { sel: 'b' }], 1)).toHaveLength(1)
  })
})

import { activityBreakdown, clientsWithoutTeamAccess } from '@/lib/usage'

describe('activityBreakdown e clientsWithoutTeamAccess', () => {
  const s = (sid: string, role: string, startedIso: string, active: number, device = 'desktop'): SessionRow => ({ sid, user_key: sid + '@x.com', role, started_at: startedIso, last_seen: startedIso, active_sec: active, last_view: null, last_client: null, device })
  it('soma por dia e por hora no horário do Brasil, com dias vazios em zero', () => {
    const now = Date.parse('2026-09-24T15:00:00Z')
    const since = Date.parse('2026-09-22T03:00:00Z')
    const r = activityBreakdown([s('a', 'admin', '2026-09-24T14:10:00Z', 600), s('b', 'admin', '2026-09-24T02:30:00Z', 300, 'mobile'), s('c', 'admin', '2026-09-22T12:00:00Z', 100, 'tablet')], since, now)
    expect(r.daily.map(d => d.day)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24'])
    expect(r.daily[0]).toEqual({ day: '2026-09-22', sec: 100, sessions: 1 })
    expect(r.daily[1]).toEqual({ day: '2026-09-23', sec: 300, sessions: 1 }) // 02:30 UTC ainda é 23/09 no Brasil
    expect(r.daily[2]).toEqual({ day: '2026-09-24', sec: 600, sessions: 1 })
    expect(r.hours[11]).toBe(1) // 14:10 UTC = 11:10 no Brasil
    expect(r.hours[23]).toBe(1)
    expect(r.devices).toEqual({ desktop: 1, tablet: 1, mobile: 1 })
  })
  it('sem sessões devolve zeros', () => {
    const r = activityBreakdown([], Date.parse('2026-09-24T03:00:00Z'), Date.parse('2026-09-24T15:00:00Z'))
    expect(r.daily).toEqual([{ day: '2026-09-24', sec: 0, sessions: 0 }])
    expect(r.hours.every(h => h === 0)).toBe(true)
  })
  it('clientes sem tempo da equipe no período; tempo do próprio cliente não conta', () => {
    const sess = [s('t', 'admin', ago(10), 0), s('c', 'client', ago(10), 0)]
    const views: ViewRow[] = [{ sid: 't', client_slug: 'magtag', view: 'leads', seconds: 60 }, { sid: 'c', client_slug: 'becker', view: 'leads', seconds: 999 }, { sid: 't', client_slug: 'dal', view: 'leads', seconds: 0 }]
    const idle = clientsWithoutTeamAccess([{ slug: 'magtag', name: 'MagTag' }, { slug: 'becker', name: 'Becker' }, { slug: 'dal', name: 'Dal' }], sess, views)
    expect(idle.map(c => c.slug)).toEqual(['becker', 'dal'])
  })
})
