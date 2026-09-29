'use client'

import { ListChecks, CircleCheck, Clock } from 'lucide-react'

interface HomeSummaryCardsProps {
  total: number
  completed: number
  pending: number
}

export function HomeSummaryCards({ total, completed, pending }: HomeSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
      {/* Total de Tarefas */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-soft flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-elegant hover:-translate-y-0.5 duration-200">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
            <ListChecks className="h-5 w-5 stroke-[1.8]" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Total
          </span>
        </div>
        <div className="mt-4 sm:mt-5">
          <span className="text-3xl sm:text-3.5xl font-bold tracking-tight text-foreground font-mono">
            {total}
          </span>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Total de Tarefas
          </p>
        </div>
      </div>

      {/* Concluídas */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-soft flex flex-col justify-between transition-all hover:border-emerald-500/30 hover:shadow-elegant hover:-translate-y-0.5 duration-200">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
            <CircleCheck className="h-5 w-5 stroke-[1.8]" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Concluídas
          </span>
        </div>
        <div className="mt-4 sm:mt-5">
          <span className="text-3xl sm:text-3.5xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
            {completed}
          </span>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Justificadas & Entregues
          </p>
        </div>
      </div>

      {/* Pendentes */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-soft flex flex-col justify-between transition-all hover:border-amber-500/30 hover:shadow-elegant hover:-translate-y-0.5 duration-200">
        <div className="flex items-center justify-between">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-2xs ${
            pending > 0
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400'
              : 'bg-muted/80 border border-border/50 text-muted-foreground'
          }`}>
            <Clock className="h-5 w-5 stroke-[1.8]" />
          </div>
          <span className={`text-[11px] font-bold uppercase tracking-wider ${
            pending > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
          }`}>
            Pendentes
          </span>
        </div>
        <div className="mt-4 sm:mt-5">
          <span className={`text-3xl sm:text-3.5xl font-bold tracking-tight font-mono ${
            pending > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-foreground'
          }`}>
            {pending}
          </span>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Aguardando Justificativa
          </p>
        </div>
      </div>
    </div>
  )
}
