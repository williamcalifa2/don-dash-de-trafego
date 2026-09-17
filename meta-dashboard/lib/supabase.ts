import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!_client) _client = createClient(url, key)
  return _client
}

export interface Fechamento {
  id: string
  client_id: string
  date: string
  count: number
  revenue: number
  notes?: string
}

export async function getFechamentos(clientSlug: string): Promise<Fechamento[]> {
  const db = getSupabase()
  if (!db) return []

  const { data: client } = await db
    .from('clients')
    .select('id')
    .eq('slug', clientSlug)
    .single()

  if (!client) return []

  const { data } = await db
    .from('fechamentos')
    .select('*')
    .eq('client_id', client.id)
    .order('date', { ascending: false })

  return data ?? []
}

export async function upsertFechamento(
  clientSlug: string,
  date: string,
  count: number,
  revenue: number,
  notes?: string
): Promise<void> {
  const db = getSupabase()
  if (!db) return

  const { data: client } = await db
    .from('clients')
    .select('id')
    .eq('slug', clientSlug)
    .single()

  if (!client) throw new Error('Client not found')

  await db.from('fechamentos').upsert(
    { client_id: client.id, date, count, revenue, notes },
    { onConflict: 'client_id,date' }
  )
}
