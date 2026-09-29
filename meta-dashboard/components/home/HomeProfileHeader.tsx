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
  role = 'Gestor de Tráfego Pago',
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
    <section className="w-full rounded-2xl border border-border/70 bg-[var(--hero-bg)] p-6 sm:p-7 md:p-8 shadow-soft transition-all">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Left: Avatar grande, Nome e Cargo com tipografia harmoniosa */}
        <div className="flex items-center gap-5 min-w-0 w-full sm:w-auto">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="h-18 w-18 rounded-full object-cover border-2 border-white shadow-xs"
              />
            ) : (
              <div className="h-18 w-18 rounded-full bg-primary/20 border-2 border-white flex items-center justify-center text-primary font-bold text-2xl tracking-wide select-none shadow-xs">
                {initials}
              </div>
            )}
            {/* Status dot suave */}
            <span
              className={`absolute bottom-0 right-0 h-4.5 w-4.5 rounded-full border-2 border-white ring-1 ring-black/5 shadow-2xs ${
                statusPriority === 'alta'
                  ? 'bg-rose-500'
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--hero-fg-soft)] opacity-90 mb-0.5">
              Painel do Gestor
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--hero-fg)] truncate">
              {name || 'Gestor'}
            </h1>
            <p className="text-sm font-medium text-[var(--hero-fg-soft)] mt-0.5">
              {role}
            </p>
          </div>
        </div>

        {/* Right: Anel de progresso circular delicado e proporcional */}
        <div className="flex items-center justify-center sm:justify-end shrink-0 pl-0 sm:pl-7 border-t sm:border-t-0 sm:border-l border-[var(--hero-track)]/70 pt-4 sm:pt-0 w-full sm:w-auto">
          <CircularProgress percentage={completionRate} size={94} strokeWidth={6} label="Meta do ciclo" />
        </div>
      </div>
    </section>
  )
}
