import { describe, expect, it } from 'vitest'
import { cleanState, newToken, TOKEN_RE } from '@/lib/presentation'
import { cleanProfile, nameFromEmail } from '@/lib/adminProfile'
import { cleanPresenterNotes } from '@/lib/reportsLibrary'

describe('apresentação: link do cliente', () => {
  it('código longo, aleatório e só em hexadecimal', () => {
    const a = newToken(), b = newToken()
    expect(a).toMatch(TOKEN_RE); expect(a).not.toBe(b); expect(a).toHaveLength(40)
    expect(TOKEN_RE.test('abc')).toBe(false); expect(TOKEN_RE.test('../../etc/passwd')).toBe(false); expect(TOKEN_RE.test(a.toUpperCase())).toBe(false)
  })
})

describe('apresentação: estado que o cliente recebe', () => {
  it('aceita slide, traços e textos válidos; arredonda e limita', () => {
    const s = cleanState({ slide: 4.9, marks: { 'cover': [
      { t: 'pen', c: '#EF4444', w: 5, p: [[0.1234567, 0.2], [0.5, 0.6], [2, -1]] },
      { t: 'text', c: '#FFFFFF', x: 0.3, y: 0.4, s: 'Ótimo mês', sz: 30 },
    ] } })
    expect(s.slide).toBe(4)
    expect(s.marks.cover[0]).toMatchObject({ t: 'pen', p: [[0.123, 0.2], [0.5, 0.6], [1, 0]] })
    expect(s.marks.cover[1]).toMatchObject({ t: 'text', s: 'Ótimo mês' })
  })
  it('descarta o que não sabe desenhar: script, cor inválida vira padrão, traço com 1 ponto, chave estranha, texto vazio', () => {
    const s = cleanState({ slide: -3, marks: {
      'ok': [{ t: 'pen', c: 'red;alert(1)', w: 999, p: [[0, 0], [1, 1]] }, { t: 'pen', c: '#000000', w: 3, p: [[0.1, 0.1]] }, { t: 'text', c: '#000000', x: 0.1, y: 0.1, s: '   ', sz: 20 }, { t: 'script', src: 'x' }],
      '../etc': [{ t: 'pen', c: '#000000', w: 3, p: [[0, 0], [1, 1]] }],
    } })
    expect(s.slide).toBe(0)
    expect(Object.keys(s.marks)).toEqual(['ok'])
    expect(s.marks.ok).toHaveLength(1); expect(s.marks.ok[0]).toMatchObject({ c: '#EF4444', w: 24 })
  })
  it('limites de tamanho: 800 pontos por traço, 400 marcas no total, texto de 120 caracteres', () => {
    const many = Array.from({ length: 1000 }, (_, i) => [i / 1000, 0.5])
    const s = cleanState({ marks: { a: [{ t: 'pen', c: '#EF4444', w: 4, p: many }, { t: 'text', c: '#EF4444', x: 0.1, y: 0.1, s: 'x'.repeat(500), sz: 20 }] } })
    expect((s.marks.a[0] as { p: unknown[] }).p).toHaveLength(800); expect((s.marks.a[1] as { s: string }).s).toHaveLength(120)
    const big: Record<string, unknown[]> = {}
    for (let k = 0; k < 80; k++) big[`s${k}`] = Array.from({ length: 60 }, () => ({ t: 'pen', c: '#EF4444', w: 4, p: [[0, 0], [1, 1]] }))
    expect(Object.values(cleanState({ marks: big }).marks).flat().length).toBe(400)
    expect(cleanState(null)).toMatchObject({ slide: 0, marks: {} })
  })
})

describe('apresentação: formas e marca-texto', () => {
  it('aceita retângulo, círculo, seta e marca-texto; ignora forma sem tamanho ou com número inválido', () => {
    const s = cleanState({ marks: { a: [
      { t: 'rect', c: '#22C55E', w: 5, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.4 }, { t: 'circle', c: '#22C55E', w: 5, x1: 0.2, y1: 0.2, x2: 0.6, y2: 0.6 }, { t: 'arrow', c: '#FACC15', w: 5, x1: 0.1, y1: 0.9, x2: 0.4, y2: 0.5 },
      { t: 'hl', c: '#FACC15', w: 22, p: [[0.1, 0.1], [0.5, 0.1]] }, { t: 'rect', c: '#22C55E', w: 5, x1: 0.3, y1: 0.3, x2: 0.3, y2: 0.3 }, { t: 'arrow', c: '#22C55E', w: 5, x1: 'x', y1: 0, x2: 1, y2: 1 },
    ] } })
    expect(s.marks.a.map(m => m.t)).toEqual(['rect', 'circle', 'arrow', 'hl'])
  })
})

describe('notas do apresentador e perfil', () => {
  it('notas: só texto por slide, chave segura, limite de tamanho, vazias somem', () => {
    const n = cleanPresenterNotes({ cover: 'Agradecer', 'a b': 'x', bad: 5, empty: '   ', long: 'y'.repeat(5000) })
    expect(Object.keys(n).sort()).toEqual(['cover', 'long']); expect(n.long).toHaveLength(2000)
    expect(cleanPresenterNotes(null)).toEqual({})
  })
  it('perfil: nome enxuto e foto só em imagem base64 pequena', () => {
    expect(cleanProfile({ name: '  Will   Califa  ', avatar: 'data:image/png;base64,AAAA' })).toEqual({ name: 'Will Califa', avatar: 'data:image/png;base64,AAAA' })
    expect(cleanProfile({ name: 'x'.repeat(200), avatar: 'https://evil.example/x.png' })).toEqual({ name: 'x'.repeat(60) })
    expect(cleanProfile({ avatar: 'data:image/svg+xml;base64,AAAA' })).toEqual({}); expect(cleanProfile({ avatar: 'data:image/png;base64,' + 'A'.repeat(200_001) })).toEqual({})
    expect(nameFromEmail('william.califa@dondigital.com.br')).toBe('William Califa')
  })
})
