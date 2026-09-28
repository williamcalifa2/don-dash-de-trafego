'use client'

import React, { useState } from 'react'
import { getMetricTooltip, type MetricTooltip } from '@/lib/metricTooltips'

export type FastTipData = string | MetricTooltip

/**
 * Dica ao passar o mouse, instantânea e didática.
 * Suporta textos simples ou explicações ricas com fórmula e dicas.
 * Uso:
 *   const tip = useFastTip()
 *   <div {...tip.bind('texto')} /> ou <div {...tip.bindMetric('cpc')} />
 *   {tip.node}
 */
export function useFastTip() {
  const [t, setT] = useState<{ x: number; y: number; data: FastTipData } | null>(null)

  const bind = (data: FastTipData) => ({
    onMouseEnter: (e: React.MouseEvent) => setT({ x: e.clientX, y: e.clientY, data }),
    onMouseMove: (e: React.MouseEvent) => setT(cur => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur)),
    onMouseLeave: () => setT(null),
  })

  const bindMetric = (keyOrLabel: string, fallback?: FastTipData) => {
    const tip = getMetricTooltip(keyOrLabel)
    if (tip) return bind(tip)
    if (fallback) return bind(fallback)
    return {}
  }

  let node: React.ReactNode = null

  if (t) {
    const isRich = typeof t.data !== 'string'
    const item = isRich ? (t.data as MetricTooltip) : null
    const text = !isRich ? (t.data as string) : ''

    // Dimensões estimadas para manter dentro da janela
    const width = isRich ? 290 : 240
    const margin = 14
    let left = t.x + margin
    if (typeof window !== 'undefined') {
      if (left + width > window.innerWidth - 16) {
        left = Math.max(16, t.x - width - 12)
      }
      left = Math.max(16, Math.min(left, window.innerWidth - width - 16))
    }

    // Posicionamento vertical: se estiver muito perto do topo, exibe abaixo do mouse; senão, cresce para cima
    const showBelow = t.y < 160
    const styleY: React.CSSProperties = showBelow
      ? { top: t.y + 18 }
      : { bottom: Math.max(12, (typeof window !== 'undefined' ? window.innerHeight : 900) - t.y + 12) }

    node = (
      <div
        role="tooltip"
        data-hm-ignore
        style={{
          position: 'fixed',
          left,
          ...styleY,
          zIndex: 9999,
          pointerEvents: 'none',
          maxWidth: width,
          width: 'max-content',
          padding: isRich ? '10px 14px' : '6px 10px',
          borderRadius: isRich ? 10 : 8,
          background: '#090d16',
          color: '#f8fafc',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.6), 0 4px 10px -2px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {isRich && item ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span>{item.title}</span>
            </div>
            <div style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: '#cbd5e1',
              fontWeight: 400,
            }}>
              {item.description}
            </div>
            {item.formula && (
              <div style={{
                marginTop: 4,
                fontSize: 11,
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: '#64748b' }}>Fórmula</span>
                <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 10.5, color: '#f1f5f9' }}>
                  {item.formula}
                </span>
              </div>
            )}
            {item.hint && (
              <div style={{
                marginTop: 5,
                paddingTop: 5,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                fontSize: 11,
                lineHeight: 1.35,
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 5,
              }}>
                <span style={{ flexShrink: 0 }}>💡</span>
                <span>{item.hint}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
            {text}
          </div>
        )}
      </div>
    )
  }

  return { bind, bindMetric, node }
}
