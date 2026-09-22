/** A prévia do anúncio chega da Meta como um trecho de HTML com um <iframe>. Só o endereço do iframe interessa, e só se for da Meta. */
const HOSTS = /(^|\.)(facebook\.com|fb\.com|instagram\.com)$/i

export function previewSrc(html: string | null | undefined): string | null {
  if (!html) return null
  const m = html.match(/<iframe\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
  const raw = (m?.[1] ?? m?.[2] ?? '').replace(/&amp;/g, '&')
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && HOSTS.test(u.hostname) ? u.toString() : null
  } catch { return null }
}
