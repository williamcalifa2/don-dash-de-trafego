import { describe, it, expect } from 'vitest'
import { analyzeFatigue, summarizeFatigue } from '@/lib/creativeFatigue'

describe('creativeFatigue', () => {
  it('identifies healthy creatives with low frequency', () => {
    const analysis = analyzeFatigue({ frequency: 1.4, ctr: 2.1 })
    expect(analysis.level).toBe('healthy')
    expect(analysis.shortLabel).toBe('Saudável')
    expect(analysis.color).toBe('var(--green)')
    expect(analysis.score).toBeGreaterThanOrEqual(80)
  })

  it('identifies warning level when frequency starts rising', () => {
    const analysis = analyzeFatigue({ frequency: 2.9, ctr: 1.8 })
    expect(analysis.level).toBe('warning')
    expect(analysis.shortLabel).toBe('Atenção')
    expect(analysis.color).toBe('var(--amber)')
  })

  it('identifies critical fatigue on high frequency >= 3.8', () => {
    const analysis = analyzeFatigue({ frequency: 4.2, ctr: 1.2 })
    expect(analysis.level).toBe('critical')
    expect(analysis.shortLabel).toBe('Fadiga Alta')
    expect(analysis.color).toBe('var(--red)')
  })

  it('identifies critical fatigue on moderate frequency with low CTR', () => {
    const analysis = analyzeFatigue({ frequency: 3.1, ctr: 0.5 })
    expect(analysis.level).toBe('critical')
    expect(analysis.shortLabel).toBe('Fadiga Alta')
  })

  it('summarizes multiple ads correctly', () => {
    const ads = [
      { frequency: 1.2, ctr: 2.5 },
      { frequency: 1.8, ctr: 1.9 },
      { frequency: 2.7, ctr: 1.5 },
      { frequency: 4.5, ctr: 0.9 },
    ]
    const summary = summarizeFatigue(ads)
    expect(summary.total).toBe(4)
    expect(summary.healthy).toBe(2)
    expect(summary.warning).toBe(1)
    expect(summary.critical).toBe(1)
  })
})
