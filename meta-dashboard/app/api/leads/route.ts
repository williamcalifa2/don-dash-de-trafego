import { NextRequest, NextResponse } from 'next/server'
import { createManualLead, getLeads, LOSS_REASONS, type ManualLeadInput } from '@/lib/supabase'
import type { LeadStatus } from '@/lib/leadTypes'
import { requireTenant } from '@/lib/tenant'
import { normalizePhone } from '@/lib/leadUtils'
import { denyReader } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  try {
    return NextResponse.json({ leads: await getLeads(tenant.clientId) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao carregar leads' }, { status: 500 })
  }
}

const STATUSES: LeadStatus[] = ['Novo', 'Em andamento', 'Convertido', 'Perdido']
const text = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return undefined
  const t = v.trim().replace(/[ \t]+/g, ' ')
  return t ? (t.length > max ? undefined : t) : null
}

/** Cadastro manual de lead pelo cliente ou pelo administrador (quem chegou por telefone, balcão, site, conversa...). */
export async function POST(req: NextRequest) {
  const readOnly = await denyReader(req)
  if (readOnly) return readOnly
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })

  const nome = text(b.nome, 120), email = text(b.email, 160), campanha = text(b.campanha, 300)
  const conjunto = text(b.conjunto, 300), anuncio = text(b.ad_name, 300)
  const notas = text(b.notas, 2000), atendido = text(b.atendido_por, 80)
  let telefone = text(b.telefone, 40)
  if ([nome, email, campanha, conjunto, anuncio, notas, atendido, telefone].includes(undefined)) return NextResponse.json({ error: 'Algum campo é inválido ou grande demais.' }, { status: 400 })
  if (telefone && !/^[\d+()\-.\s]{6,}$/.test(telefone)) return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
  if (telefone) telefone = normalizePhone(telefone)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
  if (!nome && !telefone) return NextResponse.json({ error: 'Informe pelo menos o nome ou o telefone.' }, { status: 400 })
  const status = b.status === undefined ? 'Novo' : b.status
  if (!STATUSES.includes(status as LeadStatus)) return NextResponse.json({ error: 'Status inválido' }, { status: 400 })

  // Valor do pedido: só faz sentido (e só é gravado) quando o lead fechou. Motivo: só quando perdeu.
  let valor: number | null = null
  if (b.valor_pedido !== undefined && b.valor_pedido !== null && b.valor_pedido !== '') {
    const v = typeof b.valor_pedido === 'number' ? b.valor_pedido : Number(String(b.valor_pedido).replace(/\./g, '').replace(',', '.'))
    if (!isFinite(v) || v < 0 || v > 1e9) return NextResponse.json({ error: 'Valor do pedido inválido.' }, { status: 400 })
    valor = Math.round(v * 100) / 100
  }
  const motivo = typeof b.motivo_perda === 'string' && b.motivo_perda ? b.motivo_perda : null
  if (motivo && !(LOSS_REASONS as readonly string[]).includes(motivo)) return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })

  const input: ManualLeadInput = { nome: nome ?? null, telefone: telefone ?? null, email: email ?? null, campanha: campanha ?? null, conjunto: conjunto ?? null, ad_name: anuncio ?? null,
    valor_pedido: status === 'Convertido' ? valor : null, motivo_perda: status === 'Perdido' ? motivo : null, notas: notas ?? null, atendido_por: atendido ?? null, status: status as LeadStatus }
  try {
    const { lead, warning } = await createManualLead(tenant.clientId, input)
    return NextResponse.json({ lead, warning }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao salvar o lead' }, { status: 500 })
  }
}
