import { describe, expect, it } from 'vitest'
import { cleanError, heatBins, normalizeBeat, normalizeEvents } from '@/lib/usage'
import { createRageDetector } from '@/lib/usageSignals'
import { frictionByElement, frictionByPerson, groupErrors, percentile, perfByView, scrollBands, scrollByView, type EventRow } from '@/lib/usageQuality'

const row = (o: Partial<EventRow>): EventRow => ({ at: '2026-09-24T12:00:00Z', sid: 's1', user_key: 'ana@x.com', client_slug: 'magtag', view: 'ecommerce', kind: 'rage', sel: 'body>main>button', rx: 0.5, ry: 0.5, n: 1, value: null, label: null, msg: null, meta: null, ...o })

describe('normalizeEvents', () => {
  it('aceita cada tipo com o que ele precisa', () => {
    const ev = normalizeEvents([
      { kind: 'rage', view: 'ecommerce', client: 'magtag', sel: 'body>button', rx: 0.4, ry: 0.6, n: 5, label: 'Salvar' },
      { kind: 'dead', view: 'leads', client: '', sel: 'body>a', rx: 0.1, ry: 0.2 },
      { kind: 'scroll', view: 'metrics', client: 'magtag', value: 63.4 },
      { kind: 'perf', view: 'metrics', client: '', value: 1800.6, meta: { nav: 'load', ttfb: 120, lcp: 900, cls: 0.0123, junk: 'x' } },
      { kind: 'error', view: 'leads', client: '', msg: 'x is undefined', meta: { file: 'app.js', line: 42 } },
    ])
    expect(ev.map(e => e.kind)).toEqual(['rage', 'dead', 'scroll', 'perf', 'error'])
    expect(ev[0]).toMatchObject({ n: 5, label: 'Salvar', sel: 'body>button' })
    expect(ev[2].value).toBe(63)
    expect(ev[3]).toMatchObject({ value: 1801, meta: { nav: 'load', ttfb: 120, lcp: 900, cls: 0.012 } })
    expect(ev[3].meta).not.toHaveProperty('junk')
    expect(ev[4]).toMatchObject({ msg: 'x is undefined', meta: { file: 'app.js', line: 42 } })
  })
  it('descarta o que vem incompleto ou fora de faixa', () => {
    const ev = normalizeEvents([
      { kind: 'rage', sel: 'a', rx: 0.1, ry: 0.1, n: 2 }, // menos de 3 cliques não é raiva
      { kind: 'rage', rx: 0.1, ry: 0.1, n: 4 }, // sem elemento
      { kind: 'dead', sel: 'a'.repeat(301), rx: 0, ry: 0 },
      { kind: 'scroll', value: 'x' },
      { kind: 'perf', value: 99_999 },
      { kind: 'perf', value: -1 },
      { kind: 'error', msg: 'Script error.' },
      { kind: 'error', msg: 'ResizeObserver loop limit exceeded' },
      { kind: 'nope' }, null, 'x',
    ])
    expect(ev).toEqual([])
  })
  it('limita a 40 sinais por batimento e limita a profundidade a 0–100', () => {
    expect(normalizeEvents(Array.from({ length: 80 }, () => ({ kind: 'scroll', value: 250 })))).toHaveLength(40)
    expect(normalizeEvents([{ kind: 'scroll', value: 250 }, { kind: 'scroll', value: -5 }]).map(e => e.value)).toEqual([100, 0])
  })
  it('vai junto no batimento', () => {
    const b = normalizeBeat({ sid: 'abcdef123456', view: 'leads', client: '', w: 1280, entries: [], clicks: [], events: [{ kind: 'scroll', value: 40 }] })
    expect(b?.events).toHaveLength(1)
    expect(normalizeBeat({ sid: 'abcdef123456', view: 'leads', w: 1280 })?.events).toEqual([])
  })
})

describe('cleanError', () => {
  it('tira e-mail, endereço com parâmetros e número comprido', () => {
    expect(cleanError('Falha para ana@x.com')).toBe('Falha para <email>')
    expect(cleanError('GET https://api.x.com/leads?token=abc 500')).toBe('GET https://api.x.com/leads 500')
    expect(cleanError('telefone 11987654321 inválido')).toBe('telefone # inválido')
  })
  it('corta em 160 e ignora ruído', () => {
    expect(cleanError('a'.repeat(300))).toHaveLength(160)
    expect(cleanError('Script error.')).toBeNull()
    expect(cleanError('')).toBeNull()
    expect(cleanError(42)).toBeNull()
  })
})

describe('createRageDetector', () => {
  it('3 cliques no mesmo ponto em sequência viram uma rajada com o total', () => {
    const d = createRageDetector<string>()
    d.feed(100, 100, 0, 'a'); d.feed(102, 101, 300, 'a'); d.feed(99, 100, 600, 'a'); d.feed(101, 99, 900, 'a')
    expect(d.drain(950)).toEqual([]) // ainda em andamento
    expect(d.drain(2500)).toEqual([{ first: 'a', n: 4 }])
    expect(d.drain(9000)).toEqual([])
  })
  it('2 cliques, cliques lentos ou em pontos diferentes não contam', () => {
    const d = createRageDetector<string>()
    d.feed(10, 10, 0, 'a'); d.feed(10, 10, 200, 'a')
    d.feed(300, 300, 5000, 'b'); d.feed(10, 10, 6500, 'c'); d.feed(10, 10, 8000, 'c')
    expect(d.drain(20_000)).toEqual([])
  })
  it('uma rajada seguida de outra em outro ponto sai como duas', () => {
    const d = createRageDetector<string>()
    for (let i = 0; i < 3; i++) d.feed(10, 10, i * 200, 'a')
    for (let i = 0; i < 4; i++) d.feed(500, 500, 1000 + i * 200, 'b')
    expect(d.drain(10_000)).toEqual([{ first: 'a', n: 3 }, { first: 'b', n: 4 }])
  })
  it('force fecha a rajada em andamento (a pessoa saiu da página)', () => {
    const d = createRageDetector<string>()
    for (let i = 0; i < 3; i++) d.feed(10, 10, i * 100, 'a')
    expect(d.drain(300, true)).toEqual([{ first: 'a', n: 3 }])
  })
})

describe('heatBins com peso', () => {
  it('soma o peso de cada linha (rajada de 4 vale 4)', () => {
    expect(heatBins([{ sel: 'a', rx: 0.51, ry: 0.5, n: 4 }, { sel: 'a', rx: 0.52, ry: 0.5 }])[0].n).toBe(5)
  })
})

describe('agregações de qualidade', () => {
  it('percentil', () => {
    expect(percentile([], 75)).toBe(0)
    expect(percentile([1, 2, 3, 4], 50)).toBe(2)
    expect(percentile([1, 2, 3, 4], 75)).toBe(3)
    expect(percentile([5], 99)).toBe(5)
  })
  it('atrito por elemento: conta rajadas, cliques e pessoas', () => {
    const f = frictionByElement([row({ n: 4, label: 'Salvar' }), row({ n: 3, user_key: 'bia@x.com', at: '2026-09-24T13:00:00Z' }), row({ kind: 'dead', sel: 'x' })], 'rage')
    expect(f).toEqual([{ view: 'ecommerce', sel: 'body>main>button', label: 'Salvar', events: 2, clicks: 7, users: 2, last: '2026-09-24T13:00:00Z', who: [{ userKey: 'ana@x.com', n: 1 }, { userKey: 'bia@x.com', n: 1 }] }])
  })
  it('quem mais esbarra em raiva e mortos, com a tela onde mais acontece', () => {
    const p = frictionByPerson([
      row({ n: 4 }), row({ n: 3, view: 'leads' }), row({ kind: 'dead' }),
      row({ user_key: 'bia@x.com', kind: 'dead', view: 'leads' }), row({ kind: 'scroll', value: 50 }),
    ])
    expect(p[0]).toMatchObject({ userKey: 'ana@x.com', rage: 2, rageClicks: 7, dead: 1, topView: 'ecommerce' })
    expect(p[1]).toMatchObject({ userKey: 'bia@x.com', rage: 0, dead: 1, topView: 'leads' })
    expect(p).toHaveLength(2)
  })
  it('erros iguais na mesma tela viram um grupo, com quem viu por último', () => {
    const g = groupErrors([
      row({ kind: 'error', msg: 'boom', at: '2026-09-24T10:00:00Z', meta: { file: 'a.js', line: 3 } }),
      row({ kind: 'error', msg: 'boom', at: '2026-09-24T11:00:00Z', user_key: 'bia@x.com', sid: 's2' }),
      row({ kind: 'error', msg: 'boom', view: 'leads' }),
    ])
    const main = g.find(x => x.view === 'ecommerce')
    expect(main).toMatchObject({ count: 2, sessions: 2, users: 2, lastUser: 'bia@x.com', lastSid: 's2', file: 'a.js', line: 3 })
    expect(g).toHaveLength(2)
  })
  it('desempenho por tela: mediana, p75, lentas e separação carga/aba', () => {
    const p = perfByView([1000, 2000, 3000, 8000].map((v, i) => row({ kind: 'perf', value: v, view: 'metrics', meta: { nav: i === 0 ? 'load' : 'tab', lcp: 700 } })))
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ view: 'metrics', samples: 4, p50: 2000, p75: 3000, slow: 1, loadP75: 1000, tabP75: 8000, lcpP75: 700 })
  })
  it('rolagem: usa o máximo da visita e calcula quantos chegam onde', () => {
    const rows = [row({ kind: 'scroll', sid: 'a', value: 30 }), row({ kind: 'scroll', sid: 'a', value: 100 }), row({ kind: 'scroll', sid: 'b', value: 55 }), row({ kind: 'scroll', sid: 'c', value: 30 })]
    const s = scrollByView(rows)
    expect(s[0]).toMatchObject({ view: 'ecommerce', visits: 3, avg: 62, reach: { 25: 100, 50: 67, 75: 33, 100: 33 } })
    const { visits, bands } = scrollBands(rows, 'ecommerce')
    expect(visits).toBe(3)
    expect(bands).toHaveLength(20)
    expect(bands[0]).toBe(1)
    expect(bands[19]).toBeCloseTo(1 / 3)
    expect(scrollBands(rows, 'nada')).toEqual({ visits: 0, bands: [] })
  })
})
