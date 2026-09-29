'use client'

import { CheckCircle2, Calendar, Clock, Inbox, Sparkles } from 'lucide-react'

export type MacroType = 'hoje' | 'atrasadas' | 'futuras' | 'todos' | 'concluidas'

interface HomeEmptyStateProps {
  macro: MacroType
}

const EMPTY_CONFIGS: Record<MacroType, { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }> = {
  hoje: {
    icon: Sparkles,
    title: 'Sem tarefas para hoje',
    subtitle: 'Aproveite o dia! Você não possui nenhuma pendência de otimização hoje.',
  },
  atrasadas: {
    icon: CheckCircle2,
    title: 'Nenhuma tarefa atrasada',
    subtitle: 'Excelente! Todas as suas alterações e campanhas estão em dia.',
  },
  futuras: {
    icon: Calendar,
    title: 'Nenhuma tarefa futura',
    subtitle: 'Não há tarefas agendadas para os próximos dias neste ciclo.',
  },
  todos: {
    icon: Inbox,
    title: 'Nenhuma tarefa pendente',
    subtitle: 'Tudo pronto! Todas as tarefas deste ciclo foram concluídas.',
  },
  concluidas: {
    icon: Clock,
    title: 'Nenhuma tarefa concluída',
    subtitle: 'Nenhuma otimização foi justificada ou arquivada neste ciclo ainda.',
  },
}

export function HomeEmptyState({ macro }: HomeEmptyStateProps) {
  const config = EMPTY_CONFIGS[macro] || EMPTY_CONFIGS.hoje
  const Icon = config.icon

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground/80 mb-4 shadow-2xs">
        <Icon className="h-8 w-8 stroke-[1.6]" />
      </div>
      <h3 className="text-base md:text-lg font-bold text-foreground">
        {config.title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1 leading-relaxed">
        {config.subtitle}
      </p>
    </div>
  )
}
