import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codeHash, generateCode, recoverCode } from '@/lib/accessCode'

beforeEach(() => { process.env.DASHBOARD_SESSION_SECRET = 'segredo-de-teste-do-painel' })
afterEach(() => { delete process.env.DASHBOARD_SESSION_SECRET })

describe('recuperar o token (código) de um cliente a partir do hash', () => {
  it('devolve o mesmo código que gerou o hash, para o cliente certo', async () => {
    const code = '000042'
    expect(await recoverCode('becker', codeHash('becker', code))).toBe(code)
  }, 30_000)

  it('código gerado aleatoriamente também é recuperado', async () => {
    const code = generateCode()
    expect(await recoverCode('dal-moro', codeHash('dal-moro', code))).toBe(code)
  }, 30_000)

  it('hash de outro cliente ou de segredo diferente não vira código (null)', async () => {
    const h = codeHash('becker', '000007')
    expect(await recoverCode('outro-cliente', h)).toBeNull()
  }, 30_000)
})
