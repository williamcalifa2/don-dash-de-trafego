import { describe, expect, it } from 'vitest'
import { fmtPhone, normalizePhone, samePhone } from '@/lib/leadUtils'
import { previewSrc } from '@/lib/adPreview'
import { lockedMinutes, withFailure, withoutIp, IP_MAX, ALL_MAX, WINDOW_MS, type LockState } from '@/lib/adminLock'
import { moveItem } from '@/lib/adminCard'

describe('telefone digitado à mão', () => {
  it('vira o mesmo formato do Meta (+55DDD...)', () => {
    expect(normalizePhone('(51) 98888-7777')).toBe('+5551988887777')
    expect(normalizePhone('51 3333-4444')).toBe('+555133334444')
    expect(normalizePhone('55 51 98888-7777')).toBe('+5551988887777')
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671')
    expect(normalizePhone('abc')).toBe('')
  })
  it('exibe formatado com ou sem +55', () => {
    expect(fmtPhone('+5551988887777')).toBe('+55 (51) 98888-7777')
    expect(fmtPhone('51988887777')).toBe('(51) 98888-7777')
    expect(fmtPhone('+14155552671')).toBe('+14155552671')
  })
  it('reconhece o mesmo número em formatos diferentes, mas não números curtos', () => {
    expect(samePhone('+5551988887777', '(51) 98888-7777')).toBe(true)
    expect(samePhone('51988887777', '+55 51 98888-7777')).toBe(true)
    expect(samePhone('+5551988887777', '+5551988887778')).toBe(false)
    expect(samePhone('123', '123')).toBe(false)
    expect(samePhone(null, '+5551988887777')).toBe(false)
  })
})

describe('prévia do anúncio', () => {
  it('extrai só o endereço do iframe da Meta', () => {
    expect(previewSrc('<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=1&amp;t=2" width="320"></iframe>')).toBe('https://www.facebook.com/ads/api/preview_iframe.php?d=1&t=2')
  })
  it('recusa outros domínios, http, javascript: e HTML solto', () => {
    expect(previewSrc('<iframe src="https://evil.com/x"></iframe>')).toBeNull()
    expect(previewSrc('<iframe src="https://facebook.com.evil.com/x"></iframe>')).toBeNull()
    expect(previewSrc('<iframe src="http://www.facebook.com/x"></iframe>')).toBeNull()
    expect(previewSrc('<iframe src="javascript:alert(1)"></iframe>')).toBeNull()
    expect(previewSrc('<img src=x onerror=alert(1)>')).toBeNull()
    expect(previewSrc(null)).toBeNull()
  })
})

describe('bloqueio do login do admin', () => {
  const empty: LockState = { all: { n: 0, first: 0 }, ips: {} }
  const t0 = 1_000_000
  it('bloqueia o IP depois de várias falhas e libera quando a janela passa', () => {
    let s = empty
    for (let i = 0; i < IP_MAX - 1; i++) s = withFailure(s, '1.1.1.1', t0 + i)
    expect(lockedMinutes(s, '1.1.1.1', t0 + 10)).toBeNull()
    s = withFailure(s, '1.1.1.1', t0 + 20)
    expect(lockedMinutes(s, '1.1.1.1', t0 + 30)).toBe(15)
    expect(lockedMinutes(s, '2.2.2.2', t0 + 30)).toBeNull() // outro IP não é afetado
    expect(lockedMinutes(s, '1.1.1.1', t0 + WINDOW_MS + 100)).toBeNull()
  })
  it('bloqueia todo mundo se o total de falhas passa do limite geral', () => {
    let s = empty
    for (let i = 0; i < ALL_MAX; i++) s = withFailure(s, `9.9.9.${i}`, t0)
    expect(lockedMinutes(s, '8.8.8.8', t0 + 1000)).not.toBeNull()
  })
  it('login certo limpa as falhas do IP e falhas antigas saem do registro', () => {
    let s = empty
    for (let i = 0; i < IP_MAX; i++) s = withFailure(s, '1.1.1.1', t0)
    expect(lockedMinutes(withoutIp(s, '1.1.1.1'), '1.1.1.1', t0 + 1)).toBeNull()
    expect(Object.keys(withFailure(s, '3.3.3.3', t0 + WINDOW_MS + 1).ips)).toEqual(['3.3.3.3'])
  })
})

describe('reordenar métricas do card', () => {
  it('move para cima e para baixo e ignora índices inválidos', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 2, 0)).toEqual(['c', 'a', 'b', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })
  it('não altera a lista original', () => {
    const l = ['a', 'b', 'c']; moveItem(l, 0, 2); expect(l).toEqual(['a', 'b', 'c'])
  })
})

import { prevTimeRange } from '@/lib/meta'
import { sliceDaily } from '@/lib/meta/read'
import { leadsInPeriod } from '@/lib/leadUtils'
import type { Lead } from '@/lib/leadTypes'

describe('períodos: hoje, 7/14/30 dias e este mês', () => {
  // 21/set/2026, 10:00 no Brasil
  const now = Date.UTC(2026, 8, 21, 13, 0, 0)
  const range = (p: Parameters<typeof prevTimeRange>[0]) => JSON.parse(prevTimeRange(p, now)) as { since: string; until: string }

  it('o período anterior de 7 dias são os 7 dias imediatamente antes, sem sobrepor', () => {
    expect(range('last_7d')).toEqual({ since: '2026-09-07', until: '2026-09-13' }) // atual: 14 a 20/09
    expect(range('last_30d')).toEqual({ since: '2026-07-23', until: '2026-08-21' }) // atual: 22/08 a 20/09
  })
  it('hoje compara com ontem', () => { expect(range('today')).toEqual({ since: '2026-09-20', until: '2026-09-20' }) })
  it('este mês compara o mesmo trecho do mês passado', () => {
    expect(range('this_month')).toEqual({ since: '2026-08-01', until: '2026-08-21' })
    expect(JSON.parse(prevTimeRange('this_month', Date.UTC(2026, 2, 31, 13)))).toEqual({ since: '2026-02-01', until: '2026-02-28' }) // 31/mar vs fevereiro inteiro
  })
  it('a série diária de este mês começa no dia 1', () => {
    const rows = [{ date_start: '2026-08-31' }, { date_start: '2026-09-01' }, { date_start: '2026-09-20' }]
    expect(sliceDaily(rows, 'this_month', new Date(now)).map(r => r.date_start)).toEqual(['2026-09-01', '2026-09-20'])
  })
  it('leads de este mês: do dia 1 até agora; o anterior é o mesmo trecho do mês passado', () => {
    const at = (iso: string) => ({ created_at: iso } as unknown as Lead)
    const y = new Date().getFullYear(), m = new Date().getMonth()
    const thisMonth = at(new Date(y, m, 1, 12).toISOString())
    const lastMonth = at(new Date(y, m - 1, 1, 12).toISOString())
    const old = at(new Date(y, m - 2, 1, 12).toISOString())
    expect(leadsInPeriod([thisMonth, lastMonth, old], 'this_month')).toEqual([thisMonth])
    expect(leadsInPeriod([thisMonth, lastMonth, old], 'this_month', 1)).toEqual([lastMonth])
  })
})

import { metaTotals, periodKeys } from '@/lib/adminResults'
import { aggregate } from '@/lib/adminOverview'

describe('admin: hoje e este mês', () => {
  const now = Date.UTC(2026, 8, 21, 13, 0, 0) // 21/set, 10:00 no Brasil
  const rows = [
    { date_start: '2026-08-31', spend: '5' }, { date_start: '2026-09-01', spend: '10' }, { date_start: '2026-09-20', spend: '20' },
    { date_start: '2026-09-21', spend: '7' }, // hoje (vem da cópia do período "hoje")
  ]
  it('os dias de cada período', () => {
    expect(periodKeys(now, 'today')).toEqual(['2026-09-21'])
    expect(periodKeys(now, 'month')).toHaveLength(21)
    expect(periodKeys(now, 'month')[0]).toBe('2026-09-01')
    expect(periodKeys(now, 7).at(-1)).toBe('2026-09-20') // 7 dias terminam em ontem
  })
  it('totais de hoje, do mês e de 7 dias', () => {
    expect(metaTotals(rows, now, 'today').spend).toBe(7)
    expect(metaTotals(rows, now, 'month').spend).toBe(37) // 10 + 20 + 7; 31/08 fica de fora
    expect(metaTotals(rows, now, 7).spend).toBe(20) // 14 a 20/09
  })
  it('visão geral: mês compara com o mesmo trecho do mês passado e hoje com ontem', () => {
    const r = [{ date_start: '2026-08-01', spend: '60' }, { date_start: '2026-08-05', spend: '40' }, { date_start: '2026-08-25', spend: '999' }, { date_start: '2026-09-05', spend: '50' }]
    const m = aggregate([r], 1, now, 'month')
    expect(m.totals.spend).toBe(50); expect(m.prev?.spend).toBe(100) // 25/08 está depois do dia 21: fora do trecho equivalente
    expect(m.dates).toHaveLength(21)
    // Série de ~30 dias (começa em 22/08): o mês passado inteiro NÃO está coberto, então não compara (evita variações como +43000%)
    const short = Array.from({ length: 30 }, (_, i) => ({ date_start: new Date(Date.UTC(2026, 7, 22 + i)).toISOString().slice(0, 10), spend: '100' }))
    expect(aggregate([short], 1, now, 'month').prev).toBeNull()
    const t = aggregate([[{ date_start: '2026-09-20', spend: '30' }, { date_start: '2026-09-21', spend: '8' }]], 1, now, 'today')
    expect(t.totals.spend).toBe(8); expect(t.prev?.spend).toBe(30); expect(t.dates).toHaveLength(1)
  })
})

import { platformsFor } from '@/lib/platforms'
describe('plataformas do cliente', () => {
  it('mostra Meta quando há conta de anúncios e nada quando não há', () => {
    expect(platformsFor({ adAccountId: 'act_123' })).toEqual(['meta'])
    expect(platformsFor({ adAccountId: null })).toEqual([])
    expect(platformsFor({})).toEqual([])
  })
})
