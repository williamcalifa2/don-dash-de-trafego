import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requireServiceKey } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { clearClientCache } from '@/lib/tenant'
import { generateCode, codeHash, recoverCode } from '@/lib/accessCode'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Mostra o código de acesso atual do cliente (só administrador). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const { slug } = await ctx.params
  const { data, error } = await db.from('clients').select('access_code_hash').eq('slug', slug).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  const hash = (data as { access_code_hash: string | null }).access_code_hash
  if (!hash) return NextResponse.json({ code: null, reason: 'no_code' }, { headers: { 'Cache-Control': 'no-store' } })
  const code = await recoverCode(slug, hash)
  return NextResponse.json({ code, reason: code ? undefined : 'unrecoverable' }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Gera um código novo de 6 dígitos (o anterior deixa de funcionar e o bloqueio é zerado). Só é devolvido aqui. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const badKey = requireServiceKey()
  if (badKey) return badKey
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const { slug } = await ctx.params

  const code = generateCode()
  const { data, error } = await db.from('clients')
    .update({ access_code_hash: codeHash(slug, code), failed_attempts: 0, locked_until: null })
    .eq('slug', slug).select('slug')
  clearClientCache()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  return NextResponse.json({ code })
}

/** Revoga o acesso: sem código, ninguém entra até gerar outro. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const badKey = requireServiceKey()
  if (badKey) return badKey
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 })
  const { slug } = await ctx.params
  const { error } = await db.from('clients').update({ access_code_hash: null }).eq('slug', slug)
  clearClientCache()
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
