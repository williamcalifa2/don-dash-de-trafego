import { describe, expect, it } from 'vitest'
import { decodeLogo, logoPublicUrl, MAX_LOGO_CHARS, parseLogoInput } from '@/lib/logo'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('logo do cliente (arquivo)', () => {
  it('aceita imagem pequena PNG/JPG/WebP, link https, e vazio (remove)', () => {
    expect(parseLogoInput(PNG)).toEqual({ ok: true, value: PNG })
    expect(parseLogoInput('data:image/webp;base64,AAAA')).toMatchObject({ ok: true })
    expect(parseLogoInput('https://cdn.exemplo.com/logo.png')).toMatchObject({ ok: true })
    expect(parseLogoInput('')).toEqual({ ok: true, value: null }); expect(parseLogoInput(null)).toEqual({ ok: true, value: null })
  })
  it('o endereço do logo atual (/api/logo/...) significa "sem mudança"', () => {
    expect(parseLogoInput('/api/logo/becker?v=abc12345')).toEqual({ ok: true, value: null, unchanged: true })
  })
  it('recusa SVG/HTML embutido, tipos estranhos, http simples, lixo e imagem grande demais', () => {
    for (const v of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,PGgxPg==', 'data:image/png;base64,***', 'http://x.com/a.png', 'javascript:alert(1)', 'logo.png'])
      expect(parseLogoInput(v).ok, v).toBe(false)
    expect(parseLogoInput('data:image/png;base64,' + 'A'.repeat(MAX_LOGO_CHARS)).ok).toBe(false)
  })
  it('as telas recebem um endereço curto para arquivo e o link original para link', () => {
    const u = logoPublicUrl('becker', PNG)!
    expect(u).toMatch(/^\/api\/logo\/becker\?v=[0-9a-f]{8}$/)
    expect(logoPublicUrl('becker', PNG)).toBe(u) // estável (cache do navegador)
    expect(logoPublicUrl('becker', PNG.replace('AAAA', 'BBBB'))).not.toBe(u) // trocou o arquivo: novo endereço
    expect(logoPublicUrl('becker', 'https://cdn/x.png')).toBe('https://cdn/x.png')
    expect(logoPublicUrl('becker', null)).toBeNull()
  })
  it('decodifica de volta para bytes de imagem', () => {
    const d = decodeLogo(PNG)!
    expect(d.mime).toBe('image/png'); expect(d.bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(decodeLogo('https://x')).toBeNull()
  })
})
