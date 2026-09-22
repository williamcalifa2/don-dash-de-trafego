import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { liveOrigin } from '@/lib/meta/mode'
import { friendlyLiveError } from '@/lib/meta/staleFallback'
import { stores } from '@/lib/meta/stores'
import { FRESH_MS, fetchAccounts, readAccountsCache } from '@/lib/metaAccountsList'

export const dynamic = 'force-dynamic'

/**
 * Contas de anúncios e páginas que o token do Meta enxerga (para escolher ao cadastrar cliente).
 * A lista fica guardada: se a Meta estiver em pausa por proteção (kill switch) ou falhar, mostra a última lista salva em vez de uma lista vazia.
 */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const cached = await readAccountsCache().catch(() => null)
  const fromCache = (why: string) => NextResponse.json({ accounts: cached?.accounts ?? [], pages: cached?.pages ?? [], cachedAt: cached?.at ?? null, error: why })

  // Lista recente: nem chama a Meta.
  if (cached?.accounts.length && Date.now() - cached.at < FRESH_MS) return NextResponse.json({ accounts: cached.accounts, pages: cached.pages, cachedAt: null })
  if (!process.env.META_ACCESS_TOKEN) return fromCache('META_ACCESS_TOKEN não configurado')

  const { cache, error } = await fetchAccounts(await liveOrigin())
  if (cache) return NextResponse.json({ accounts: cache.accounts, pages: cache.pages, cachedAt: null })

  let why = friendlyLiveError(error ?? '')
  if (/kill_switch/.test(error ?? '')) {
    const kill = await stores.limit.getSetting<{ until: number }>('kill').catch(() => null)
    const min = kill && kill.until > Date.now() ? Math.ceil((kill.until - Date.now()) / 60_000) : 0
    why = `A Meta está em pausa por proteção${min ? ` (volta em cerca de ${min} min)` : ''}.`
  }
  return fromCache(why)
}
