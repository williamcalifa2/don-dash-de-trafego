import { INSIGHT_FIELDS } from '../meta'
import type { Account, CollectDeps } from './collectors'
import { mergeDaily } from './writeThrough'
import { SUMMARY_PRESETS } from '../adminSummary'

/**
 * "Atualizar tudo" do admin: refaz agora só o que os cards precisam, 6 consultas por conta:
 *  o resumo de cada período (hoje, 7, 14, 30 dias e este mês; é o que o painel do cliente lê) e os últimos dias da série diária (gráfico pequeno).
 * Passa por todos os freios (pausa geral, kill switch, tetos): se algum barrar, para tudo e devolve o motivo.
 */
export interface RefreshAllResult { total: number; refreshed: number; skipped: number; failed: number; stopped?: string }

const CONCURRENCY = 6
type Rows = { data?: Array<Record<string, unknown>> }

export async function refreshCards(d: CollectDeps, accounts: Account[]): Promise<RefreshAllResult> {
  const out: RefreshAllResult = { total: accounts.length, refreshed: 0, skipped: 0, failed: 0 }
  const queue = [...accounts]

  async function one(acc: Account) {
    const st = await d.state.getState(acc.clientId)
    if (st.paused || st.suspended || (st.blockedUntil && st.blockedUntil > d.now())) { out.skipped++; return }
    const ctx = { clientId: acc.clientId, accountId: acc.adAccountId, purpose: 'admin:atualizar-tudo' }
    const got: Array<[string, Record<string, unknown> | null]> = []
    for (const preset of SUMMARY_PRESETS) {
      const r = await d.get<Rows>(`${acc.adAccountId}/insights?fields=${INSIGHT_FIELDS}&date_preset=${preset}`, ctx)
      if (r.blocked) { out.stopped ??= r.blocked; return }
      if (!r.ok || r.dryRun) { out.failed++; return }
      got.push([preset, r.data.data?.[0] ?? null])
    }
    // Conta sem série diária guardada: puxa 30 dias de uma vez (é o que faz a visão geral contar o cliente e o gráfico ter histórico). Com série, só os últimos dias.
    const hasDaily = !!(await d.snaps.get(acc.clientId, 'daily', 'last_30d'))
    const daily = await d.get<Rows>(`${acc.adAccountId}/insights?fields=${INSIGHT_FIELDS}&date_preset=${hasDaily ? 'last_7d' : 'last_30d'}&time_increment=1&limit=${hasDaily ? 10 : 40}`, ctx)
    if (daily.blocked) { out.stopped ??= daily.blocked; return }
    if (!daily.ok) { out.failed++; return }
    const now = d.now()
    for (const [preset, row] of got) await d.snaps.put(acc.clientId, 'summary', preset, { row, prev: null }, now)
    const rows = daily.data.data ?? []
    if (rows.length) await d.snaps.put(acc.clientId, 'daily', 'last_30d', await mergeDaily(d.snaps, acc.clientId, rows), now)
    const cur = await d.state.getState(acc.clientId)
    await d.state.patchState(acc.clientId, { lastSynced: { ...cur.lastSynced, 'insights:today': now, 'insights:daily': now } })
    out.refreshed++
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length && !out.stopped) {
      const acc = queue.shift()!
      try { await one(acc) } catch { out.failed++ }
    }
  }))
  return out
}
