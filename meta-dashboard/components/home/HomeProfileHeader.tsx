'use client'

import { CircularProgress } from './CircularProgress'

interface HomeProfileHeaderProps {
  name: string
  role?: string
  avatarUrl?: string | null
  completionRate: number
  statusPriority?: 'alta' | 'media' | 'normal'
}

export function HomeProfileHeader({
  name,
  role = 'Gestor de Tráfego',
  avatarUrl,
  completionRate,
  statusPriority = 'normal',
}: HomeProfileHeaderProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('') || 'G'

  return (
    <section className="w-full rounded-2xl border border-border/60 bg-card p-6 md:p-8 shadow-soft transition-all">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 md:gap-8">
        {/* Left: Avatar grande (h-20 w-20) e Identificação */}
        <div className="flex items-center gap-5 md:gap-6 min-w-0 w-full sm:w-auto">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="h-20 w-20 rounded-full object-cover border border-border/60 shadow-2xs"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary/10 border border-border/60 flex items-center justify-center text-primary font-bold text-2xl tracking-wide select-none shadow-2xs">
                {initials}
              </div>
            )}
            {/* Status dot */}
            <span
              className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-card ring-1 ring-black/5 ${
                statusPriority === 'alta'
                  ? 'bg-red-500'
                  : statusPriority === 'media'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              title={
                statusPriority === 'alta'
                  ? 'Pendências críticas'
                  : statusPriority === 'media'
                  ? 'Pendências moderadas'
                  : 'Em dia'
              }
            />
          </div>

          <div className="flex flex-col min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate">
              {name || 'Gestor'}
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              {role}
            </p>
          </div>
        </div>

        {/* Right: Anel de progresso circular com traço fino */}
        <div className="flex items-center justify-center sm:justify-end shrink-0 pl-0 sm:pl-6 border-t sm:border-t-0 sm:border-l border-border/40 pt-5 sm:pt-0 w-full sm:w-auto">
          <CircularProgress percentage={completionRate} size={92} strokeWidth={6.5} label="Meta do ciclo" />
        </div>
      </div>
    </section>
  )
}
