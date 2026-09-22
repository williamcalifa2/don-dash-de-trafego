import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireRole, requireServiceKey } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { decodeLogo, logoPublicUrl, parseLogoInput } from '@/lib/logo'

export const dynamic = 'force-dynamic'
const KEY = 'brand_logo'

async function read(): Promise<string | null> {
  const db = getSupabaseServer()
  if (!db) return null
  const { data } = await db.from('meta_settings').select('value').eq('key', KEY).maybeSingle()
  const v = (data as { value: unknown } | null)?.value
  return typeof v === 'string' && v ? v : null
}

/** Logo do painel de controle (só administrador). */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const stored = await read()
  const img = stored ? decodeLogo(stored) : null
  if (!img) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(new Uint8Array(img.bytes), { headers: { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' } })
}

/** Troca ou remove o logo. Corpo: { logo: "data:image/png;base64,..." } ou { logo: "" } para remover. */
export async function PUT(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const badKey = requireServiceKey()
  if (badKey) return badKey
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const b = await req.json().catch(() => ({})) as { logo?: unknown; icon?: unknown }
  const logo = parseLogoInput(b.logo)
  if (!logo.ok) return NextResponse.json({ error: logo.error }, { status: 400 })
  if (logo.value && !logo.value.startsWith('data:')) return NextResponse.json({ error: 'Envie um arquivo de imagem.' }, { status: 400 })
  const icon = parseLogoInput(b.icon)
  if (!icon.ok) return NextResponse.json({ error: icon.error }, { status: 400 })
  const now = new Date().toISOString()
  const { error } = await db.from('meta_settings').upsert([
    { key: KEY, value: logo.value ?? '', updated_at: now },
    { key: 'brand_icon', value: logo.value ? (icon.value ?? '') : '', updated_at: now },
  ], { onConflict: 'key' })
  if (error) return NextResponse.json({ error: /does not exist|schema cache/i.test(error.message) ? 'Rode o SQL supabase/2026-09-meta-sync.sql no Supabase antes.' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true, url: logo.value ? logoPublicUrl('brand', logo.value)!.replace('/api/logo/brand', '/api/admin/brand') : null })
}
