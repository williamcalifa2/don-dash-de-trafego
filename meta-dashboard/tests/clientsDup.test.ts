import { describe, expect, it } from 'vitest'
import { duplicateOf, normName } from '@/lib/clientsDup'

const list = [
  { slug: 'magtag', name: 'MagTag', adAccountId: 'act_111111' },
  { slug: 'becker', name: 'Becker & Floriano', adAccountId: null },
  { slug: 'dal-moro', name: 'Dal Moro Suprimentos', adAccountId: 'act_222222' },
]

describe('duplicateOf', () => {
  it('nome igual não conta acento, maiúscula, espaço nem pontuação', () => {
    expect(normName('  Becker  &   Floriano ')).toBe('beckerfloriano')
    expect(duplicateOf(list, { name: 'becker e floriano' })).toBeNull() // "e" ≠ "&": são nomes diferentes
    expect(duplicateOf(list, { name: 'BECKER & FLORIANO' })).toMatch(/nome/)
    expect(duplicateOf(list, { name: 'Dal  Móro Suprimentos' })).toMatch(/Dal Moro/)
  })
  it('mesmo endereço', () => {
    expect(duplicateOf(list, { slug: 'magtag' })).toMatch(/endereço/)
    expect(duplicateOf(list, { slug: 'novo' })).toBeNull()
  })
  it('mesma conta de anúncios, com ou sem act_', () => {
    expect(duplicateOf(list, { adAccountId: 'act_111111' })).toMatch(/MagTag/)
    expect(duplicateOf(list, { adAccountId: '222222' })).toMatch(/Dal Moro/)
    expect(duplicateOf(list, { adAccountId: 'act_999' })).toBeNull()
    expect(duplicateOf(list, { adAccountId: '' })).toBeNull()
  })
  it('na edição, o próprio cliente não conta como duplicado', () => {
    expect(duplicateOf(list, { slug: 'magtag', name: 'MagTag', adAccountId: 'act_111111' }, 'magtag')).toBeNull()
    expect(duplicateOf(list, { name: 'Becker & Floriano' }, 'magtag')).toMatch(/nome/)
  })
})
