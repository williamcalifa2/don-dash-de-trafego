/** Carrega o modo decidido pelo piloto automático (banco) para a config do processo. Melhor esforço, com cache curto. */
import { baseMetaConfig, setRuntimeOverride } from './config'
import { AUTOPILOT_KEY, initialAutopilot, runtimeFor, type AutopilotState } from './autopilot'
import { stores } from './stores'

const TTL_MS = 30_000
let last = 0

export async function ensureRuntime(force = false): Promise<void> {
  const base = baseMetaConfig()
  if (!base.autopilot) { setRuntimeOverride(null); return }
  if (!force && Date.now() - last < TTL_MS) return
  last = Date.now()
  try {
    const st = await stores.limit.getSetting<AutopilotState>(AUTOPILOT_KEY)
    setRuntimeOverride(runtimeFor(st ?? initialAutopilot(Date.now())))
  } catch {
    // Sem conseguir ler o estado: modo seguro = simulação no pipeline e painel antigo como está hoje.
    setRuntimeOverride({ dryRun: true, phase: 0, legacyLive: true })
  }
}

/** Testes. */
export const __resetRuntimeCache = () => { last = 0 }
