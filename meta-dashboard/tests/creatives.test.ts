import { describe, expect, it } from 'vitest'
import { buildCreatives, champions, ctrWindows, formatOf, toRenew } from '@/lib/creatives'

const row = (id: string, o: Record<string, unknown> = {}) => ({ ad_id: id, ad_name: `Ad ${id}`, campaign_name: 'Camp', spend: '100', impressions: '5000', clicks: '100', frequency: '1.5', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' }], ...o })
const struct = (id: string, o: Record<string, unknown> = {}) => ({ id, effective_status: 'ACTIVE', creative: { object_type: 'VIDEO', thumbnail_url: `https://x.fbcdn.net/${id}_t.jpg`, ...o } })

describe('criativos: tendência do CTR', () => {
  it('compara os 7 dias mais recentes com os 7 anteriores (14 dias menos 7 dias)', () => {
    // 7d: 2% ; 14d = 7d + anteriores (4%): 100 cliques/2500 imp no 7d; 14d 300 cliques/5000 imp -> anteriores 200/2500 = 8%? usa números redondos
    const w = ctrWindows({ impressions: '2000', clicks: '20' }, { impressions: '4000', clicks: '60' }) // atuais 1%, anteriores 40/2000 = 2%
    expect(w.ctr7).toBeCloseTo(1); expect(w.ctrPrev).toBeCloseTo(2); expect(w.trend).toBe(-50)
  })
  it('sem volume mínimo, sem períodos guardados ou base zerada: não inventa variação', () => {
    expect(ctrWindows({ impressions: '100', clicks: '5' }, { impressions: '5000', clicks: '100' }).trend).toBeNull()
    expect(ctrWindows(undefined, { impressions: '5000', clicks: '100' }).trend).toBeNull()
    expect(ctrWindows({ impressions: '2000', clicks: '20' }, { impressions: '4000', clicks: '20' }).trend).toBeNull() // CTR anterior 0
  })
})

describe('criativos: montagem, campeões e renovação', () => {
  const rows = [
    row('1', { spend: '100', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' }] }),
    row('2', { spend: '50', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' }] }),
    row('3', { spend: '300', frequency: '4.2', clicks: '20', impressions: '5000', actions: [] }),
    row('4', { spend: '0' }),
    row('5', { spend: '20', frequency: '1.2', actions: [] }),
  ]
  const structure = [struct('1'), struct('2', { object_type: 'PHOTO', image_url: 'https://x.fbcdn.net/2.jpg' }), struct('3', { object_type: 'SHARE' }), struct('5'), { id: '9', effective_status: 'PAUSED' }]
  const list = buildCreatives(rows, [row('1', { impressions: '2000', clicks: '20' })], [row('1', { impressions: '4000', clicks: '60' })], structure)

  it('ignora anúncio sem gasto, pega miniatura (imagem antes da miniatura) e formato', () => {
    expect(list.map(c => c.id)).toEqual(['1', '2', '3', '5'])
    expect(list[1]).toMatchObject({ thumb: 'https://x.fbcdn.net/2.jpg', format: 'Imagem ou carrossel' }); expect(list[0]).toMatchObject({ format: 'Vídeo', thumb: 'https://x.fbcdn.net/1_t.jpg' }); expect(list[2].format).toBe('Imagem ou carrossel')
    expect(formatOf(undefined)).toBe('Outros')
  })
  it('campeões: mais resultados; empate pelo menor custo; só quem teve resultado', () => {
    expect(champions(list).map(c => c.id)).toEqual(['2', '1']) // mesmos 10 resultados, o 2 é mais barato
  })
  it('para renovar: fadiga, CTR caindo e gasto alto sem resultado; pausados ficam de fora', () => {
    const renew = toRenew([...list, { ...list[2], id: '7', status: 'PAUSED' }])
    expect(renew.map(c => c.id)).toContain('3'); expect(renew.find(c => c.id === '3')!.flags).toEqual(expect.arrayContaining(['Fadiga alta', 'Sem resultado']))
    expect(renew.find(c => c.id === '1')!.flags).toContain('CTR caindo') // 1% contra 2%
    expect(renew.find(c => c.id === '5')).toBeUndefined(); expect(renew.find(c => c.id === '7')).toBeUndefined()
  })
})
