/** Cliente da Meta do processo, já ligado ao controle de limites persistente (Supabase). */
import { createMetaClient } from './client'
import { createLimitController, type LimitController } from './limits'
import { SupabaseLimitStore } from './store'
import { webhookNotify } from './alerts'
import { metaConfig } from './config'
import { ensureRuntime } from './runtime'

let controller: LimitController | null = null
export function limits(): LimitController {
  return controller ??= createLimitController({ store: new SupabaseLimitStore(), config: metaConfig, notify: webhookNotify })
}

const client = createMetaClient({
  gate: (ctx, req) => limits().gate(ctx, req),
  onResult: (ctx, res, m) => limits().onResult(ctx, res, m),
  record: e => limits().record(e),
})

/** Todo acesso à Meta começa lendo o modo do piloto automático. */
export const meta = {
  async get<T = Record<string, unknown>>(path: string, ctx: Parameters<typeof client.get>[1]) { await ensureRuntime(); return client.get<T>(path, ctx) },
  async batch<T = Record<string, unknown>>(paths: string[], ctx: Parameters<typeof client.batch>[1]) { await ensureRuntime(); return client.batch<T>(paths, ctx) },
}
