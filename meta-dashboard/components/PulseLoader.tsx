'use client'

/**
 * Logo da Don pulsando: aparece em toda espera entre telas, na administração e no painel do cliente.
 * Só a logo, sem texto (o texto vai apenas como rótulo para leitores de tela). `fullscreen` cobre a tela toda (troca de página).
 */
export function PulseLoader({ size = 44, caption, fullscreen = false, inline = false }: { size?: number; caption?: string; fullscreen?: boolean; /** sem margem: para dentro de janelas e botões */ inline?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-label={caption ?? 'Carregando'} className={`pulse-wrap${fullscreen ? ' pulse-full' : ''}${inline ? ' pulse-inline' : ''}`}>
      <span className="pulse-logo" style={{ ['--s' as string]: `${size}px` }}>
        <img src="/logo-don-raio.png" alt="" width={Math.round(size * 0.806)} height={size} draggable={false} />
      </span>
    </div>
  )
}
