import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authEnabled, readSession, SESSION_COOKIE } from './lib/auth'
import { ADMIN_SLUG, VIEW_COOKIE } from './lib/admin'
import { hostSlug, SLUG_RE } from './lib/host'

const PUBLIC_PREFIXES = [
  '/login',
  '/admin',
  '/api/auth/',
  '/api/admin/',
  '/api/webhooks/',
  '/api/cron/',
  '/api/internal/',
  '/api/logo/',
  '/api/brand/',
  '/platforms/',
  '/privacidade',
  '/exclusao-de-dados',
  '/icon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.png',
  '/apple-icon.png',
  '/apple-touch-icon.png',
  '/brand-icon.png',
  '/favicon.ico',
]

export async function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next()

  const { pathname, search } = req.nextUrl
  const clientSlug = hostSlug(req.headers.get('host'))

  // Endereços de cliente por subdomínio nunca mostram a administração.
  if (clientSlug && (pathname.startsWith('/admin') || pathname.startsWith('/api/admin'))) {
    return new NextResponse('Not found', { status: 404 })
  }

  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))) {
    return NextResponse.next()
  }

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value)
  const isAdmin = session?.s === ADMIN_SLUG
  const view = req.cookies.get(VIEW_COOKIE)?.value
  // Cliente do endereço: /dashboard/<cliente>, ou o subdomínio.
  const pathClient = pathname.startsWith('/dashboard/') ? pathname.split('/')[2] : null
  const target = pathClient && pathClient !== 'meta' && SLUG_RE.test(pathClient) ? pathClient : clientSlug

  const redirect = (to: string, keepSearch = false) => {
    const url = req.nextUrl.clone()
    url.pathname = to
    if (!keepSearch) url.search = ''
    return NextResponse.redirect(url)
  }

  if (session) {
    // Endereço antigo: leva ao painel do cliente da sessão (ou do cliente que o admin está vendo).
    if (pathClient === 'meta') {
      const to = isAdmin ? view : session.s
      return to ? redirect(`/dashboard/${to}`, true) : redirect('/admin')
    }
    if (isAdmin) {
      if (pathClient && target) {
        // O admin abre /dashboard/<cliente> direto: guarda qual cliente está vendo.
        const res = NextResponse.next()
        if (view !== target) {
          res.cookies.set(VIEW_COOKIE, target, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
        }
        return res
      }
      if (!pathname.startsWith('/api/') && !view) return redirect('/admin')
      return NextResponse.next()
    }
    // Cliente: só vale a sessão do próprio endereço.
    if (!target || session.s === target) return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  if (target) url.searchParams.set('c', target)
  url.searchParams.set('next', pathname + (search && !search.includes('token=') ? search : ''))
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|svg|jpg|jpeg|webp|gif)).*)'],
}
