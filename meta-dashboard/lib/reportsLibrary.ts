/** Biblioteca de relatórios de todos os clientes, para a tela da equipe. Cada cliente guarda os seus em meta_settings (reports_library:<cliente>). */
import { getSupabaseServer } from './supabase'
import { logoPublicUrl } from './logo'
import type { SavedReport, SavedReportSummary } from './report'

export const libraryKey = (slug: string) => `reports_library:${slug}`
const PREFIX = 'reports_library:'

export interface TeamClient { slug: string; name: string; logoUrl: string | null }
export type TeamReport = SavedReportSummary & { client: TeamClient }

const summary = ({ snapshot, presenterNotes, ...rest }: SavedReport): SavedReportSummary => { void snapshot; void presenterNotes; return rest }

export async function listClients(): Promise<TeamClient[]> {
  const db = getSupabaseServer()
  if (!db) return []
  const { data } = await db.from('clients').select('slug, display_name, logo_url').order('display_name')
  return ((data ?? []) as Array<{ slug: string; display_name: string | null; logo_url: string | null }>).map(c => ({ slug: c.slug, name: c.display_name || c.slug, logoUrl: logoPublicUrl(c.slug, c.logo_url) }))
}

/** Todos os relatórios, do mais novo para o mais antigo, cada um com o cliente. Uma consulta só para a biblioteca inteira. */
export async function listAllReports(): Promise<{ reports: TeamReport[]; clients: TeamClient[] }> {
  const db = getSupabaseServer()
  const clients = await listClients()
  if (!db) return { reports: [], clients }
  const { data } = await db.from('meta_settings').select('key, value').like('key', `${PREFIX}%`)
  const bySlug = new Map(clients.map(c => [c.slug, c]))
  const reports: TeamReport[] = []
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
    const slug = row.key.slice(PREFIX.length)
    const client = bySlug.get(slug)
    if (!client || !Array.isArray(row.value)) continue
    for (const r of row.value as SavedReport[]) if (r && typeof r.id === 'string') reports.push({ ...summary(r), client })
  }
  return { reports: reports.sort((a, b) => b.createdAt - a.createdAt), clients }
}

async function readLib(slug: string): Promise<SavedReport[]> {
  const db = getSupabaseServer()
  if (!db) return []
  const { data } = await db.from('meta_settings').select('value').eq('key', libraryKey(slug)).maybeSingle()
  const v = (data as { value: unknown } | null)?.value
  return Array.isArray(v) ? (v as SavedReport[]) : []
}

async function writeLib(slug: string, list: SavedReport[]): Promise<void> {
  const db = getSupabaseServer()
  if (!db) throw new Error('Banco indisponível')
  const { error } = await db.from('meta_settings').upsert({ key: libraryKey(slug), value: list, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

export async function getReport(slug: string, id: string): Promise<SavedReport | null> {
  return (await readLib(slug)).find(r => r.id === id) ?? null
}

export async function deleteReport(slug: string, id: string): Promise<boolean> {
  const list = await readLib(slug)
  const next = list.filter(r => r.id !== id)
  if (next.length === list.length) return false
  await writeLib(slug, next)
  return true
}

const MAX_NOTE = 2000
/** Anotações do apresentador: só texto, por slide, com limite de tamanho. */
export function cleanPresenterNotes(v: unknown): Record<string, string> {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(o).slice(0, 80)) if (typeof val === 'string' && /^[\w-]{1,60}$/.test(k) && val.trim()) out[k] = val.slice(0, MAX_NOTE)
  return out
}

export async function savePresenterNotes(slug: string, id: string, notes: unknown): Promise<boolean> {
  const list = await readLib(slug)
  const i = list.findIndex(r => r.id === id)
  if (i < 0) return false
  list[i] = { ...list[i], presenterNotes: cleanPresenterNotes(notes) }
  await writeLib(slug, list)
  return true
}
