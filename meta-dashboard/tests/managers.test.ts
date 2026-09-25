import { describe, expect, it } from 'vitest'
import { activityByClient, classifyChange, cleanManagerInput, cleanReason, groupTasks, isAnswered, matchActor, taskOwner, type TaskRow, countByKind, dailyCounts, idleSlugs, isHumanMetaEvent, kindOfMetaEvent, managerId, metaDelta, metaToLog, objectLabel, type LogRow, type MetaActivity } from '@/lib/managers'

const ev = (o: Partial<MetaActivity>): MetaActivity => ({ event_time: '2026-09-14T12:27:02+0000', event_type: 'update_campaign_run_status', actor_id: '122128246653277733', actor_name: 'William', object_id: '5252', object_name: 'Campanha X', object_type: 'CAMPAIGN_GROUP', translated_event_type: 'Status da campanha atualizado', ...o })
const row = (o: Partial<LogRow>): LogRow => ({ at: '2026-09-24T12:00:00Z', source: 'app', client_slug: 'magtag', manager_id: 'ana', actor_key: 'a@x.com', actor_name: 'Ana', kind: 'status', summary: 's', object_name: null, detail: null, ...o })

describe('cleanManagerInput', () => {
  it('aceita o formulário e limpa os campos', () => {
    const r = cleanManagerInput({ name: '  Ana   Souza ', email: ' ANA@X.com ', metaActorId: '1234567890', metaActorName: 'Ana S', clients: ['magtag', 'magtag', 'becker', 'Bad Slug', 5] })
    expect(r).toEqual({ name: 'Ana Souza', email: 'ana@x.com', metaActorId: '1234567890', metaActorName: 'Ana S', clients: ['magtag', 'becker'] })
  })
  it('recusa nome curto e e-mail inválido; id de usuário da Meta inválido vira vazio', () => {
    expect(cleanManagerInput({ name: 'A' })).toEqual({ error: 'Informe o nome do gestor.' })
    expect(cleanManagerInput({ name: 'Ana', email: 'x' })).toEqual({ error: 'E-mail inválido.' })
    expect(cleanManagerInput({ name: 'Ana', metaActorId: 'abc' })).toMatchObject({ metaActorId: null, email: null, clients: [] })
    expect(cleanManagerInput(null)).toEqual({ error: 'Informe o nome do gestor.' })
  })
  it('gera o identificador do nome, sem acento', () => {
    expect(managerId('João  d\'Ávila')).toBe('joao-d-avila')
  })
})

describe('eventos da Meta', () => {
  it('só autor humano entra (a Meta assina os automáticos com id 0)', () => {
    expect(isHumanMetaEvent(ev({}))).toBe(true)
    expect(isHumanMetaEvent(ev({ actor_id: '0', actor_name: 'Meta' }))).toBe(false)
    expect(isHumanMetaEvent(ev({ actor_id: undefined }))).toBe(false)
  })
  it('classifica o tipo do evento', () => {
    expect(kindOfMetaEvent('update_ad_run_status')).toBe('status')
    expect(kindOfMetaEvent('update_ad_set_budget')).toBe('budget')
    expect(kindOfMetaEvent('update_campaign_group_budget_scheduling_state')).toBe('budget')
    expect(kindOfMetaEvent('update_ad_set_target_spec')).toBe('audience')
    expect(kindOfMetaEvent('update_ad_set_bid_strategy')).toBe('bid')
    expect(kindOfMetaEvent('update_ad_set_optimization_goal')).toBe('bid')
    expect(kindOfMetaEvent('update_ad_creative')).toBe('creative')
    expect(kindOfMetaEvent('add_images')).toBe('creative')
    expect(kindOfMetaEvent('create_ad')).toBe('creative')
    expect(kindOfMetaEvent('create_ad_set')).toBe('structure')
    expect(kindOfMetaEvent('create_campaign_group')).toBe('structure')
    expect(kindOfMetaEvent('algo_novo')).toBe('other')
  })
  it('a Meta chama campanha de CAMPAIGN_GROUP e conjunto de CAMPAIGN', () => {
    expect(objectLabel('CAMPAIGN_GROUP')).toBe('Campanha'); expect(objectLabel('CAMPAIGN')).toBe('Conjunto'); expect(objectLabel('ADGROUP')).toBe('Anúncio'); expect(objectLabel(undefined)).toBe('')
  })
  it('de onde para onde: status, orçamento em reais, estratégia de lance', () => {
    expect(metaDelta('{"old_value":"Ativa","new_value":"Inativa","type":"run_status"}')).toEqual({ from: 'Ativa', to: 'Inativa' })
    const b = metaDelta('{"old_value":{"type":"payment_amount","currency":"BRL","old_value":2500},"new_value":{"type":"payment_amount","currency":"BRL","new_value":1500}}')
    expect(b?.from).toMatch(/25,00/); expect(b?.to).toMatch(/15,00/)
    expect(metaDelta('{"old_value":null,"new_value":"LOWEST_COST_BID_STRATEGY"}')).toEqual({ from: null, to: 'Menor custo' })
  })
  it('sem valor simples (público, criativo) ou JSON ruim: nada', () => {
    expect(metaDelta('{"old_value":[],"new_value":[{"content":"x"}]}')).toBeNull()
    expect(metaDelta('nao json')).toBeNull()
    expect(metaDelta(undefined)).toBeNull()
  })
  it('vira uma linha do histórico, com chave única para não gravar duas vezes', () => {
    const a = metaToLog(ev({ extra_data: '{"old_value":"Ativa","new_value":"Inativa"}' }), 'magtag', 'ana', 'act_1')
    expect(a).toMatchObject({ source: 'meta', client_slug: 'magtag', manager_id: 'ana', actor_key: 'meta:122128246653277733', kind: 'status', summary: 'Status da campanha atualizado', object_name: 'Campanha X', detail: { from: 'Ativa', to: 'Inativa', level: 'Campanha' } })
    expect(a.ext_id).toBe(metaToLog(ev({ extra_data: '{"old_value":"Ativa","new_value":"Inativa"}' }), 'magtag', 'ana', 'act_1').ext_id)
    expect(a.ext_id).not.toBe(metaToLog(ev({ event_time: '2026-09-14T12:28:00+0000' }), 'magtag', 'ana', 'act_1').ext_id)
  })
})

describe('números do perfil', () => {
  it('conta por tipo, do maior para o menor', () => {
    expect(countByKind([row({}), row({}), row({ kind: 'budget' }), row({ kind: 'estranho' })])).toEqual([{ kind: 'status', n: 2 }, { kind: 'budget', n: 1 }, { kind: 'other', n: 1 }])
  })
  it('ações por dia em horário de Brasília, incluindo dias sem ação', () => {
    const now = Date.parse('2026-09-24T15:00:00Z')
    const d = dailyCounts([row({ at: '2026-09-22T12:00:00Z' }), row({ at: '2026-09-24T01:00:00Z' }), row({ at: '2026-09-24T14:00:00Z' })], Date.parse('2026-09-22T00:00:00Z'), now)
    // 24/09 01:00 UTC ainda é 23/09 em Brasília
    expect(d).toEqual([{ day: '2026-09-21', n: 0 }, { day: '2026-09-22', n: 1 }, { day: '2026-09-23', n: 1 }, { day: '2026-09-24', n: 1 }].filter(x => x.day >= '2026-09-21'))
  })
  it('por cliente: ações, otimizações na Meta, última ação; cliente parado aparece com zero', () => {
    const r = activityByClient(['magtag', 'becker', 'parado'], [row({}), row({ kind: 'lead', at: '2026-09-25T10:00:00Z' }), row({ client_slug: 'becker', kind: 'budget' })])
    expect(r[0]).toMatchObject({ slug: 'magtag', actions: 2, optimizations: 1, lastAt: '2026-09-25T10:00:00Z' })
    expect(r[1]).toMatchObject({ slug: 'becker', actions: 1, optimizations: 1 })
    expect(r[2]).toMatchObject({ slug: 'parado', actions: 0, lastAt: null })
  })
  it('clientes sem ação há N dias ou sem nenhuma ação, do mais parado ao menos', () => {
    const now = Date.parse('2026-09-24T12:00:00Z')
    const last = new Map<string, string | null>([['a', '2026-09-23T12:00:00Z'], ['b', '2026-09-10T12:00:00Z'], ['c', null]])
    expect(idleSlugs(last, ['a', 'b', 'c'], 7, now).map(x => [x.slug, x.daysIdle])).toEqual([['c', null], ['b', 14]])
  })
})

describe('matchActor', () => {
  const actors = [{ id: '1', name: 'William Castro Fagundes' }, { id: '2', name: 'Arthur Sauter' }, { id: '3', name: 'Jonatan W Silveira' }, { id: '4', name: 'Paulo Henrique Carvalho Souza' }]
  it('acha pelo nome, ignorando acento, maiúscula e "de/da"', () => {
    expect(matchActor('William de Castro', actors)?.id).toBe('1')
    expect(matchActor('arthur sauter', actors)?.id).toBe('2')
    expect(matchActor('Jônatan Silveira', actors)?.id).toBe('3') // o acento não atrapalha e a letra do meio da Meta não precisa estar no nome do gestor
  })
  it('nome de uma palavra só exige nome igual; ambíguo ou sem par não liga', () => {
    expect(matchActor('Will', actors)).toBeNull()
    expect(matchActor('Arthur', actors)).toBeNull() // o nome da Meta tem duas palavras
    expect(matchActor('Paulo', [...actors, { id: '5', name: 'Paulo Souza' }])).toBeNull()
    expect(matchActor('Paulo Souza', [{ id: '4', name: 'Paulo Henrique Carvalho Souza' }, { id: '5', name: 'Paulo Souza' }])).toBeNull() // dois candidatos
    expect(matchActor('', actors)).toBeNull()
  })
})

describe('justificativas', () => {
  const t = (id: number, min: number, o: Partial<TaskRow> = {}): TaskRow => ({ id, at: new Date(Date.parse('2026-09-25T12:00:00Z') + min * 60_000).toISOString(), source: 'meta', client_slug: 'magtag', manager_id: 'ana', actor_key: 'meta:1', actor_name: 'Ana', kind: 'status', event_type: 'update_ad_run_status', object_type: 'ADGROUP', summary: 'Status do anúncio atualizado', object_name: `AD ${id}`, detail: { from: 'Ativo', to: 'Inativo' }, reason: null, reason_kind: null, reasoned_at: null, ...o })

  it('o que a Meta faz sozinha não é decisão do gestor: estados internos, programação de orçamento e biblioteca de imagens ficam de fora', () => {
    expect(classifyChange(t(1, 0, { detail: { from: 'Processo pendente', to: 'Análise pendente' } }))).toBeNull()
    expect(classifyChange(t(1, 0, { detail: { from: 'Ativo', to: 'Processo pendente' } }))).toBeNull()
    expect(classifyChange(t(1, 0, { detail: { from: 'Processo pendente', to: 'Ativo' } }))).toBeNull()
    expect(classifyChange(t(1, 0, { kind: 'budget', event_type: 'update_campaign_group_budget_scheduling_state' }))).toBeNull()
    expect(classifyChange(t(1, 0, { kind: 'creative', event_type: 'add_images', object_type: 'ACCOUNT' }))).toBeNull()
  })
  it('pausar e ativar contam; ligar é "Inativo → qualquer coisa", o caminho até Ativo é a Meta revisando', () => {
    expect(classifyChange(t(1, 0))).toEqual({ action: 'pausou', level: 'anúncio' })
    expect(classifyChange(t(1, 0, { detail: { from: 'Ativa', to: 'Inativa' }, object_type: 'CAMPAIGN_GROUP' }))).toEqual({ action: 'pausou', level: 'campanha' })
    expect(classifyChange(t(1, 0, { detail: { from: 'Inativo', to: 'Processo pendente' }, object_type: 'CAMPAIGN' }))).toEqual({ action: 'ativou', level: 'conjunto' })
    expect(classifyChange(t(1, 0, { detail: { from: 'Inativo', to: 'Ativo' } }))).toEqual({ action: 'ativou', level: 'anúncio' })
  })
  it('tudo da mesma pessoa no mesmo cliente numa sessão vira uma tarefa, com uma frase; conta objetos, não eventos', () => {
    const rows = [
      t(1, 0, { kind: 'structure', event_type: 'create_campaign_group', object_type: 'CAMPAIGN_GROUP', object_name: 'Camp A', detail: null }),
      t(2, 1, { kind: 'structure', event_type: 'create_ad_set', object_type: 'CAMPAIGN', object_name: 'Conj A', detail: null }),
      t(3, 2, { kind: 'structure', event_type: 'create_ad_set', object_type: 'CAMPAIGN', object_name: 'Conj B', detail: null }),
      t(4, 3, { kind: 'creative', event_type: 'create_ad', object_name: 'Ad A', detail: null }),
      t(5, 4, { kind: 'bid', event_type: 'update_ad_set_bid_strategy', object_type: 'CAMPAIGN', object_name: 'Conj A', detail: { from: null, to: 'Menor custo' } }),
      t(6, 5, { kind: 'bid', event_type: 'update_ad_set_bid_strategy', object_type: 'CAMPAIGN', object_name: 'Conj A', detail: { from: null, to: 'Menor custo' } }),
      t(7, 6, { kind: 'budget', event_type: 'update_campaign_group_budget_scheduling_state', detail: { from: null, to: 'false' } }), // ruído
    ]
    const tasks = groupTasks(rows)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].headline).toBe('Criou 1 campanha, 2 conjuntos e 1 anúncio · Mudou o lance ou a otimização de 1 conjunto')
    expect(tasks[0].ids).toEqual([1, 2, 3, 4, 5, 6]) // o ruído não entra
    expect(tasks[0].kind).toBe('structure')
  })
  it('pausas: "Pausou 3 conjuntos" mesmo que cada um tenha mudado de estado várias vezes', () => {
    const c = (id: number, name: string, from: string, to: string) => t(id, id, { object_type: 'CAMPAIGN', object_name: name, detail: { from, to } })
    const [task] = groupTasks([c(1, 'A', 'Ativo', 'Inativo'), c(2, 'B', 'Ativo', 'Inativo'), c(3, 'C', 'Ativo', 'Inativo'), c(4, 'C', 'Inativo', 'Processo pendente'), c(5, 'C', 'Processo pendente', 'Ativo')])
    expect(task.headline).toBe('Pausou 3 conjuntos · Ativou 1 conjunto')
  })
  it('orçamento com um objeto só mostra o de → para', () => {
    const [task] = groupTasks([t(1, 0, { kind: 'budget', event_type: 'update_ad_set_budget', object_type: 'CAMPAIGN', object_name: 'Conj', detail: { from: 'R$ 25,00', to: 'R$ 15,00' } })])
    expect(task.headline).toBe('Mudou o orçamento de 1 conjunto (R$ 25,00 → R$ 15,00)')
  })
  it('pessoa ou cliente diferente não juntam; 30 min de intervalo separa; só ruído não vira tarefa', () => {
    expect(groupTasks([t(1, 0), t(2, 1, { client_slug: 'becker' }), t(3, 2, { actor_key: 'meta:9' }), t(4, 90)])).toHaveLength(4)
    expect(groupTasks([t(1, 0, { detail: { from: 'Processo pendente', to: 'Análise pendente' } })])).toHaveLength(0)
    expect(groupTasks([t(1, 0, { kind: 'lead', event_type: null }), t(2, 1, { kind: 'report', event_type: null })])).toHaveLength(0)
  })
  it('respondida quando alguma alteração do grupo tem motivo ou texto', () => {
    const [a] = groupTasks([t(1, 0), t(2, 5, { reason_kind: 'cost', reason: 'CPL alto', reasoned_at: '2026-09-25T13:00:00Z' })])
    expect(isAnswered(a)).toBe(true)
    expect(a).toMatchObject({ reasonKind: 'cost', reason: 'CPL alto' })
    expect(isAnswered(groupTasks([t(1, 0)])[0])).toBe(false)
  })
  it('dono: quem fez, se é gestor cadastrado; senão o gestor da conta', () => {
    const ms = [{ id: 'ana', email: 'ana@x.com', metaActorId: '1' }, { id: 'bruno', email: 'b@x.com', metaActorId: '2' }]
    expect(taskOwner({ actorKey: 'meta:2', managerId: 'ana' }, ms)).toBe('bruno')
    expect(taskOwner({ actorKey: 'b@x.com', managerId: 'ana' }, ms)).toBe('bruno')
    expect(taskOwner({ actorKey: 'meta:99', managerId: 'ana' }, ms)).toBe('ana')
    expect(taskOwner({ actorKey: null, managerId: null }, ms)).toBeNull()
  })
  it('valida a justificativa: motivo da lista e/ou texto', () => {
    expect(cleanReason({ reasonKind: 'cost' })).toEqual({ reasonKind: 'cost', reason: null })
    expect(cleanReason({ reason: '  Custo   alto  ' })).toEqual({ reasonKind: null, reason: 'Custo alto' })
    expect(cleanReason({ reasonKind: 'inventado', reason: 'custo' })).toEqual({ reasonKind: null, reason: 'custo' })
    expect(cleanReason({})).toHaveProperty('error')
    expect(cleanReason({ reason: 'a' })).toHaveProperty('error')
    expect((cleanReason({ reason: 'x'.repeat(900) }) as { reason: string }).reason).toHaveLength(500)
  })
})
