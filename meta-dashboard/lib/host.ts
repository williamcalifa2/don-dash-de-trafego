// Seguro para o proxy (borda): sem dependências de servidor.
const RESERVED = new Set(['www', 'admin', 'api', 'app', 'login', 'painel', 'meta', 'dashboard', 'c'])
export const RESERVED_SLUGS = [...RESERVED]

/** Extrai o cliente do endereço: dalmoro.painel.exemplo.com -> "dalmoro". */
export function hostSlug(host: string | null | undefined): string | null {
  const base = (process.env.DASHBOARD_BASE_DOMAIN ?? '').trim().toLowerCase()
  if (!base || !host) return null
  const h = host.split(':')[0].toLowerCase()
  if (!h.endsWith(`.${base}`)) return null
  const sub = h.slice(0, -(base.length + 1))
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sub) || RESERVED.has(sub)) return null
  return sub
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
