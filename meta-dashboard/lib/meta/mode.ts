import { metaConfig } from './config'
import { StoreNotMigrated, type AccountState } from './limits'
import { stores } from './stores'
import { ensureRuntime } from './runtime'
import { NextResponse } from 'next/server'

/** true = o painel lê só do banco e nada do painel chama a Meta (corte final: META_LEGACY_LIVE=false). */
export async function snapshotMode(): Promise<boolean> { await ensureRuntime(); return !metaConfig().legacyLive }

/**
 * Origem das consultas que só o admin (ou o cadastro de um cliente) dispara sob demanda: listar contas, importar leads, conferir acesso.
 * Antes do corte final elas usam o caminho antigo; depois do corte (legacy desligado) precisam seguir pela via central, senão são barradas.
 */
export async function liveOrigin(): Promise<'legacy' | 'pipeline'> { await ensureRuntime(); return metaConfig().legacyLive ? 'legacy' : 'pipeline' }

/** Estado da conta para os avisos de "dado velho/bloqueado". Tabelas ausentes = sem estado (não quebra a leitura). */
export async function accountStateOrNull(clientId: string): Promise<AccountState | null> {
  try { return await stores.limit.getState(clientId) } catch (e) { if (e instanceof StoreNotMigrated) return null; throw e }
}

/** Leitura do banco com resposta clara se as tabelas ainda não existem (corte final feito antes de rodar o SQL). */
export async function snapshotGuard(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try { return await fn() } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ error: 'A sincronização com a Meta ainda não foi preparada (falta rodar o SQL no Supabase).' }, { status: 503 })
    throw e
  }
}
