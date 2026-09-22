/**
 * Piloto automático do rollout. Substitui o "ligar conta / avançar fase" manual, com os mesmos critérios:
 *   fase 0 (simulação) -> 1 (1 conta) -> 2 (até 5) -> 3 (todas) -> corte final (painel só lê o banco).
 * Cada etapa só avança depois de N horas de observação LIMPA (zero erros de limite, uso abaixo do teto, token ok, sem kill/suspensão).
 * Qualquer problema faz recuar uma etapa sozinho e recomeçar a observação. Sem intervenção humana.
 */
import type { MetaConfig } from './config'

export interface AutopilotState {
  phase: number
  /** início da etapa atual (ms) */
  since: number
  /** true = painel lê só do banco (legacy desligado) */
  cutover: boolean
  lastEval: number
}

export const AUTOPILOT_KEY = 'autopilot'
export const initialAutopilot = (now: number): AutopilotState => ({ phase: 0, since: now, cutover: false, lastEval: 0 })

/** Modo efetivo que o resto do sistema deve usar. */
export function runtimeFor(st: AutopilotState) {
  return { dryRun: st.phase === 0, phase: st.phase, legacyLive: !st.cutover }
}

export interface Observation { hasData: boolean; rateLimitErrors: number; peakAccountPct: number; peakAppPct: number }
export interface Health { tokenOk: boolean; killActive: boolean; suspendedCount: number; allFresh: boolean }

export type AutopilotEvent =
  | { kind: 'advance' | 'regress'; from: number; to: number; reason: string }
  | { kind: 'cutover' | 'rollback_cutover'; reason: string }

const MAX_PHASE = 3

export function evaluateAutopilot(st: AutopilotState, obs: Observation, h: Health, cfg: Pick<MetaConfig, 'autopilotStageHours' | 'advancePeakPct' | 'usageThresholdPct'>, now: number): { state: AutopilotState; event?: AutopilotEvent } {
  const next: AutopilotState = { ...st, lastEval: now }

  // Problemas: recuam uma etapa e reiniciam a observação.
  const problems: string[] = []
  if (obs.rateLimitErrors > 0) problems.push(`${obs.rateLimitErrors} erro(s) de limite da Meta`)
  if (h.killActive) problems.push('kill switch acionado')
  if (h.suspendedCount > 0) problems.push(`${h.suspendedCount} conta(s) suspensa(s)`)
  if (Math.max(obs.peakAccountPct, obs.peakAppPct) >= cfg.usageThresholdPct) problems.push('uso da cota acima do limiar de bloqueio')
  if (problems.length) {
    const reason = problems.join('; ')
    // Depois do corte o painel só lê o banco. Limite da Meta ou kill switch já pausam a coleta sozinhos; voltar ao modo ao vivo
    // faria os clientes consultarem a Meta justamente quando ela pediu calma. Então o corte fica: o cliente vê o último dado, com aviso.
    if (st.cutover) return { state: next }
    if (st.phase > 0) return { state: { ...next, phase: st.phase - 1, since: now }, event: { kind: 'regress', from: st.phase, to: st.phase - 1, reason } }
    return { state: { ...next, since: now } } // já na simulação: só reinicia o relógio
  }

  // Avanço: tempo suficiente + dados + uso baixo + token ok.
  const stageDone = now - st.since >= cfg.autopilotStageHours * 3_600_000
  const clean = obs.hasData && Math.max(obs.peakAccountPct, obs.peakAppPct) < cfg.advancePeakPct && h.tokenOk
  if (!stageDone || !clean) return { state: next }

  if (st.phase < MAX_PHASE) return { state: { ...next, phase: st.phase + 1, since: now }, event: { kind: 'advance', from: st.phase, to: st.phase + 1, reason: `${cfg.autopilotStageHours} h limpas` } }
  // Fase 3 estável: corte final só se todas as contas têm dados frescos no banco.
  if (!st.cutover && h.allFresh) return { state: { ...next, cutover: true, since: now }, event: { kind: 'cutover', reason: 'fase 3 estável e todas as contas com dados frescos' } }
  return { state: next }
}
