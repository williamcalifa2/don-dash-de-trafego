import { describe, expect, it } from 'vitest'
import { MEMBER_ROLES, ROLE_LABEL, cleanSlugs, isMemberRole } from '@/lib/team'
import { roleAtLeast } from '@/lib/admin'

describe('nível Orgânico', () => {
  it('existe como nível de equipe, com nome em português', () => {
    expect(isMemberRole('organic')).toBe(true)
    expect(MEMBER_ROLES).toContain('organic')
    expect(ROLE_LABEL.organic).toBe('Social Media')
  })
  it('não alcança nenhum nível de administração (nem leitor)', () => {
    for (const min of ['reader', 'member', 'admin', 'owner'] as const) expect(roleAtLeast('organic', min)).toBe(false)
    expect(roleAtLeast('reader', 'reader')).toBe(true)
  })
  it('lista de clientes: só endereços válidos, sem repetir', () => {
    expect(cleanSlugs(['magtag', 'magtag', 'Bad Slug', 5, 'becker-floriano', '../x'])).toEqual(['magtag', 'becker-floriano'])
    expect(cleanSlugs('x')).toEqual([])
    expect(cleanSlugs(undefined)).toEqual([])
  })
})
