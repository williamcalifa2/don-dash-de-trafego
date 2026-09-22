import { describe, expect, it } from 'vitest'
import { buildAudience, hasAudienceData } from '@/lib/audience'

const conv = (v: number) => [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(v) }]

describe('público: dados dos gráficos a partir dos recortes da Meta', () => {
  const raw = {
    platform: [
      { publisher_platform: 'instagram', impressions: '600', reach: '400', spend: '30', clicks: '20', actions: conv(6) },
      { publisher_platform: 'facebook', impressions: '400', reach: '300', spend: '20', clicks: '10', actions: conv(2) },
    ],
    device: [{ device_platform: 'mobile_app', impressions: '900', reach: '600' }, { device_platform: 'desktop', impressions: '100', reach: '90' }],
    hour: [
      { hourly_stats_aggregated_by_advertiser_time_zone: '13:00:00 - 13:59:59', impressions: '50', reach: '40' },
      { hourly_stats_aggregated_by_advertiser_time_zone: '00:00:00 - 00:59:59', impressions: '5', reach: '4' },
    ],
    agegender: [
      { age: '25-34', gender: 'female', impressions: '100', reach: '80' }, { age: '25-34', gender: 'male', impressions: '60', reach: '50' },
      { age: '18-24', gender: 'female', impressions: '30', reach: '20' }, { age: '35-44', gender: 'unknown', impressions: '5', reach: '4' },
    ],
    region: Array.from({ length: 12 }, (_, i) => ({ region: `Região ${i}`, impressions: String(100 - i), reach: String(50 - i) })),
  }
  const a = buildAudience(raw)

  it('plataforma: rótulos em português, ordenado por alcance, com resultados por plataforma', () => {
    expect(a.platform.map(p => p.label)).toEqual(['Instagram', 'Facebook'])
    expect(a.platform[0]).toMatchObject({ impressions: 600, reach: 400, results: 6, spend: 30 })
    expect(a.platform[1].results).toBe(2)
  })
  it('dispositivo', () => expect(a.device.map(d => d.label)).toEqual(['App mobile', 'Desktop']))
  it('hora: 24 posições, preenche as que têm dado e zera as outras', () => {
    expect(a.hours).toHaveLength(24)
    expect(a.hours[13]).toMatchObject({ label: '13h', impressions: 50, reach: 40 }); expect(a.hours[0].impressions).toBe(5); expect(a.hours[5].impressions).toBe(0)
  })
  it('idade soma os gêneros; gênero soma as idades', () => {
    expect(a.age.find(x => x.label === '25-34')).toMatchObject({ impressions: 160, reach: 130 })
    expect(a.age.map(x => x.label)).toEqual(['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'])
    expect(a.gender.map(g => [g.label, g.impressions])).toEqual([['Feminino', 130], ['Masculino', 60], ['Desconhecido', 5]])
  })
  it('regiões: só as 10 maiores por alcance', () => {
    expect(a.regions).toHaveLength(10); expect(a.regions[0].label).toBe('Região 0'); expect(a.regions[9].label).toBe('Região 9')
  })
  it('sem dados: estruturas vazias, sem quebrar, e detecta que não há nada para mostrar', () => {
    const e = buildAudience({ platform: [], device: [], hour: [], agegender: [], region: [] })
    expect(hasAudienceData(e)).toBe(false); expect(e.hours).toHaveLength(24); expect(e.age).toHaveLength(7)
    expect(hasAudienceData(a)).toBe(true)
  })
})

describe('resultados por idade e gênero', () => {
  it('soma os resultados (conversas, leads) de cada faixa e mantém o investimento para o custo por resultado', () => {
    const a = buildAudience({
      platform: [], device: [], hour: [], region: [],
      agegender: [
        { age: '25-34', gender: 'female', spend: '30', actions: conv(6) },
        { age: '25-34', gender: 'male', spend: '10', actions: conv(2) },
        { age: '35-44', gender: 'female', spend: '20', actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '4' }] },
      ],
    })
    expect(a.age.find(x => x.label === '25-34')).toMatchObject({ results: 8, spend: 40 })
    expect(a.age.find(x => x.label === '35-44')).toMatchObject({ results: 4, spend: 20 })
    expect(a.gender[0]).toMatchObject({ label: 'Feminino', results: 10, spend: 50 })
    expect(a.gender[1]).toMatchObject({ label: 'Masculino', results: 2 })
  })
})
