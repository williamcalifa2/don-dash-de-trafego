'use client'

interface CircularProgressProps {
  percentage: number
  size?: number
  strokeWidth?: number
  label?: string
}

export function CircularProgress({
  percentage,
  size = 92,
  strokeWidth = 5,
  label = 'Meta do Ciclo',
}: CircularProgressProps) {
  const validPercent = Math.min(100, Math.max(0, isNaN(percentage) ? 0 : percentage))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (validPercent / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Subtle muted track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30 transition-colors"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="var(--accent)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-xl md:text-2xl font-bold tracking-tight text-foreground font-mono leading-none">
            {validPercent.toFixed(1)}%
          </span>
        </div>
      </div>
      {label && (
        <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/80 mt-2 whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  )
}
