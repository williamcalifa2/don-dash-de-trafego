import { describe, expect, it, vi } from 'vitest'
import { MetaPolicyError } from '@/lib/meta/allowlist'
import { ctx, harness, json } from './helpers'

const INSIGHTS = 'act_1234567/insights?fields=spend,impressions&level=ad&date_preset=last_7d&limit=100'

describe('cliente central: somente leitura e token', () => {
  it('envia GET com o token no cabeçalho e nunca na URL', async () => {
    const h = harness(() => json({ data: [] }))
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.ok).toBe(true)
    const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN_DE_TESTE_123456')
    expect(url).not.toContain('TOKEN_DE_TESTE')
    expect(url).not.toContain('access_token')
    expect(url).toContain('/v20.0/act_1234567/insights')
  })

  it('a versão da API vem da configuração', async () => {
    const h = harness(() => json({}), { cfg: { apiVersion: 'v22.0' } })
    await h.client.get(INSIGHTS, ctx())
    expect(String(h.fetchMock.mock.calls[0][0])).toContain('/v22.0/')
  })

  it('endpoint fora da allowlist lança erro ANTES de sair e fica registrado', async () => {
    const h = harness(() => json({}))
    await expect(h.client.get('1234567890/subscribed_apps', ctx())).rejects.toBeInstanceOf(MetaPolicyError)
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(h.records[0].outcome).toContain('blocked_policy')
  })

  it('nenhuma chamada usa método diferente de GET (e o POST do batch só leva GETs)', async () => {
    const h = harness(() => json([{ code: 200, body: '{"data":[]}' }]))
    await h.client.get(INSIGHTS, ctx())
    await h.client.batch([INSIGHTS], ctx())
    const methods = h.fetchMock.mock.calls.map(c => (c[1] as RequestInit).method)
    expect(methods).toEqual(['GET', 'POST'])
    const body = new URLSearchParams((h.fetchMock.mock.calls[1][1] as RequestInit).body as string).get('batch')!
    expect(JSON.parse(body).every((i: { method: string }) => i.method === 'GET')).toBe(true)
  })
})

describe('cliente central: falha segura', () => {
  it('sem token não chama a Meta', async () => {
    const h = harness(() => json({}), { getToken: () => undefined })
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.blocked).toBe('no_token')
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('gate negando ou falhando impede a chamada', async () => {
    const deny = harness(() => json({}), { gate: () => ({ allow: false, reason: 'account_blocked' }) })
    expect((await deny.client.get(INSIGHTS, ctx())).blocked).toBe('account_blocked')
    expect(deny.fetchMock).not.toHaveBeenCalled()

    const boom = harness(() => json({}), { gate: () => { throw new Error('banco fora do ar') } })
    expect((await boom.client.get(INSIGHTS, ctx())).blocked).toBe('gate_error')
    expect(boom.fetchMock).not.toHaveBeenCalled()
  })

  it('DRY_RUN registra o que seria chamado e não chama', async () => {
    const h = harness(() => json({}), { cfg: { dryRun: true } })
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.dryRun).toBe(true)
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(h.records[0]).toMatchObject({ outcome: 'dry_run', dryRun: true, endpoint: 'act_1234567/insights' })
  })

  it('caminho antigo (legacy) não é bloqueado por DRY_RUN, mas o corte final o desliga', async () => {
    const live = harness(() => json({}), { cfg: { dryRun: true, legacyLive: true } })
    expect((await live.client.get(INSIGHTS, ctx({ origin: 'legacy' }))).ok).toBe(true)
    expect(live.fetchMock).toHaveBeenCalledTimes(1)

    const cut = harness(() => json({}), { cfg: { legacyLive: false } })
    expect((await cut.client.get(INSIGHTS, ctx({ origin: 'legacy' }))).blocked).toBe('legacy_disabled')
    expect(cut.fetchMock).not.toHaveBeenCalled()
  })
})

describe('cliente central: erros e retry', () => {
  it.each([4, 17, 613, 80000, 80004, 80005])('erro de limite (%i) nunca tem retry', async code => {
    const h = harness(() => json({ error: { code, message: 'limite' } }, { status: 400 }))
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.error?.kind).toBe('rate_limit')
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
    expect(h.sleep).not.toHaveBeenCalled()
  })

  it('HTTP 429, permissão e token não têm retry', async () => {
    for (const [status, body, kind] of [[429, {}, 'rate_limit'], [403, { error: { code: 200 } }, 'permission'], [400, { error: { code: 190 } }, 'token']] as const) {
      const h = harness(() => json(body, { status }))
      expect((await h.client.get(INSIGHTS, ctx())).error?.kind).toBe(kind)
      expect(h.fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('falha de rede tem no máximo 2 retries, com backoff exponencial e jitter limitado', async () => {
    const h = harness(() => { throw new TypeError('fetch failed') }, { cfg: { backoffBaseMs: 100, backoffMaxMs: 150 } })
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.ok).toBe(false)
    expect(r.error?.kind).toBe('transient')
    expect(h.fetchMock).toHaveBeenCalledTimes(3)
    const delays = h.sleep.mock.calls.map(c => c[0] as number)
    expect(delays).toHaveLength(2)
    expect(delays[0]).toBe(75)       // 100 * (0.5 + 0.5*0.5)
    expect(delays[1]).toBeLessThanOrEqual(150) // teto
  })

  it('503 é tentado de novo e pode dar certo', async () => {
    let n = 0
    const h = harness(() => (++n < 2 ? json({}, { status: 503 }) : json({ data: [1] })))
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(2)
  })

  it('timeout aborta a chamada (e conta como falha de rede)', async () => {
    const h = harness((_u, init) => new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))), { cfg: { timeoutMs: 20, netRetries: 0 } })
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.ok).toBe(false)
    expect(r.error?.kind).toBe('transient')
  })

  it('a mensagem de erro devolvida sai sem token', async () => {
    const h = harness(() => json({ error: { code: 100, message: 'x access_token=EAABsecretsecretsecret123' } }, { status: 400 }))
    const r = await h.client.get(INSIGHTS, ctx())
    expect(JSON.stringify(r.error)).not.toContain('EAABsecret')
  })
})

describe('cliente central: uso, single-flight e batch', () => {
  it('lê os headers de uso, registra e avisa o controle de limites', async () => {
    const onResult = vi.fn()
    const h = harness(() => json({ data: [] }, { headers: {
      'x-business-use-case-usage': JSON.stringify({ '1': [{ call_count: 40, total_cputime: 10, total_time: 10, estimated_time_to_regain_access: 0 }] }),
      'x-app-usage': JSON.stringify({ call_count: 5, total_cputime: 5, total_time: 5 }),
    } }), { onResult })
    const r = await h.client.get(INSIGHTS, ctx())
    expect(r.usage?.accountMaxPct).toBe(40)
    expect(h.records[0]).toMatchObject({ outcome: 'ok', clientId: 'c1', accountId: 'act_1234567' })
    expect(h.records[0].usage?.appMaxPct).toBe(5)
    expect(onResult).toHaveBeenCalledOnce()
  })

  it('single-flight: pedidos idênticos simultâneos viram uma única chamada', async () => {
    let release!: () => void
    const gateOpen = new Promise<void>(r => { release = r })
    const h = harness(async () => { await gateOpen; return json({ data: [1] }) })
    const a = h.client.get(INSIGHTS, ctx())
    const b = h.client.get(INSIGHTS, ctx())
    const c = h.client.get(`${INSIGHTS}&after=CUR`, ctx()) // diferente: sai outra chamada
    release()
    await Promise.all([a, b, c])
    expect(h.fetchMock).toHaveBeenCalledTimes(2)
    // depois de terminar, um novo pedido volta a chamar
    await h.client.get(INSIGHTS, ctx())
    expect(h.fetchMock).toHaveBeenCalledTimes(3)
  })

  it('batch: valida cada item, limita o tamanho e mapeia as respostas', async () => {
    const h = harness(() => json([{ code: 200, body: '{"id":"1"}' }, { code: 400, body: '{"error":{"code":100,"message":"x"}}' }]), { cfg: { batchMax: 3 } })
    const r = await h.client.batch(['act_1234567/campaigns?fields=id', 'act_1234567/ads?fields=id'], ctx())
    expect(r.ok).toBe(true)
    expect(r.data[0].ok).toBe(true)
    expect(r.data[1].error?.kind).toBe('client')
    expect(h.records[0].calls).toBe(2) // um batch conta como N chamadas

    await expect(h.client.batch(['act_1234567/adcreatives'], ctx())).rejects.toBeInstanceOf(MetaPolicyError)
    await expect(h.client.batch([], ctx())).rejects.toBeInstanceOf(MetaPolicyError)
    await expect(h.client.batch(Array(4).fill('act_1234567/ads?fields=id'), ctx())).rejects.toBeInstanceOf(MetaPolicyError)
  })
})
