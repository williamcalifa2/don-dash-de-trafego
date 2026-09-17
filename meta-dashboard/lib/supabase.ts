import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

export interface Fechamento {
  id: string
  client_id: string
  date: string
  count: number
  revenue: number
  notes?: string
}

export async function getFechamentos(clientSlug: string): Promise<Fechamento[]> {
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('slug', clientSlug)
    .single()

  if (!client) return []

  const { data } = await supabase
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
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('slug', clientSlug)
    .single()

  if (!client) throw new Error('Client not found')

  await supabase.from('fechamentos').upsert(
    { client_id: client.id, date, count, revenue, notes },
    { onConflict: 'client_id,date' }
  )
}
