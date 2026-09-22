import crypto from 'node:crypto'

/** Código de acesso do cliente: 6 dígitos. */
export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Hash do código, preso ao cliente e ao segredo do servidor (o banco sozinho não basta para adivinhar). */
export function codeHash(slug: string, code: string): string {
  return crypto.createHmac('sha256', process.env.DASHBOARD_SESSION_SECRET ?? '').update(`code:${slug}:${code}`).digest('hex')
}

export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

const recovered = new Map<string, { code: string | null; at: number }>()
const RECOVER_TTL = 5 * 60_000

/**
 * Recupera o código de 6 dígitos a partir do hash (o servidor conhece o segredo; são só 1 milhão de combinações, ~2 s em média).
 * Só para o administrador rever o código de um cliente. Devolve null se o hash não bate (ex.: segredo trocado).
 * A proteção real do login é o bloqueio por tentativas, não o sigilo do hash.
 */
export async function recoverCode(slug: string, hash: string): Promise<string | null> {
  const key = `${slug}:${hash}`
  const hit = recovered.get(key)
  if (hit && Date.now() - hit.at < RECOVER_TTL) return hit.code
  let found: string | null = null
  for (let i = 0; i < 1_000_000 && !found; i++) {
    const code = String(i).padStart(6, '0')
    if (hashesEqual(codeHash(slug, code), hash)) found = code
    if (i % 100_000 === 99_999) await new Promise(r => setImmediate(r)) // não trava o servidor por completo
  }
  recovered.set(key, { code: found, at: Date.now() })
  return found
}
