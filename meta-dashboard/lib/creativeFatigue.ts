export type FatigueLevel = 'healthy' | 'warning' | 'critical'

export interface FatigueAnalysis {
  level: FatigueLevel
  label: string
  shortLabel: string
  color: string
  bg: string
  dot: string
  score: number // 0 (pessimo/saturado) a 100 (super saudavel)
  frequency: number
  ctr: number
  diagnosis: string
  recommendation: string
}

export function analyzeFatigue(ad: { frequency?: number | null; ctr?: number | null }): FatigueAnalysis {
  const frequency = Number(ad.frequency ?? 1)
  const ctr = Number(ad.ctr ?? 0)

  // Critical fatigue: Frequency >= 3.8 OR (Frequency >= 2.8 with low CTR < 0.8%)
  if (frequency >= 3.8 || (frequency >= 2.8 && ctr > 0 && ctr < 0.8)) {
    const score = Math.max(15, Math.round(100 - frequency * 18))
    return {
      level: 'critical',
      label: 'Fadiga Crítica / Saturação',
      shortLabel: 'Fadiga Alta',
      color: 'var(--red)',
      bg: 'var(--red-soft)',
      dot: 'var(--red)',
      score,
      frequency,
      ctr,
      diagnosis: `Frequência de ${frequency.toFixed(2)}x com taxa de cliques de ${ctr.toFixed(2)}%. O público já viu este anúncio repetidas vezes.`,
      recommendation: 'Recomendado pausar ou substituir este criativo por um novo formato/gancho, ou expandir o público-alvo para evitar alta de CPL.',
    }
  }

  // Warning: Frequency >= 2.4
  if (frequency >= 2.4) {
    const score = Math.max(45, Math.round(100 - frequency * 14))
    return {
      level: 'warning',
      label: 'Atenção: Início de Fadiga',
      shortLabel: 'Atenção',
      color: 'var(--amber)',
      bg: 'var(--amber-soft)',
      dot: 'var(--amber)',
      score,
      frequency,
      ctr,
      diagnosis: `Frequência de ${frequency.toFixed(2)}x. Repetição moderada no público atual.`,
      recommendation: 'Monitore o CTR nos próximos 3 a 5 dias e prepare novas variações de cópia/vídeo para substituição preventiva.',
    }
  }

  // Healthy
  const score = Math.min(98, Math.round(100 - (frequency - 1) * 8))
  return {
    level: 'healthy',
    label: 'Criativo Saudável',
    shortLabel: 'Saudável',
    color: 'var(--green)',
    bg: 'var(--green-soft)',
    dot: 'var(--green)',
    score: Math.max(80, score),
    frequency,
    ctr,
    diagnosis: `Frequência controlada em ${frequency.toFixed(2)}x. O criativo ainda entrega com boa receptividade.`,
    recommendation: 'Desempenho estável. Mantenha a veiculação e monitore os custos diários.',
  }
}

export function summarizeFatigue(ads: Array<{ frequency?: number | null; ctr?: number | null }>) {
  let critical = 0
  let warning = 0
  let healthy = 0

  for (const ad of ads) {
    const a = analyzeFatigue(ad)
    if (a.level === 'critical') critical++
    else if (a.level === 'warning') warning++
    else healthy++
  }

  return { total: ads.length, critical, warning, healthy }
}

