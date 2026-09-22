const hits = new Map<string, { count: number; resetAt: number }>()

/** Limite simples em memória (por instância). Retorna false quando passou do limite. */
export function allow(key: string, max = 15, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now()
  const e = hits.get(key)
  if (!e || e.resetAt <= now) { hits.set(key, { count: 1, resetAt: now + windowMs }); return true }
  e.count++
  return e.count <= max
}
