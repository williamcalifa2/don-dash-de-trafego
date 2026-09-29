/**
 * Lembrete automático de "cliente sem otimização há X dias". Sem SQL novo (guarda tudo em meta_settings,
 * mesmo padrão do relatório semanal). Roda dentro do cron existente (/api/cron/sync); não é um cron à parte.
 */
import { getSupabaseServer } from './supabase'
import { activityByClient } from './managers'
import { loadRegistry } from './activityLog'
import { readLog } from './managersStore'
import { weeklyClients } from './weeklyStore'

const CADENCE_KEY = 'optimization_cadence_days'
const REMINDERS_KEY = 'optimization_reminders'
const DEFAULT_CADENCE = 3
export const MIN_CADENCE = 1
export const MAX_CADENCE = 30

export interface Reminder { slug: string; clientName: string; managerId: string | null; createdAt: string; daysIdle: number }

export async function getCadenceDays(): Promise<number> {
  const db = getSupabaseServer()
  if (!db) return DEFAULT_CADENCE
  const { data } = await db.from('meta_settings').select('value').eq('key', CADENCE_KEY).maybeSingle()
  const v = Number((data as { value?: number } | null)?.value)
  return Number.isFinite(v) && v >= MIN_CADENCE && v <= MAX_CADENCE ? v : DEFAULT_CADENCE
}

export async function setCadenceDays(days: number): Promise<void> {
  const db = getSupabaseServer()
  if (!db) return
  const v = Math.min(MAX_CADENCE, Math.max(MIN_CADENCE, Math.round(days)))
  await db.from('meta_settings').upsert({ key: CADENCE_KEY, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

async function readReminders(): Promise<Record<string, Reminder>> {
  const db = getSupabaseServer()
  if (!db) return {}
  const { data } = await db.from('meta_settings').select('value').eq('key', REMINDERS_KEY).maybeSingle()
  const v = (data as { value?: Record<string, Reminder> } | null)?.value
  return v && typeof v === 'object' ? v : {}
}

async function writeReminders(v: Record<string, Reminder>): Promise<void> {
  const db = getSupabaseServer()
  if (!db) return
  await db.from('meta_settings').upsert({ key: REMINDERS_KEY, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/** Lembretes em aberto (ninguém marcou como feito ainda), opcionalmente só de um gestor. */
export async function listReminders(managerId?: string): Promise<Reminder[]> {
  const all = Object.values(await readReminders())
  return (managerId ? all.filter(r => r.managerId === managerId) : all).sort((a, b) => b.daysIdle - a.daysIdle)
}

/** A pessoa fez a otimização (ou vai fazer agora): tira o lembrete da lista. */
export async function dismissReminder(slug: string): Promise<void> {
  const cur = await readReminders()
  if (!(slug in cur)) return
  delete cur[slug]
  await writeReminders(cur)
}

/**
 * Roda 1x por dia (o cron chama isso; é idempotente — pode chamar de novo no mesmo dia sem duplicar).
 * Cliente ativo, com conta de anúncios e gestor vinculado, sem nenhuma ação registrada há >= cadência de dias:
 * ganha um lembrete "Otimização Semanal - {Cliente}", se ainda não tiver um em aberto.
 */
export async function checkOptimizationReminders(now = Date.now()): Promise<{ created: number }> {
  const [cadence, reg, clients, existing] = await Promise.all([getCadenceDays(), loadRegistry(), weeklyClients(), readReminders()])
  if (!reg) return { created: 0 }
  const active = clients.filter(c => c.active)
  const slugs = active.map(c => c.slug)
  if (!slugs.length) return { created: 0 }
  const since = new Date(now - MAX_CADENCE * 86_400_000).toISOString()
  const rows = await readLog({ sinceIso: since, clients: slugs }).catch(() => null)
  const activity = activityByClient(slugs, rows ?? [])
  const lastBySlug = new Map(activity.map(a => [a.slug, a.lastAt]))

  let created = 0
  for (const c of active) {
    const managerId = reg.byClient.get(c.slug) ?? null
    if (!managerId) continue // sem gestor vinculado, ninguém pra avisar
    if (c.slug in existing) continue // já tem lembrete em aberto pra esse cliente
    const last = lastBySlug.get(c.slug) ?? null
    const daysIdle = last ? Math.floor((now - Date.parse(last)) / 86_400_000) : MAX_CADENCE + 1
    if (daysIdle < cadence) continue
    existing[c.slug] = { slug: c.slug, clientName: c.name, managerId, createdAt: new Date(now).toISOString(), daysIdle }
    created++
  }
  if (created > 0) await writeReminders(existing)
  return { created }
}
