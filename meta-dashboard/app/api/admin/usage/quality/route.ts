import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin'
import { getSupabaseServer } from '@/lib/supabase'
import { usageSince } from '@/lib/usage'
import { frictionByElement, frictionByPerson, groupErrors, perfByView, scrollByView, type EventRow, type Friction } from '@/lib/usageQuality'
import { nameFromEmail } from '@/lib/adminProfile'
import { photosFor } from '@/lib/peoplePhotos'

export const dynamic = 'force-dynamic'

/** Qualidade da experiência: cliques de raiva e mortos, erros de tela, tempo até a tela ficar pronta e até onde as pessoas rolam. Só administração. */
export async function GET(req: NextRequest) {
  const denied = await requireRole(req, 'admin')
  if (denied) return denied
  const db = getSupabaseServer()
  if (!db) return NextResponse.json({ error: 'Banco indisponível' }, { status: 503 })

  const q = req.nextUrl.searchParams
  const period = ['today', '7', '30'].includes(q.get('period') ?? '') ? q.get('period') as string : '7'
  const clientParam = q.get('client') ?? ''
  const client = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(clientParam) && clientParam.length <= 40 ? clientParam : ''
  const user = (q.get('user') ?? '').toLowerCase().slice(0, 120)
  const since = new Date(usageSince(period)).toISOString()

  let query = db.from('usage_events').select('at,sid,user_key,client_slug,view,kind,sel,rx,ry,n,value,label,msg,meta').gte('at', since).order('at', { ascending: false }).limit(50000)
  if (client) query = query.eq('client_slug', client)
  if (user) query = query.eq('user_key', user)
  const [ev, clients] = await Promise.all([query, db.from('clients').select('slug,display_name')])
  if (ev.error) return NextResponse.json({ setup: /relation|schema cache|does not exist/i.test(ev.error.message) ? 'events' : 'error' })

  const rows = (ev.data ?? []) as unknown as EventRow[]
  const clientName = new Map(((clients.data ?? []) as Array<{ slug: string; display_name: string | null }>).map(c => [c.slug, c.display_name || c.slug]))
  const nameOf = (k: string) => (k.startsWith('cliente:') ? `Cliente ${clientName.get(k.slice(8)) ?? k.slice(8)}` : nameFromEmail(k))

  const withNames = (f: Friction) => ({ ...f, who: f.who.map(w => ({ ...w, name: nameOf(w.userKey) })) })

  const peopleF = frictionByPerson(rows)
  const ph = await photosFor(peopleF.map(p => p.userKey))
  return NextResponse.json({
    setup: 'ready', period,
    rage: frictionByElement(rows, 'rage').map(withNames),
    dead: frictionByElement(rows, 'dead').map(withNames),
    people: peopleF.map(p => ({ ...p, photo: ph.person(p.userKey), name: nameOf(p.userKey) })),
    errors: groupErrors(rows).map(e => ({ ...e, lastUserName: nameOf(e.lastUser), lastClientName: e.lastClient ? (clientName.get(e.lastClient) ?? e.lastClient) : '' })),
    perf: perfByView(rows),
    scroll: scrollByView(rows),
    totals: {
      rage: rows.filter(r => r.kind === 'rage').length,
      dead: rows.filter(r => r.kind === 'dead').length,
      errors: rows.filter(r => r.kind === 'error').length,
      sessions: new Set(rows.map(r => r.sid)).size,
    },
  })
}
