import { NextRequest, NextResponse } from 'next/server'
import { denyReader } from '@/lib/admin'
import { requireTenant } from '@/lib/tenant'
import { stores } from '@/lib/meta/pipeline'
import {
  extractReportKpis,
  type ReportData,
  type ReportNotes,
  type ReportPreset,
  type ReportMode,
  type SavedReport,
  type SavedReportSummary,
} from '@/lib/report'

export const dynamic = 'force-dynamic'

const libraryKey = (slug: string) => `reports_library:${slug}`

export async function GET(req: NextRequest) {
  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  try {
    const library = (await stores.limit.getSetting<SavedReport[]>(libraryKey(tenant.slug))) ?? []

    if (id) {
      const found = library.find(r => r.id === id)
      if (!found) {
        return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
      }
      return NextResponse.json(found, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Retorna a lista de resumos ordenada por criação (mais recentes primeiro)
    const summaries: SavedReportSummary[] = library
      .map(({ snapshot, ...rest }) => rest)
      .sort((a, b) => b.createdAt - a.createdAt)

    return NextResponse.json(summaries, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao carregar relatórios salvos'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await denyReader(req)
  if (denied) return denied

  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    title?: string
    preset?: ReportPreset
    periodKey?: string
    periodLabel?: string
    mode?: ReportMode
    theme?: 'light' | 'dark'
    slidesCount?: number
    author?: string
    snapshot?: {
      data: ReportData
      notes: ReportNotes
    }
  }

  if (!body.snapshot?.data || !body.snapshot?.notes) {
    return NextResponse.json({ error: 'Snapshot com dados e notas é obrigatório para salvar o relatório.' }, { status: 400 })
  }

  const now = Date.now()
  const data = body.snapshot.data
  const preset: ReportPreset = body.preset || data.month.preset || 'last_month'
  const mode: ReportMode = body.mode || 'standard'
  const theme = body.theme === 'dark' ? 'dark' : 'light'
  const title = (body.title || `Relatório · ${data.month.label}`).trim()
  const id = body.id || `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const kpis = extractReportKpis(data)

  const newReport: SavedReport = {
    id,
    title,
    preset,
    periodKey: body.periodKey || data.month.key,
    periodLabel: body.periodLabel || data.month.label,
    mode,
    theme,
    createdAt: now,
    updatedAt: now,
    author: body.author || 'Equipe Don',
    slidesCount: body.slidesCount || 9,
    kpis,
    snapshot: {
      data,
      notes: body.snapshot.notes,
    },
  }

  try {
    const key = libraryKey(tenant.slug)
    const existing = (await stores.limit.getSetting<SavedReport[]>(key)) ?? []
    const idx = existing.findIndex(r => r.id === id)

    let updated: SavedReport[]
    if (idx >= 0) {
      newReport.createdAt = existing[idx].createdAt
      updated = [...existing]
      updated[idx] = newReport
    } else {
      updated = [newReport, ...existing]
    }

    await stores.limit.setSetting(key, updated)
    return NextResponse.json({ ok: true, report: newReport })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao salvar relatório'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await denyReader(req)
  if (denied) return denied

  const tenant = await requireTenant(req)
  if (tenant instanceof NextResponse) return tenant

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Parâmetro id é obrigatório' }, { status: 400 })
  }

  try {
    const key = libraryKey(tenant.slug)
    const existing = (await stores.limit.getSetting<SavedReport[]>(key)) ?? []
    const updated = existing.filter(r => r.id !== id)
    await stores.limit.setSetting(key, updated)
    return NextResponse.json({ ok: true, deleted: id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao excluir relatório'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

