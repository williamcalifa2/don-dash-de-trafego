/**
 * Quais clientes cada pessoa da equipe enxerga.
 * - Gestor (e-mail ligado a um gestor cadastrado) só vê a própria carteira.
 * - Administrador e dono que também são gestores começam vendo só a própria carteira e podem alternar para "todos" (continuam com todas as permissões).
 * - Administrador e dono sem gestor, e membro sem gestor cadastrado: veem todos (como sempre foi).
 * Sempre no servidor: a lista, o painel de cada cliente e os relatórios respeitam isso.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requestIdentity } from './admin'
import { loadRegistry } from './activityLog'
import { getMember } from './team'

export const SCOPE_COOKIE = 'dash_scope'

export interface Scope {
  /** clientes visíveis; null = todos */
  slugs: Set<string> | null
  manager: { id: string; name: string } | null
  /** vale só para gestor sem poder de administração: não pode abrir cliente de outro mesmo por endereço direto */
  restricted: boolean
  /** administrador/dono que é gestor pode alternar entre "minhas contas" e "todos" */
  canToggle: boolean
  mode: 'mine' | 'all'
}

const ALL: Scope = { slugs: null, manager: null, restricted: false, canToggle: false, mode: 'all' }

export async function scopeFor(req: NextRequest): Promise<Scope> {
  const who = await requestIdentity(req)
  if (!who) return ALL // sessão de cliente ou sem sessão de administração: não se aplica
  // Nível Orgânico: só os clientes que foram atribuídos à pessoa (lista vazia = nenhum).
  if (who.role === 'organic') {
    const m = await getMember(who.email).catch(() => null)
    return { slugs: new Set(m?.clients ?? []), manager: null, restricted: true, canToggle: false, mode: 'mine' }
  }
  const reg = await loadRegistry().catch(() => null)
  const mine = reg?.managers.find(m => m.email && m.email === who.email) ?? null
  if (!reg || !mine) return ALL
  const carteira = new Set([...reg.byClient.entries()].filter(([, id]) => id === mine.id).map(([slug]) => slug))
  const manager = { id: mine.id, name: mine.name }
  const privileged = who.role === 'owner' || who.role === 'admin'
  if (!privileged) return { slugs: carteira, manager, restricted: true, canToggle: false, mode: 'mine' }
  // Padrão é "todos": administrador/dono que também é gestor só cai em "minhas contas" se escolher isso explicitamente.
  const wantsMine = req.cookies.get(SCOPE_COOKIE)?.value === 'mine'
  return wantsMine ? { slugs: carteira, manager, restricted: false, canToggle: true, mode: 'mine' } : { slugs: null, manager, restricted: false, canToggle: true, mode: 'all' }
}

export const canSee = (s: Scope, slug: string) => !s.slugs || s.slugs.has(slug)

/** Nas rotas de um cliente: barra o gestor que tenta mexer no cliente de outro. Administrador e dono passam (têm poder sobre todos). */
export async function requireClientScope(req: NextRequest, slug: string): Promise<NextResponse | null> {
  const s = await scopeFor(req)
  return s.restricted && !canSee(s, slug) ? NextResponse.json({ error: 'Esse cliente não está na sua carteira.' }, { status: 403 }) : null
}
