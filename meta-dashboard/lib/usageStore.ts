/** Identidade de quem está usando o app e gravação das entradas (login). Sem SQL fora de supabase/2026-09-usage-analytics.sql. */
import type { NextRequest } from 'next/server'
import { readSession, SESSION_COOKIE } from './auth'
import { ADMIN_SLUG, ownerEmail, sessionRole } from './admin'
import { getSupabaseServer } from './supabase'
import { geoFromHeaders } from './storeTrack'
import { deviceOf } from './usage'

export interface UsageIdentity { userKey: string; role: string; /** painel do cliente quando é a própria pessoa do cliente */ tenantSlug: string | null }

/** Quem é a pessoa da requisição: equipe (e-mail) ou cliente (e-mail do acesso, ou "cliente:<slug>" no código antigo). */
export async function usageIdentity(req: NextRequest): Promise<UsageIdentity | null> {
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return null
  if (session.s === ADMIN_SLUG) {
    const role = await sessionRole(session)
    if (!role) return null
    return { userKey: (session.m ?? ownerEmail()).toLowerCase(), role, tenantSlug: null }
  }
  return { userKey: session.m ? session.m.toLowerCase() : `cliente:${session.s}`, role: 'client', tenantSlug: session.s }
}

/** Registra uma entrada (ou tentativa) no sistema. Nunca derruba o login: qualquer falha é engolida. */
export async function recordLogin(req: NextRequest, e: { userKey: string; role: string; clientSlug: string | null; ok: boolean }): Promise<void> {
  try {
    const db = getSupabaseServer()
    if (!db) return
    const g = geoFromHeaders(req.headers)
    const w = Number(req.headers.get('sec-ch-viewport-width'))
    const mobile = /mobile|android|iphone/i.test(req.headers.get('user-agent') ?? '')
    await db.from('usage_logins').insert({ user_key: e.userKey.slice(0, 120).toLowerCase(), role: e.role, client_slug: e.clientSlug, ok: e.ok, country: g.country, city: g.city, device: Number.isFinite(w) && w > 0 ? deviceOf(w) : mobile ? 'mobile' : 'desktop' })
  } catch { /* análise de uso é secundária */ }
}
