/** Identidade de quem está usando o app e gravação das entradas (login). Sem SQL fora de supabase/2026-09-usage-analytics.sql. */
import type { NextRequest } from 'next/server'
import { readSession, SESSION_COOKIE } from './auth'
import { ADMIN_SLUG, ownerEmail, sessionRole } from './admin'
import { getSupabaseServer } from './supabase'
import { geoFromHeaders } from './storeTrack'
import { deviceOf, SID_RE } from './usage'

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

/**
 * Acesso do cliente registrado pelo servidor: cada vez que o painel dele abre, a sessão de uso passa a existir (mesmo id que o coletor do navegador usa).
 * Se o navegador bloquear o coletor (bloqueador de anúncios, rede), o acesso ainda aparece na análise, só sem o tempo por tela. Nunca derruba a leitura.
 */
export async function notePresence(req: NextRequest, tenantSlug: string): Promise<void> {
  try {
    const sid = req.headers.get('x-usage-sid') ?? ''
    if (!SID_RE.test(sid)) return
    const who = await usageIdentity(req)
    if (!who || who.role !== 'client' || who.tenantSlug !== tenantSlug) return // equipe vendo o painel do cliente não conta como cliente
    const db = getSupabaseServer()
    if (!db) return
    const w = Number(req.headers.get('sec-ch-viewport-width'))
    const mobile = /mobile|android|iphone/i.test(req.headers.get('user-agent') ?? '')
    const g = geoFromHeaders(req.headers)
    await db.from('usage_sessions').upsert({
      sid, user_key: who.userKey, role: 'client', last_seen: new Date().toISOString(), last_view: 'dashboard', last_client: tenantSlug,
      device: Number.isFinite(w) && w > 0 ? deviceOf(w) : mobile ? 'mobile' : 'desktop', country: g.country,
    }, { onConflict: 'sid' })
    // Linha de tela com 0 s: faz o acesso aparecer também na aba do cliente, mesmo sem o tempo medido pelo navegador.
    await db.rpc('usage_add_time', { p_sid: sid, p_client: tenantSlug, p_view: 'dashboard', p_delta: 0 })
  } catch { /* análise de uso é secundária */ }
}
