import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { legacyGet } from '@/lib/meta/legacy'
import { liveOrigin } from '@/lib/meta/mode'
import { tenantBySlug } from '@/lib/tenant'
import { SLUG_RE } from '@/lib/host'
import { friendlyLiveError } from '@/lib/meta/staleFallback'

export const dynamic = 'force-dynamic'

type Page = { id: string; name: string }

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Páginas do Facebook que o token enxerga, para ligar uma Página a um cliente (orgânico).
 * `?slug=` traz também as sugestões: as Páginas que a conta de anúncios do cliente promove e as de nome parecido com o do cliente.
 */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const token = process.env.META_ORGANIC_TOKEN?.trim() || process.env.META_ACCESS_TOKEN?.trim()
  if (!token) return NextResponse.json({ pages: [], error: 'Sem token da Meta configurado.' })
  const origin = await liveOrigin()

  const all = await legacyGet<{ data?: Page[] }>('me/accounts?fields=id,name&limit=100', { purpose: 'admin:paginas', origin, token })
  if (!all.ok) return NextResponse.json({ pages: [], error: friendlyLiveError(all.error?.message ?? 'Não consegui listar as Páginas.') })
  const pages = (all.data.data ?? []).map(p => ({ id: String(p.id), name: String(p.name ?? p.id) }))

  const slug = (req.nextUrl.searchParams.get('slug') ?? '').trim().toLowerCase()
  const suggested = new Set<string>()
  let current: string | null = null
  if (slug && SLUG_RE.test(slug)) {
    const t = await tenantBySlug(slug)
    current = t?.pageId ?? null
    if (t?.adAccountId) {
      const promo = await legacyGet<{ data?: Page[] }>(`${t.adAccountId}/promote_pages?fields=id,name&limit=25`, { purpose: 'admin:paginas', origin, clientId: t.clientId, accountId: t.adAccountId })
      if (promo.ok) for (const p of promo.data.data ?? []) suggested.add(String(p.id))
    }
    // Nome parecido com o do cliente ("Advocacia Fontana" ~ "Fontana Advogados").
    const words = norm(t?.name ?? slug).split(' ').filter(w => w.length >= 4)
    for (const p of pages) if (words.some(w => norm(p.name).includes(w))) suggested.add(p.id)
  }
  const ordered = [...pages.filter(p => suggested.has(p.id)), ...pages.filter(p => !suggested.has(p.id))].map(p => ({ ...p, suggested: suggested.has(p.id) }))
  return NextResponse.json({ pages: ordered, current })
}
