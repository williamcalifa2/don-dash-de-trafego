// Seguro para o proxy (runtime de borda): só usa Web Crypto, sem banco.
export const SESSION_COOKIE = 'dash_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

/** O login por token fica ligado quando existe o segredo de sessão. */
export function authEnabled(): boolean {
  return !!process.env.DASHBOARD_SESSION_SECRET
}

const enc = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const b64 = {
  enc: (s: string) => btoa(String.fromCharCode(...enc.encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
  },
}

export interface SessionPayload {
  /** slug do cliente */
  s: string
  /** início do hash do token (permite revogar trocando o token) */
  h: string
  /** e-mail de quem da equipe da agência entrou na administração (ausente = administrador principal) */
  m?: string
  /** expiração, em ms */
  e: number
}

export async function signSession(payload: Omit<SessionPayload, 'e'>, maxAgeSec = SESSION_MAX_AGE): Promise<string> {
  const body = b64.enc(JSON.stringify({ ...payload, e: Date.now() + maxAgeSec * 1000 }))
  return `${body}.${await hmacHex(process.env.DASHBOARD_SESSION_SECRET ?? '', body)}`
}

export async function readSession(cookie: string | undefined): Promise<SessionPayload | null> {
  const secret = process.env.DASHBOARD_SESSION_SECRET
  if (!cookie || !secret) return null
  const [body, sig] = cookie.split('.')
  if (!body || !sig) return null
  if (!safeEqual(sig, await hmacHex(secret, body))) return null
  try {
    const p = JSON.parse(b64.dec(body)) as SessionPayload
    return p.e > Date.now() && typeof p.s === 'string' && typeof p.h === 'string' ? p : null
  } catch {
    return null
  }
}

export function safeNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard/meta'
}
