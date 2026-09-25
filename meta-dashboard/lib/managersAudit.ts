/** Conferência dos dados dos gestores: carteira, e-mails, autores da Meta e histórico. Só funções puras (a rota reúne os dados). */

export type Severity = 'error' | 'warn' | 'info' | 'ok'
export interface Finding { id: string; severity: Severity; title: string; detail: string; items?: string[] }

export interface AuditInput {
  clients: Array<{ slug: string; name: string; adAccountId: string | null; pageId: string | null; active: boolean }>
  managers: Array<{ id: string; name: string; email: string | null; metaActorId: string | null }>
  /** cliente → gestor (tabela manager_clients) */
  carteira: Array<{ slug: string; managerId: string }>
  /** pessoas com acesso ao painel (Membro/Leitor/Admin) */
  members: Array<{ email: string; role: string }>
  /** histórico dos últimos dias: quantidade por combinação cliente + gestor gravado + autor */
  log: Array<{ slug: string; managerId: string | null; actorKey: string | null; actorName: string | null; source: string; n: number }>
  syncErrors: Array<{ slug: string; error: string }>
}

const MAX = 12
const names = (xs: string[]) => (xs.length > MAX ? [...xs.slice(0, MAX), `… e mais ${xs.length - MAX}`] : xs)
const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

export function auditManagers(i: AuditInput): { findings: Finding[]; fixableRows: number } {
  const out: Finding[] = []
  const cname = new Map(i.clients.map(c => [c.slug, c.name]))
  const mname = new Map(i.managers.map(m => [m.id, m.name]))
  const cn = (s: string) => cname.get(s) ?? s

  // 1) Carteira quebrada: cliente ou gestor que não existe mais.
  const orphanClient = i.carteira.filter(c => !cname.has(c.slug)).map(c => c.slug)
  const orphanManager = i.carteira.filter(c => !mname.has(c.managerId)).map(c => `${cn(c.slug)} → ${c.managerId}`)
  if (orphanClient.length) out.push({ id: 'orphan-client', severity: 'error', title: 'Carteira aponta para cliente que não existe', detail: 'Registros sobrando na carteira, sem cliente correspondente.', items: names(orphanClient) })
  if (orphanManager.length) out.push({ id: 'orphan-manager', severity: 'error', title: 'Cliente ligado a gestor que não existe', detail: 'O cliente ficou sem responsável de fato.', items: names(orphanManager) })

  // 2) Mesma conta de anúncios em dois clientes = dado cruzado (o histórico e as métricas de uma conta caem nos dois).
  const byAcc = new Map<string, string[]>()
  for (const c of i.clients) { const a = digits(c.adAccountId); if (a) byAcc.set(a, [...(byAcc.get(a) ?? []), c.name]) }
  const dupAcc = [...byAcc.entries()].filter(([, l]) => l.length > 1).map(([a, l]) => `act_${a}: ${l.join(' e ')}`)
  if (dupAcc.length) out.push({ id: 'dup-account', severity: 'error', title: 'Mesma conta de anúncios em mais de um cliente', detail: 'Os números e o histórico dessa conta aparecem nos dois clientes. Deixe a conta em só um.', items: names(dupAcc) })

  // 3) Página compartilhada (permitido, mas o lead só se separa pela conta de anúncios).
  const byPage = new Map<string, string[]>()
  for (const c of i.clients) if (c.pageId) byPage.set(c.pageId, [...(byPage.get(c.pageId) ?? []), c.name])
  const dupPage = [...byPage.entries()].filter(([, l]) => l.length > 1).map(([p, l]) => `${p}: ${l.join(' e ')}`)
  if (dupPage.length) out.push({ id: 'shared-page', severity: 'info', title: 'Página compartilhada entre clientes', detail: 'Permitido. O Orgânico é igual nos dois e os leads se separam pela conta de anúncios do anúncio.', items: names(dupPage) })

  // 4) Gestores repetidos: mesmo e-mail ou mesmo usuário da Meta em dois gestores.
  const dupBy = (key: (m: AuditInput['managers'][number]) => string) => {
    const g = new Map<string, string[]>()
    for (const m of i.managers) { const k = key(m); if (k) g.set(k, [...(g.get(k) ?? []), m.name]) }
    return [...g.entries()].filter(([, l]) => l.length > 1).map(([k, l]) => `${k}: ${l.join(' e ')}`)
  }
  const dupEmail = dupBy(m => norm(m.email)), dupActor = dupBy(m => m.metaActorId ?? '')
  if (dupEmail.length) out.push({ id: 'dup-email', severity: 'error', title: 'Mesmo e-mail em mais de um gestor', detail: 'A pessoa veria a carteira de só um deles.', items: dupEmail })
  if (dupActor.length) out.push({ id: 'dup-actor', severity: 'error', title: 'Mesmo usuário da Meta em mais de um gestor', detail: 'As alterações seriam atribuídas às duas pessoas.', items: dupActor })

  // 5) Gestor incompleto.
  const noEmail = i.managers.filter(m => !m.email).map(m => m.name)
  if (noEmail.length) out.push({ id: 'no-email', severity: 'warn', title: 'Gestor sem e-mail de login', detail: 'Sem e-mail ele não entra com a própria carteira, não recebe otimizações para justificar e o acesso dele ao app não é medido.', items: noEmail })
  const memberEmails = new Set(i.members.map(m => norm(m.email)))
  const noAccess = i.managers.filter(m => m.email && !memberEmails.has(norm(m.email))).map(m => `${m.name} (${m.email})`)
  if (noAccess.length) out.push({ id: 'no-access', severity: 'info', title: 'Gestor com e-mail que não tem acesso ao painel', detail: 'Se ele deve entrar no painel, crie o acesso em Equipe. Se for só para constar, ignore.', items: names(noAccess) })
  const noActor = i.managers.filter(m => !m.metaActorId).map(m => m.name)
  if (noActor.length) out.push({ id: 'no-actor', severity: 'warn', title: 'Gestor sem usuário da Meta ligado', detail: 'O que ele fizer direto no Gerenciador de Anúncios não é atribuído a ele (só aparece como "autor sem gestor").', items: noActor })

  // 6) Acesso que vê tudo: membro/leitor sem gestor ligado.
  const mgrEmails = new Set(i.managers.map(m => norm(m.email)).filter(Boolean))
  const seeAll = i.members.filter(m => (m.role === 'member' || m.role === 'reader') && !mgrEmails.has(norm(m.email))).map(m => m.email)
  if (seeAll.length) out.push({ id: 'see-all', severity: 'warn', title: 'Acesso que enxerga todos os clientes', detail: 'Membros e leitores sem gestor ligado veem a carteira inteira. Ligue a um gestor para limitar.', items: names(seeAll) })

  // 7) Clientes sem gestor.
  const has = new Set(i.carteira.filter(c => mname.has(c.managerId)).map(c => c.slug))
  const noMgr = i.clients.filter(c => c.active && !has.has(c.slug)).map(c => c.name)
  if (noMgr.length) out.push({ id: 'no-manager', severity: 'warn', title: 'Clientes ativos sem gestor', detail: 'Nada feito nessas contas entra no perfil de ninguém.', items: names(noMgr) })

  // 8) Histórico: linhas sem gestor em cliente que hoje tem (corrigível) e linhas com gestor diferente do atual (só informação).
  const current = new Map(i.carteira.filter(c => mname.has(c.managerId)).map(c => [c.slug, c.managerId]))
  let fixableRows = 0
  const moved = new Map<string, number>()
  for (const r of i.log) {
    const cur = current.get(r.slug)
    if (!cur) continue
    if (r.managerId == null) fixableRows += r.n
    else if (r.managerId !== cur) moved.set(r.slug, (moved.get(r.slug) ?? 0) + r.n)
  }
  if (fixableRows) out.push({ id: 'log-null', severity: 'warn', title: `${fixableRows} ações antigas sem gestor em clientes que hoje têm gestor`, detail: 'Foram lidas antes de o cliente ter gestor. Por isso o perfil mostra menos ações do que aconteceu. Use "Corrigir histórico".' })
  if (moved.size) out.push({ id: 'log-moved', severity: 'info', title: 'Clientes que trocaram de gestor', detail: 'As ações de antes da troca continuam no gestor anterior (é o esperado). A "última ação" da conta considera todas.', items: names([...moved.entries()].map(([s, n]) => `${cn(s)}: ${n} ações do gestor anterior`)) })

  // 9) Ações cruzadas: gestor (pelo usuário da Meta) mexendo na conta de outro gestor. Não é erro; ajuda a ver quem opera onde.
  const actorOwner = new Map<string, string>()
  for (const m of i.managers) if (m.metaActorId) actorOwner.set(`meta:${m.metaActorId}`, m.id)
  for (const m of i.managers) if (m.email) actorOwner.set(norm(m.email), m.id)
  const cross = new Map<string, number>()
  for (const r of i.log) {
    const owner = r.actorKey ? actorOwner.get(r.actorKey) ?? actorOwner.get(norm(r.actorKey)) : undefined
    const cur = current.get(r.slug)
    if (owner && cur && owner !== cur) { const k = `${mname.get(owner)} em conta de ${mname.get(cur)} (${cn(r.slug)})`; cross.set(k, (cross.get(k) ?? 0) + r.n) }
  }
  if (cross.size) out.push({ id: 'cross', severity: 'info', title: 'Gestores mexendo em contas de outros', detail: 'A otimização fica com quem fez (é essa pessoa que justifica). Confira se é cobertura combinada.', items: names([...cross.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`)) })

  // 10) Autores da Meta que não são nenhum gestor.
  const linkedActors = new Set(i.managers.flatMap(m => (m.metaActorId ? [`meta:${m.metaActorId}`] : [])))
  const strangers = new Map<string, number>()
  for (const r of i.log) if (r.source === 'meta' && r.actorKey && !linkedActors.has(r.actorKey)) { const k = r.actorName ?? r.actorKey; strangers.set(k, (strangers.get(k) ?? 0) + r.n) }
  if (strangers.size) out.push({ id: 'strangers', severity: 'info', title: 'Autores na Meta que não são gestores cadastrados', detail: 'Alterações feitas por essas pessoas caem no gestor da conta. Se algum deles é gestor, ligue o usuário da Meta no cadastro dele.', items: names([...strangers.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n} alterações`)) })

  // 11) Contas que a leitura do histórico não consegue ler.
  if (i.syncErrors.length) out.push({ id: 'sync-errors', severity: 'warn', title: 'Contas sem leitura do histórico', detail: 'A última leitura falhou. As ações dessas contas podem estar faltando.', items: names(i.syncErrors.map(e => `${cn(e.slug)}: ${e.error}`)) })

  if (!out.some(f => f.severity === 'error' || f.severity === 'warn')) out.unshift({ id: 'all-ok', severity: 'ok', title: 'Tudo certo', detail: 'Carteira, e-mails, usuários da Meta e histórico consistentes.' })
  const rank: Record<Severity, number> = { error: 0, warn: 1, info: 2, ok: 3 }
  return { findings: out.sort((a, b) => rank[a.severity] - rank[b.severity]), fixableRows }
}
