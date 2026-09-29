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
    <section className="w-full rounded-2xl border border-border bg-card p-6 md:p-7 shadow-xs transition-colors">
      <div className="flex flex-col sm:flex-row items-center sm:items-center justify-between gap-6">
        {/* Left: Avatar grande (h-20 w-20) e Nome/Cargo */}
        <div className="flex items-center gap-4 md:gap-5 min-w-0">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="h-20 w-20 rounded-full object-cover border-2 border-border shadow-xs"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary/10 border-2 border-border flex items-center justify-center text-primary font-bold text-2xl tracking-wide select-none shadow-xs">
                {initials}
              </div>
            )}
            {/* Bandeira de prioridade/status no canto do avatar */}
            <span
              className={`absolute bottom-0 right-0 h-5 w-5 rounded-full border-2 border-card flex items-center justify-center ${
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground truncate">
                {name || 'Gestor'}
              </h1>
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-0.5">
              {role}
            </p>
          </div>
        </div>

        {/* Right: Anel de progresso circular com % da meta */}
        <div className="flex items-center justify-center sm:justify-end shrink-0 pl-0 sm:pl-4 border-t sm:border-t-0 sm:border-l border-border/60 pt-4 sm:pt-0 w-full sm:w-auto">
          <CircularProgress percentage={completionRate} size={92} strokeWidth={8} label="Meta do ciclo" />
        </div>
      </div>
    </section>
  )
}
