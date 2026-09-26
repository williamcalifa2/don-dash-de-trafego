/** Extensão do navegador: avisa o app quando um gestor abre uma conta de anúncios da agência no Gerenciador da Meta. */
import crypto from 'node:crypto'
import { getMember } from './team'
import { loadRegistry } from './activityLog'
import { ownerEmail } from './admin'

const secret = () => process.env.DASHBOARD_SESSION_SECRET ?? ''
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const mac = (email: string) => crypto.createHmac('sha256', secret()).update(`ext1:${email}`).digest('hex').slice(0, 40)

/** Token pessoal da extensão: o e-mail e uma assinatura dele. Só vale enquanto a pessoa continuar na equipe. */
export function extToken(email: string): string {
  const e = email.trim().toLowerCase()
  return `${b64(e)}.${mac(e)}`
}

/** E-mail dono do token, se a assinatura confere e a pessoa ainda faz parte (dono, membro ou gestor cadastrado). */
export async function verifyExtToken(token: string | null | undefined): Promise<string | null> {
  if (!token || !secret() || token.length > 400) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  let email: string
  try { email = Buffer.from(body, 'base64url').toString('utf8').trim().toLowerCase() } catch { return null }
  if (!email || email.length > 120) return null
  const want = Buffer.from(mac(email)), got = Buffer.from(sig)
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null
  if (email === ownerEmail()) return email
  if (await getMember(email).catch(() => null)) return email
  const reg = await loadRegistry().catch(() => null)
  return reg?.managers.some(m => m.email === email) ? email : null
}

/** Conta de anúncios (só dígitos) da URL do Gerenciador: `?act=123` (campanhas, conjuntos, anúncios) ou, na cobrança, `asset_id`/`payment_account_id`. */
export function actFromUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' || !/^(business|adsmanager)\.facebook\.com$/.test(u.hostname)) return null
  const id = u.searchParams.get('act') ?? (/billing_hub|adsmanager|ads\//.test(u.pathname) ? u.searchParams.get('payment_account_id') ?? u.searchParams.get('asset_id') : null)
  return id && /^\d{5,25}$/.test(id) ? id : null
}

export interface Visit { visit: string; act: string; sec: number }

/** Corpo do aviso: id da visita (gerado pela extensão), conta e segundos ativos desde o último aviso. */
export function normalizeVisit(body: unknown): Visit | null {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const visit = typeof o.visit === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(o.visit) ? o.visit : null
  const act = typeof o.act === 'string' && /^\d{5,25}$/.test(o.act) ? o.act : null
  const n = Number(o.sec)
  if (!visit || !act || !Number.isFinite(n)) return null
  return { visit, act, sec: Math.max(0, Math.min(120, Math.round(n))) }
}
