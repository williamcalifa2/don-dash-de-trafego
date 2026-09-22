import { collectInsights, collectLeads, type Account } from './collectors'
import { collectDeps, organicDeps, stores } from './pipeline'
import { collectOrganic } from './organic'
import type { DatePreset } from '../meta'

/**
 * "Atualizar na hora" para o administrador e a equipe: busca agora, na Meta, só o período que a pessoa está vendo e os leads recentes.
 * Continua passando por todos os freios (pausa, bloqueio, kill switch, tetos por hora): se algum barrar, devolve o motivo em vez de forçar.
 */
export type RefreshNowResult = { done: boolean; reason?: string }

const running = new Map<string, Promise<RefreshNowResult>>()

export function refreshNow(acc: Account, preset: DatePreset): Promise<RefreshNowResult> {
  const hit = running.get(acc.clientId)
  if (hit) return hit // dois cliques ao mesmo tempo viram uma coleta só
  const p = run(acc, preset).finally(() => running.delete(acc.clientId))
  running.set(acc.clientId, p)
  return p
}

const runningOrganic = new Map<string, Promise<RefreshNowResult>>()

/** Orgânico na hora (admin e equipe): busca de novo a Página e o Instagram deste cliente. */
export function refreshOrganicNow(acc: Account): Promise<RefreshNowResult> {
  const hit = runningOrganic.get(acc.clientId)
  if (hit) return hit
  const p = collectOrganic(organicDeps(), acc)
    .then((o): RefreshNowResult => o.status === 'done' ? { done: true } : { done: false, reason: o.status === 'deferred' ? o.reason : o.status === 'failed' ? o.error : o.status })
    .finally(() => runningOrganic.delete(acc.clientId))
  runningOrganic.set(acc.clientId, p)
  return p
}

async function run(acc: Account, preset: DatePreset): Promise<RefreshNowResult> {
  const d = collectDeps()
  if (d.cfg.dryRun) return { done: false, reason: 'disabled' }
  const st = await stores.limit.getState(acc.clientId)
  if (st.paused || st.suspended) return { done: false, reason: 'paused' }
  if (st.blockedUntil && st.blockedUntil > d.now()) return { done: false, reason: 'blocked' }

  const ins = await collectInsights(d, acc, { force: [preset] })
  if (ins.status === 'deferred') return { done: false, reason: ins.reason }
  if (ins.status === 'failed') return { done: false, reason: ins.error }
  await collectLeads(d, acc).catch(() => {}) // leads é um bônus: falha aqui não desfaz os números já atualizados
  return { done: true }
}
