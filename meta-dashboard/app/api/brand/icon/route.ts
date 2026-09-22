import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import { decodeLogo } from '@/lib/logo'

export const dynamic = 'force-dynamic'

/** Ícone da aba do navegador (favicon): o logo do painel de controle enviado pelo administrador. Sem logo, o ícone padrão. */
export async function GET(req: Request) {
  const db = getSupabaseServer()
  if (db) {
    const { data } = await db.from('meta_settings').select('key, value').in('key', ['brand_icon', 'brand_logo'])
    const rows = (data ?? []) as Array<{ key: string; value: unknown }>
    const stored = ['brand_icon', 'brand_logo']
      .map(k => rows.find(r => r.key === k)?.value)
      .find(v => typeof v === 'string' && (v.startsWith('data:') || v.startsWith('http://') || v.startsWith('https://'))) as string | undefined

    if (stored) {
      if (stored.startsWith('http://') || stored.startsWith('https://')) {
        return NextResponse.redirect(stored, 302)
      }
      const img = decodeLogo(stored)
      if (img) {
        return new NextResponse(new Uint8Array(img.bytes), {
          headers: {
            'Content-Type': img.mime,
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }
    }
  }
  return NextResponse.redirect(new URL('/favicon.ico', req.url), 302)
}
