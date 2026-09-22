import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant'
import { updateLead, LOSS_REASONS, type LeadUpdate, type LeadStatus } from '@/lib/supabase'
import { denyReader } from '@/lib/admin'

const STATUSES: LeadStatus[] = ['Novo', 'Em andamento', 'Convertido', 'Perdido']

function parseUpdate(body: Record<string, unknown>): LeadUpdate | string {
  const out: LeadUpdate = {}
  if ('status' in body) {
    if (!STATUSES.includes(body.status as LeadStatus)) return 'Status inválido'
    out.status = body.status as LeadStatus
  }
  if ('valor_pedido' in body) {
    const v = body.valor_pedido
    if (v !== null && (typeof v !== 'number' || !isFinite(v) || v < 0)) return 'Valor inválido'
    out.valor_pedido = v as number | null
  }
  if ('notas' in body) {
    const v = body.notas
    if (v !== null && (typeof v !== 'string' || v.length > 2000)) return 'Nota inválida (máx. 2000 caracteres)'
    out.notas = v as string | null
  }
  if ('motivo_perda' in body) {
    const v = body.motivo_perda
    if (v !== null && !LOSS_REASONS.includes(v as typeof LOSS_REASONS[number])) return 'Motivo inválido'
    out.motivo_perda = v as string | null
  }
  if ('ultimo_contato' in body) {
    const v = body.ultimo_contato
    if (v !== null && (typeof v !== 'string' || isNaN(Date.parse(v)))) return 'Data de contato inválida'
    out.ultimo_contato = v as string | null
  }
  if ('atendido_por' in body) {
    const v = body.atendido_por
    if (v !== null && (typeof v !== 'string' || v.length > 80)) return 'Nome inválido (máx. 80 caracteres)'
    out.atendido_por = typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null
  }
  return Object.keys(out).length ? out : 'Nada para atualizar'
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const readOnly = await denyReader(req)
  if (readOnly) return readOnly
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })

  const update = parseUpdate(body)
  if (typeof update === 'string') return NextResponse.json({ error: update }, { status: 400 })

  try {
    await updateLead(tenant.clientId, id, update)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao salvar'
    return NextResponse.json({ error: msg }, { status: msg === 'Lead não encontrado' ? 404 : 500 })
  }
}
