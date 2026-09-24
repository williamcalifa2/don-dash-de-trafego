/**
 * Apresentação com duas telas: a do apresentador (equipe, com notas e próximo slide) e a do cliente (link à parte, sem controles),
 * que segue o apresentador. O link do cliente usa um código longo e sem relação com o cliente; só mostra aquele relatório.
 * Tudo fica em meta_settings (sem SQL novo).
 */
import crypto from 'node:crypto'
import { getSupabaseServer } from './supabase'

const tokenKey = (t: string) => `present_token:${t}`
const linkKey = (slug: string, id: string) => `present_link:${slug}:${id}`
const stateKey = (t: string) => `present_state:${t}`

export const TOKEN_RE = /^[a-f0-9]{40}$/

export interface PresentLink { slug: string; id: string; createdAt: number }

export type Shape = 'rect' | 'circle' | 'arrow'
export type Mark =
  | { t: 'pen' | 'hl'; c: string; w: number; p: Array<[number, number]> }
  | { t: Shape; c: string; w: number; x1: number; y1: number; x2: number; y2: number }
  | { t: 'text'; c: string; x: number; y: number; s: string; sz: number }
export interface PresentState { slide: number; marks: Record<string, Mark[]>; at: number }

async function read<T>(key: string): Promise<T | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('meta_settings').select('value').eq('key', key).maybeSingle()
  return ((data as { value: T } | null)?.value ?? null)
}
async function write(key: string, value: unknown): Promise<void> {
  const db = getSupabaseServer()
  if (!db) throw new Error('Banco indisponível')
  const { error } = await db.from('meta_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

export const newToken = () => crypto.randomBytes(20).toString('hex')

/** Link do cliente para este relatório: reaproveita o existente; `rotate` invalida o antigo e cria outro. */
export async function ensureToken(slug: string, id: string, rotate = false): Promise<string> {
  const old = await read<string>(linkKey(slug, id))
  if (old && TOKEN_RE.test(old) && !rotate) return old
  if (old && TOKEN_RE.test(old)) await write(tokenKey(old), null) // link antigo deixa de valer
  const token = newToken()
  await write(tokenKey(token), { slug, id, createdAt: Date.now() } satisfies PresentLink)
  await write(linkKey(slug, id), token)
  return token
}

export async function resolveToken(token: string): Promise<PresentLink | null> {
  if (!TOKEN_RE.test(token)) return null
  const v = await read<PresentLink>(tokenKey(token))
  return v && typeof v.slug === 'string' && typeof v.id === 'string' ? v : null
}

const HEX = /^#[0-9a-fA-F]{6}$/
const KEY = /^[\w-]{1,60}$/
const r3 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000

/** Só aceita o que a tela sabe desenhar, com limites (pontos por traço, marcas por slide e no total, tamanho dos textos). */
export function cleanState(v: unknown): PresentState {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const slide = Math.min(300, Math.max(0, Math.floor(Number(o.slide) || 0)))
  const marks: Record<string, Mark[]> = {}
  let total = 0
  const src = (o.marks && typeof o.marks === 'object' ? o.marks : {}) as Record<string, unknown>
  for (const [k, list] of Object.entries(src).slice(0, 80)) {
    if (!KEY.test(k) || !Array.isArray(list)) continue
    const out: Mark[] = []
    for (const m of list.slice(0, 60) as Array<Record<string, unknown>>) {
      if (total >= 400) break
      const c = typeof m?.c === 'string' && HEX.test(m.c) ? m.c : '#EF4444'
      if ((m?.t === 'rect' || m?.t === 'circle' || m?.t === 'arrow') && [m.x1, m.y1, m.x2, m.y2].every(n => isFinite(Number(n)))) {
        const [x1, y1, x2, y2] = [m.x1, m.y1, m.x2, m.y2].map(n => r3(Number(n)))
        if (Math.hypot(x2 - x1, y2 - y1) > 0.005) { out.push({ t: m.t, c, w: Math.min(24, Math.max(1, Number(m.w) || 4)), x1, y1, x2, y2 }); total++ }
      } else if ((m?.t === 'pen' || m?.t === 'hl') && Array.isArray(m.p)) {
        const p = (m.p as unknown[]).slice(0, 800).flatMap(pt => Array.isArray(pt) && pt.length === 2 && isFinite(Number(pt[0])) && isFinite(Number(pt[1])) ? [[r3(Number(pt[0])), r3(Number(pt[1]))] as [number, number]] : [])
        if (p.length > 1) { out.push({ t: m.t as 'pen' | 'hl', c, w: Math.min(m.t === 'hl' ? 40 : 24, Math.max(1, Number(m.w) || 4)), p }); total++ }
      } else if (m?.t === 'text' && typeof m.s === 'string' && m.s.trim()) {
        out.push({ t: 'text', c, x: r3(Number(m.x)), y: r3(Number(m.y)), s: m.s.slice(0, 120), sz: Math.min(80, Math.max(10, Number(m.sz) || 28)) }); total++
      }
    }
    if (out.length) marks[k] = out
  }
  return { slide, marks, at: Date.now() }
}

export async function saveState(token: string, state: unknown): Promise<PresentState> {
  const s = cleanState(state)
  await write(stateKey(token), s)
  return s
}
export async function getState(token: string): Promise<PresentState> {
  return (await read<PresentState>(stateKey(token))) ?? { slide: 0, marks: {}, at: 0 }
}
