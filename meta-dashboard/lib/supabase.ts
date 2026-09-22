import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Lead, LeadUpdate, LeadStatus, Fechamento } from './leadTypes'

export * from './leadTypes'

/** Cliente do banco só para uso no servidor. Prefere a chave service_role. */
export function getSupabaseServer(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export type KeyStatus = 'service' | 'anon' | 'missing' | 'unknown'

/** Diz se a chave do servidor é de fato a service_role (sem expor a chave). */
export function serviceKeyStatus(): KeyStatus {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!k) return 'missing'
  if (k.startsWith('sb_secret_')) return 'service'
  if (k.startsWith('sb_publishable_')) return 'anon'
  try {
    const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    return payload.role === 'service_role' ? 'service' : 'anon'
  } catch {
    return 'unknown'
  }
}

export const DEFAULT_SLUG = () => process.env.NEXT_PUBLIC_CLIENT_SLUG ?? 'dal-moro'

/** Descobre o id do cliente padrão (modo sem login). O NEXT_PUBLIC_CLIENT_ID evita ler a tabela clients. */
export async function resolveDefaultClientId(db: SupabaseClient): Promise<string | null> {
  const envId = process.env.NEXT_PUBLIC_CLIENT_ID
  if (envId) return envId
  const { data } = await db.from('clients').select('id').eq('slug', DEFAULT_SLUG()).single()
  return data?.id ?? null
}

function requireDb(): SupabaseClient {
  const db = getSupabaseServer()
  if (!db) throw new Error('Supabase não configurado')
  return db
}

export async function getLeads(clientId: string): Promise<Lead[]> {
  const { data, error } = await requireDb()
    .from('leads')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Lead[]
}

const COLUMN_MISSING = /schema cache|column .* does not exist|Could not find the/i

/** Grava um lead. Com meta_lead_id, ignora se o mesmo lead já foi gravado (webhook + importação). Retorna true se gravou. */
export async function insertLead(
  clientId: string,
  lead: Omit<Partial<Lead>, 'id' | 'client_id' | 'created_at'>,
  db?: SupabaseClient | null
): Promise<boolean> {
  const client = db ?? requireDb()
  const row = { ...lead, client_id: clientId }
  if (!row.meta_lead_id) {
    const { error } = await client.from('leads').insert(row)
    if (error) throw new Error(error.message)
    return true
  }
  const { data, error } = await client.from('leads').upsert(row, { onConflict: 'meta_lead_id', ignoreDuplicates: true }).select('id')
  if (error && COLUMN_MISSING.test(error.message)) {
    // Banco ainda sem a coluna meta_lead_id: grava sem a deduplicação.
    const { meta_lead_id: _drop, ...rest } = row
    void _drop
    const r = await client.from('leads').insert(rest)
    if (r.error) throw new Error(r.error.message)
    return true
  }
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

/** Grava vários leads do Meta de uma vez, ignorando os já existentes. Retorna quantos são novos. */
export async function insertMetaLeads(clientId: string, leads: Array<Omit<Partial<Lead>, 'id' | 'client_id' | 'created_at'> & { created_at?: string }>): Promise<number> {
  if (!leads.length) return 0
  const { data, error } = await requireDb()
    .from('leads')
    .upsert(leads.map(l => ({ ...l, client_id: clientId })), { onConflict: 'meta_lead_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(COLUMN_MISSING.test(error.message) ? 'O banco ainda não tem a coluna meta_lead_id. Rode o SQL supabase/2026-09-leads-meta.sql.' : error.message)
  return data?.length ?? 0
}

/** Apaga os leads de teste da ferramenta do Meta ("<test lead: dummy data...>") que foram importados. */
export async function deleteMetaTestLeads(clientId: string): Promise<void> {
  await requireDb().from('leads').delete()
    .eq('client_id', clientId).not('meta_lead_id', 'is', null)
    .or('nome.ilike.*test lead:*,email.ilike.*test lead:*,telefone.ilike.*test lead:*')
}

/** Preenche nome/telefone/e-mail/notas de um lead do Meta só onde estão vazios (não sobrescreve o que o time editou). */
export async function repairMetaLead(
  clientId: string, metaLeadId: string,
  fields: { nome: string | null; telefone: string | null; email: string | null; notas: string | null }
): Promise<boolean> {
  const db = requireDb()
  let changed = false
  for (const col of ['nome', 'telefone', 'email', 'notas'] as const) {
    const value = fields[col]
    if (!value) continue
    const { data, error } = await db.from('leads').update({ [col]: value }).eq('client_id', clientId).eq('meta_lead_id', metaLeadId).is(col, null).select('id')
    if (!error && (data?.length ?? 0) > 0) changed = true
  }
  return changed
}

export async function updateLead(clientId: string, leadId: string, updates: LeadUpdate): Promise<void> {
  const { error, count } = await requireDb()
    .from('leads')
    .update(updates, { count: 'exact' })
    .eq('id', leadId)
    .eq('client_id', clientId)
  if (error) throw new Error(/atendido_por/.test(error.message) && COLUMN_MISSING.test(error.message) ? 'O banco ainda não tem o campo "atendido por". Rode o SQL supabase/2026-09-atendente.sql.' : error.message)
  if (count === 0) throw new Error('Lead não encontrado')
}

export async function getFechamentos(clientId: string): Promise<Fechamento[]> {
  const { data, error } = await requireDb()
    .from('fechamentos')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Fechamento[]
}

export async function upsertFechamento(
  clientId: string,
  date: string,
  count: number,
  revenue: number,
  notes?: string
): Promise<void> {
  const { error } = await requireDb().from('fechamentos').upsert(
    { client_id: clientId, date, count, revenue, notes },
    { onConflict: 'client_id,date' }
  )
  if (error) throw new Error(error.message)
}

export interface ManualLeadInput {
  nome: string | null
  telefone: string | null
  email: string | null
  campanha: string | null
  conjunto: string | null
  ad_name: string | null
  valor_pedido: number | null
  motivo_perda: string | null
  notas: string | null
  atendido_por: string | null
  status: LeadStatus
}

const brDate = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

/** Cadastro manual de lead (sem id da Meta). Devolve o lead criado. Se o banco ainda não tem "atendido por", grava sem ele e avisa. */
export async function createManualLead(clientId: string, input: ManualLeadInput): Promise<{ lead: Lead; warning?: string }> {
  const db = requireDb()
  const { atendido_por, ...base } = input
  // Quem já foi atendido (qualquer status além de "Novo") entra com o contato registrado, para não aparecer como "sem contato".
  const row: Record<string, unknown> = { ...base, client_id: clientId, manual: true, date: brDate(), ...(input.status !== 'Novo' ? { ultimo_contato: new Date().toISOString() } : {}) }
  if (atendido_por) row.atendido_por = atendido_por
  let r = await db.from('leads').insert(row).select('*').single()
  let warning: string | undefined
  // Colunas novas que o banco ainda não tem: grava sem elas e avisa só do que importa para o usuário.
  for (const col of ['manual', 'atendido_por'] as const) {
    if (!r.error || !(col in row) || !new RegExp(col).test(r.error.message) || !COLUMN_MISSING.test(r.error.message)) continue
    delete row[col]
    r = await db.from('leads').insert(row).select('*').single()
    if (col === 'atendido_por') warning = 'O lead foi salvo, mas o banco ainda não tem o campo "atendido por". Rode o SQL supabase/2026-09-atendente.sql.'
  }
  if (r.error || !r.data) throw new Error(r.error?.message ?? 'Erro ao salvar o lead')
  return { lead: r.data as Lead, warning }
}
