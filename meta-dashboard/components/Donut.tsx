'use client'

import type { ActivityKind } from '@/lib/managers'

export interface Slice { key: string; label: string; value: number; color: string }

/** Cor de cada tipo de ação: a mesma no donut, no ícone da linha do tempo e nas legendas. */
export const KIND_COLOR: Record<ActivityKind, string> = {
  status: 'var(--accent)', budget: 'var(--green)', audience: 'hsl(190 80% 45%)', creative: 'hsl(280 65% 65%)', bid: 'var(--amber)', structure: 'hsl(330 75% 62%)',
  lead: 'hsl(160 60% 42%)', report: 'hsl(20 85% 58%)', config: 'var(--text-3)', access: 'var(--red)', sync: 'hsl(220 10% 62%)', client: 'hsl(250 55% 60%)', other: 'hsl(220 9% 72%)',
}
/** Uma cor para cada pessoa ou cliente, em ordem. */
export const PEOPLE_COLORS = ['var(--accent)', 'var(--green)', 'var(--amber)', 'hsl(190 80% 45%)', 'hsl(280 65% 65%)', 'hsl(330 75% 62%)', 'hsl(160 60% 42%)', 'hsl(20 85% 58%)']
export const paletteAt = (i: number) => PEOPLE_COLORS[i % PEOPLE_COLORS.length]

/** Junta as fatias menores em "Outros" para o donut e a legenda continuarem legíveis. */
export function topSlices(all: Slice[], max = 6): Slice[] {
  const s = all.filter(x => x.value > 0).sort((a, b) => b.value - a.value)
  if (s.length <= max) return s
  const rest = s.slice(max - 1)
  return [...s.slice(0, max - 1), { key: '_outros', label: 'Outros', value: rest.reduce((n, x) => n + x.value, 0), color: 'hsl(220 9% 72%)' }]
}

/**
 * Donut com número no centro e legenda (o mesmo desenho do gráfico de público). Sem dados, mostra o anel vazio.
 * `legend={false}` deixa só o anel, para caber dentro de cards pequenos.
 */
import { useFastTip } from './FastTip'

export function DonutChart({ slices, center, sub, size = 148, thickness = 22, legend = true, unit, onPick }: {
  slices: Slice[]; center?: string; sub?: string; size?: number; thickness?: number; legend?: boolean; unit?: (n: number) => string; /** torna cada item da legenda clicável (ex.: filtrar a linha do tempo) */ onPick?: (key: string) => void
}) {
  const total = slices.reduce((n, s) => n + s.value, 0)
  const sw = (thickness / size) * 100 // espessura em unidades do desenho (100 x 100)
  const R = 50 - sw / 2 - 1 // o traço fica inteiro dentro do desenho, sem cortar nas bordas
  const C = 2 * Math.PI * R
  let acc = 0
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`
  const tip = useFastTip()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', justifyContent: legend ? 'center' : 'flex-start', width: '100%' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${center ?? ''} ${sub ?? ''}`.trim() || 'Gráfico'}>
          <circle cx={50} cy={50} r={R} fill="none" stroke="var(--bg-card2)" strokeWidth={sw} />
          {total > 0 && slices.filter(s => s.value > 0).map(s => {
            const len = (s.value / total) * C
            const el = (
              <circle key={s.key} cx={50} cy={50} r={R} fill="none" stroke={s.color} strokeWidth={sw} strokeDasharray={`${Math.max(0, len - (slices.length > 1 ? 0.8 : 0))} ${C - len + (slices.length > 1 ? 0.8 : 0)}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)" {...tip.bind(`${s.label}: ${unit ? unit(s.value) : s.value} (${pct(s.value)})`)} style={{ cursor: 'default' }} />
            )
            acc += len
            return el
          })}
        </svg>
        {(center || sub) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center', padding: '0 14%' }}>
            {center && <span style={{ fontSize: size >= 120 ? 22 : 15, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{center}</span>}
            {sub && size >= 120 && <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)', marginTop: 2 }}>{sub}</span>}
          </div>
        )}
      </div>
      {legend && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, minWidth: 180, flex: '1 1 180px', maxWidth: 320 }}>
          {slices.filter(s => s.value > 0).map(s => (
            <li key={s.key} style={{ minWidth: 0 }}>
              {(() => {
                const row = (
                  <>
                    <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)', textAlign: 'left' }}>{s.label}</span>
                    <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{unit ? unit(s.value) : s.value}</span>
                    <strong style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct(s.value)}</strong>
                  </>
                )
                const box: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }
                return onPick && !s.key.startsWith('_')
                  ? <button type="button" onClick={() => onPick(s.key)} title="Ver na linha do tempo" style={{ ...box, background: 'none', border: 0, padding: '2px 0', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>{row}</button>
                  : <span style={box}>{row}</span>
              })()}
            </li>
          ))}
          {total === 0 && <li style={{ color: 'var(--text-2)' }}>Sem dados neste período.</li>}
        </ul>
      )}
      {tip.node}
    </div>
  )
}

/** Barrinhas de um número por dia (ou por hora), sem eixo: mostra o ritmo de relance. */
export function MiniBars({ values, color = 'var(--accent)', height = 30, title }: { values: number[]; color?: string; height?: number; title: (i: number, v: number) => string }) {
  const max = Math.max(1, ...values)
  const tip = useFastTip()
  return (
    <div role="img" aria-label="Ritmo de ações" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {values.map((v, i) => <div key={i} {...tip.bind(title(i, v))} style={{ flex: 1, minWidth: 2, height: `${Math.max(v > 0 ? 12 : 5, Math.round((v / max) * 100))}%`, borderRadius: 3, background: v > 0 ? color : 'var(--bg-card2)', opacity: v > 0 ? 0.55 + 0.45 * (v / max) : 1 }} />)}
      {tip.node}
    </div>
  )
}

/** Card de gráfico no padrão das telas de Público e Orgânico: 24 px de respiro, título simples e o gráfico centralizado na altura que sobra. */
export function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h3>
      {hint && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 0' }}>{hint}</p>}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 16, minHeight: 168 }}>{children}</div>
    </section>
  )
}
