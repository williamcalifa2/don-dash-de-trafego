import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const SKIP = new Set(['node_modules', '.next', '.vercel', 'tests', 'supabase', '.git'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p)
  }
  return out
}

const files = ['app', 'lib', 'components', 'proxy.ts'].flatMap(f => {
  const p = join(ROOT, f)
  try { return statSync(p).isDirectory() ? walk(p) : [p] } catch { return [] }
})
const outside = files.filter(f => !relative(ROOT, f).startsWith('lib/meta/'))

describe('nada fala com a Meta fora do cliente central', () => {
  it('nenhum arquivo fora de lib/meta/ cita o host da Graph API', () => {
    const bad = outside.filter(f => /graph\.facebook\.com/.test(readFileSync(f, 'utf8')))
    expect(bad.map(f => relative(ROOT, f))).toEqual([])
  })
  it('ninguém monta URL com access_token fora de lib/meta/', () => {
    const bad = outside.filter(f => /access_token=/.test(readFileSync(f, 'utf8')))
    expect(bad.map(f => relative(ROOT, f))).toEqual([])
  })
  it('não existe código de escrita na Meta (POST/DELETE em graph, subscribed_apps)', () => {
    const bad = outside.filter(f => /subscribed_apps\?|method:\s*'(POST|PUT|DELETE)'[^}]*graph/i.test(readFileSync(f, 'utf8')))
    expect(bad.map(f => relative(ROOT, f))).toEqual([])
  })
  it('arquivos do cliente central foram encontrados (guarda contra teste vazio)', () => {
    expect(files.length).toBeGreaterThan(20)
  })
})
