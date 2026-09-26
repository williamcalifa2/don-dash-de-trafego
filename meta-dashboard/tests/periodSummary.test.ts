import { describe, expect, it } from 'vitest'
import { addCounts, emptyCounts, summarize, totalOf } from '@/lib/periodSummary'
import type { LogRow } from '@/lib/managers'

const row = (o: Partial<LogRow> & { event_type: string; object_type: string }): LogRow => ({ at: '2026-09-25T12:00:00Z', source: 'meta', client_slug: 'a', manager_id: null, actor_key: 'ana', actor_name: 'Ana', kind: 'status', summary: 's', object_name: 'X', detail: null, ...o })
const pause = (name: string, level = 'CAMPAIGN_GROUP', id?: string) => row({ event_type: 'update_campaign_run_status', object_type: level, object_name: name, kind: 'status', detail: { from: 'Ativo', to: 'Inativo', ...(id ? { objectId: id } : {}) } })

describe('resumo do período', () => {
  it('conta objetos diferentes uma vez por tipo de ação', () => {
    const m = summarize([pause('A'), pause('A'), pause('B'), pause('C', 'CAMPAIGN')], () => 'ana')
    const c = m.get('ana')!
    expect(c.pausou.campanha).toBe(2)
    expect(c.pausou.conjunto).toBe(1)
  })
  it('usa o id do objeto quando existe (dois com o mesmo nome contam separado)', () => {
    const m = summarize([pause('A', 'CAMPAIGN_GROUP', '1'), pause('A', 'CAMPAIGN_GROUP', '2')], () => 'ana')
    expect(m.get('ana')!.pausou.campanha).toBe(2)
  })
  it('conta orçamento, público, lance e criativo', () => {
    const rows = [
      row({ event_type: 'update_ad_set_budget', object_type: 'CAMPAIGN', kind: 'budget', object_name: 'c1' }),
      row({ event_type: 'update_ad_set_target_spec', object_type: 'CAMPAIGN', kind: 'audience', object_name: 'c1' }),
      row({ event_type: 'update_ad_creative', object_type: 'ADGROUP', kind: 'creative', object_name: 'ad1' }),
      row({ event_type: 'update_ad_creative', object_type: 'ADGROUP', kind: 'creative', object_name: 'ad2' }),
    ]
    const c = summarize(rows, () => 'ana').get('ana')!
    expect([c.orcamento, c.publico, c.criativo]).toEqual([1, 1, 2])
  })
  it('ignora ruído da Meta e linha sem grupo', () => {
    const noise = row({ event_type: 'update_campaign_run_status', object_type: 'CAMPAIGN_GROUP', detail: { from: 'Processo pendente', to: 'Análise pendente' } })
    expect(summarize([noise], () => 'ana').size).toBe(0)
    expect(summarize([pause('A')], () => null).size).toBe(0)
  })
  it('agrupa por gestor e soma', () => {
    const m = summarize([pause('A'), { ...pause('B'), actor_key: 'bia' }], r => r.actor_key)
    expect(totalOf(addCounts(m.get('ana')!, m.get('bia')!))).toBe(2)
    expect(totalOf(emptyCounts())).toBe(0)
  })
})
