import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { allow } from '@/lib/rateLimit'
import { ensureRuntime } from '@/lib/meta/runtime'
import { collectDeps, listAccounts } from '@/lib/meta/pipeline'
import { refreshCards } from '@/lib/meta/refreshCards'
import { StoreNotMigrated } from '@/lib/meta/limits'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** "Atualizar tudo" do painel de controle: busca agora, na Meta, o que os cards de todos os clientes mostram. No máximo 1 vez por minuto. */
export async function POST(req: NextRequest) {
  const denied = await requireRole(req, 'member')
  if (denied) return denied
  if (!allow('admin:refresh-all', 1, 60_000)) return NextResponse.json({ error: 'Já atualizei agora há pouco. Aguarde um minuto e tente de novo.' }, { status: 429 })
  await ensureRuntime()
  try {
    const r = await refreshCards(collectDeps(), await listAccounts())
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof StoreNotMigrated) return NextResponse.json({ error: 'A sincronização ainda não foi preparada (falta rodar o SQL).' }, { status: 503 })
    throw e
  }
}
