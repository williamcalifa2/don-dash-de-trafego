import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extractLeadEvents, MemoryEventStore, processEvents, verifySignature, type ProcessDeps } from '@/lib/meta/webhook'

const SECRET = 'segredo-do-app-123'
const sign = (body: string, secret = SECRET) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
const payload = (ids: string[]) => ({ object: 'page', entry: [{ id: '111222333', time: 1, changes: ids.map(id => ({ field: 'leadgen', value: { leadgen_id: id, page_id: '111222333', ad_id: '444555666', form_id: '9', created_time: 1 } })) }] })

describe('assinatura do webhook', () => {
  const body = JSON.stringify(payload(['12345678']))
  it('aceita assinatura correta', () => expect(verifySignature(body, sign(body), SECRET)).toBe(true))
  it('recusa: assinatura errada, ausente, corpo adulterado, segredo errado, tamanho diferente', () => {
    expect(verifySignature(body, sign(body, 'outro'), SECRET)).toBe(false)
    expect(verifySignature(body, null, SECRET)).toBe(false)
    expect(verifySignature(body, '', SECRET)).toBe(false)
    expect(verifySignature(body + ' ', sign(body), SECRET)).toBe(false)
    expect(verifySignature(body, 'sha256=abc', SECRET)).toBe(false)
    expect(verifySignature(body, sign(body), '')).toBe(false)
  })
})

describe('extração dos eventos', () => {
  it('pega só IDs de eventos leadgen', () => {
    expect(extractLeadEvents(payload(['12345678', '87654321']))).toEqual([
      { leadgenId: '12345678', pageId: '111222333', adId: '444555666' },
      { leadgenId: '87654321', pageId: '111222333', adId: '444555666' },
    ])
  })
  it('ignora campos que não são leadgen, IDs inválidos e lixo', () => {
    expect(extractLeadEvents({ entry: [{ changes: [{ field: 'feed', value: { leadgen_id: '12345678' } }, { field: 'leadgen', value: { leadgen_id: 'abc; drop' } }] }] })).toEqual([])
    expect(extractLeadEvents(null)).toEqual([]); expect(extractLeadEvents({ entry: 'x' })).toEqual([]); expect(extractLeadEvents('lixo')).toEqual([])
  })
})

describe('fila de eventos: idempotência e processamento', () => {
  let store: MemoryEventStore, now: number
  let saved: string[]
  const deps = (over: Partial<ProcessDeps> = {}): ProcessDeps => ({
    store, now: () => now, maxAttempts: 3, retryBaseSec: 60, batch: 10,
    resolveClient: async () => 'c1',
    fetchLead: async () => ({ ok: true, data: { field_data: [] } }),
    saveLead: async (_c, id) => { saved.push(id); return true },
    ...over,
  })
  beforeEach(() => { store = new MemoryEventStore(); now = 1_800_000_000_000; saved = [] })

  it('entrega duplicada do mesmo lead entra uma vez só', async () => {
    const [e] = extractLeadEvents(payload(['12345678']))
    expect(await store.add(e, now)).toBe(true)
    expect(await store.add(e, now)).toBe(false)
    await processEvents(deps())
    expect(saved).toEqual(['12345678'])
    expect(await store.add(e, now)).toBe(false) // mesmo depois de processado
    await processEvents(deps())
    expect(saved).toEqual(['12345678'])
  })

  it('a fila guarda só IDs (nenhum dado pessoal)', async () => {
    const [e] = extractLeadEvents(payload(['12345678']))
    await store.add(e, now)
    expect(Object.keys(store.rows.get('12345678')!).sort()).toEqual(['adId', 'attempts', 'leadgenId', 'pageId', 'runAfter', 'status'])
  })

  it('limite/bloqueio: adia sem gastar tentativa e nunca insiste na hora', async () => {
    await store.add({ leadgenId: '12345678', pageId: '1', adId: '2' }, now)
    const r = await processEvents(deps({ fetchLead: async () => ({ ok: false, blocked: 'account_blocked' }) }))
    expect(r.deferred).toBe(1)
    const row = store.rows.get('12345678')!
    expect(row.attempts).toBe(0); expect(row.status).toBe('pending'); expect(row.runAfter).toBe(now + 60_000)
    expect((await processEvents(deps())).processed).toBe(0) // ainda não venceu
  })

  it('falha: backoff exponencial e, esgotado, marca como falho e avisa (sem laço)', async () => {
    const onFailed = vi.fn()
    await store.add({ leadgenId: '12345678', pageId: '1', adId: '2' }, now)
    const bad = deps({ fetchLead: async () => ({ ok: false, error: 'boom' }), onFailed })
    await processEvents(bad); expect(store.rows.get('12345678')!.runAfter).toBe(now + 60_000)
    now += 61_000; await processEvents(bad); expect(store.rows.get('12345678')!.runAfter).toBe(now + 120_000)
    now += 121_000; const r = await processEvents(bad)
    expect(r.failed).toBe(1); expect(store.rows.get('12345678')!.status).toBe('failed'); expect(onFailed).toHaveBeenCalledOnce()
    now += 10 * 3_600_000
    expect((await processEvents(bad)).processed).toBe(0) // falho não volta sozinho
  })

  it('cliente não identificado não vira lead de ninguém', async () => {
    await store.add({ leadgenId: '12345678', pageId: '1', adId: '2' }, now)
    const save = vi.fn(async () => true)
    await processEvents(deps({ resolveClient: async () => null, saveLead: save }))
    expect(save).not.toHaveBeenCalled()
  })

  it('erro inesperado no processamento não derruba o lote', async () => {
    await store.add({ leadgenId: '11111111', pageId: '1', adId: '2' }, now)
    await store.add({ leadgenId: '22222222', pageId: '1', adId: '2' }, now)
    let n = 0
    const r = await processEvents(deps({ saveLead: async (_c, id) => { if (++n === 1) throw new Error('db'); saved.push(id); return true } }))
    expect(r.processed).toBe(2); expect(saved).toEqual(['22222222'])
  })
})
