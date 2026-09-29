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
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-soft flex flex-col justify-between transition-all hover:border-primary/30">
        <div className="flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <ListChecks className="h-4.5 w-4.5 stroke-[1.8]" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
            Total
          </span>
        </div>
        <div className="mt-5">
          <span className="text-3xl md:text-4xl font-bold tracking-tight text-foreground font-mono">
            {total}
          </span>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Total de Tarefas
          </p>
        </div>
      </div>

      {/* Concluídas */}
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-soft flex flex-col justify-between transition-all hover:border-emerald-500/30">
        <div className="flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="h-4.5 w-4.5 stroke-[1.8]" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Concluídas
          </span>
        </div>
        <div className="mt-5">
          <span className="text-3xl md:text-4xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono">
            {completed}
          </span>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Justificadas & Entregues
          </p>
        </div>
      </div>

      {/* Pendentes */}
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-soft flex flex-col justify-between transition-all hover:border-amber-500/30">
        <div className="flex items-center justify-between">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
            pending > 0
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-muted/80 text-muted-foreground'
          }`}>
            <Clock className="h-4.5 w-4.5 stroke-[1.8]" />
          </div>
          <span className={`text-[11px] font-bold uppercase tracking-wider ${
            pending > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground/80'
          }`}>
            Pendentes
          </span>
        </div>
        <div className="mt-5">
          <span className={`text-3xl md:text-4xl font-bold tracking-tight font-mono ${
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
