/**
 * O Supabase corta cada consulta no "Max rows" do projeto (padrão 1000), sem avisar. Aqui a leitura vem em páginas até acabar,
 * então contagens e listas não dependem desse limite. `max` protege contra consulta sem fim.
 */
export interface RangeQuery { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }

export async function pagedAll<T = Record<string, unknown>>(query: () => RangeQuery, opts: { size?: number; max?: number } = {}): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const size = opts.size ?? 1000
  const max = opts.max ?? 100_000
  const out: T[] = []
  for (let from = 0; from < max; from += size) {
    const { data, error } = await query().range(from, from + size - 1)
    if (error) return { data: out, error, truncated: false }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < size) return { data: out, error: null, truncated: false }
  }
  return { data: out, error: null, truncated: true }
}
