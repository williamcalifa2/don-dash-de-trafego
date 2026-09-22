/** fetch que leva o usuário para a tela de acesso quando a sessão expirou ou foi revogada. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    const m = window.location.pathname.match(/^\/dashboard\/([a-z0-9-]+)\/?$/)
    const slug = m && m[1] !== 'meta' ? m[1] : null
    window.location.href = slug ? `/login?c=${slug}&next=${encodeURIComponent(window.location.pathname)}` : '/login'
  }
  return res
}
