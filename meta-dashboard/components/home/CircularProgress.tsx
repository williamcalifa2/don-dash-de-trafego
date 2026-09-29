'use client'

interface CircularProgressProps {
  percentage: number
  size?: number
  strokeWidth?: number
  label?: string
}

export function CircularProgress({
  percentage,
  size = 96,
  strokeWidth = 6,
  label = 'Meta do Ciclo',
}: CircularProgressProps) {
  const validPercent = Math.min(100, Math.max(0, isNaN(percentage) ? 0 : percentage))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (validPercent / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center shrink-0 select-none">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Fundo suave do anel (track) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="var(--hero-track, hsl(227 35% 88%))"
            strokeWidth={strokeWidth}
            className="transition-colors"
          />
          {/* Anel indicador preenchido com cantos arredondados */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="var(--hero-ring, hsl(238 85% 70%))"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--hero-fg,currentColor)] font-mono leading-none">
            {validPercent.toFixed(1)}%
          </span>
        </div>
      </div>
      {label && (
        <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--hero-fg-soft,#858D99)] mt-2 whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  )
}
