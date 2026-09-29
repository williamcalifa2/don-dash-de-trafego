'use client'

import { useState } from 'react'
import { Check, Clock, Building2, Tag, ChevronRight } from 'lucide-react'
import { TaskDetailDialog } from './TaskDetailDialog'
import { REASON_LABEL } from '@/lib/managers'
import type { TaskView } from '@/components/Tasks'

interface HomeTaskItemProps {
  task: TaskView
  onSaved: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

function calculateRelativeDate(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  const isToday = date.toDateString() === now.toDateString()
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString()

  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (isToday) {
    return { text: `Hoje às ${timeStr}`, isOverdue: false }
  }
  if (isYesterday) {
    return { text: `Ontem às ${timeStr}`, isOverdue: true, days: 1 }
  }
  if (diffDays > 1) {
    return { text: `há ${diffDays} dias (${pad(date.getDate())}/${pad(date.getMonth() + 1)})`, isOverdue: true, days: diffDays }
  }
  return { text: `${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${timeStr}`, isOverdue: false }
}

export function HomeTaskItem({ task, onSaved }: HomeTaskItemProps) {
  const [openModal, setOpenModal] = useState(false)
  const isAnswered = !!(task.reason || (task.reasonKinds && task.reasonKinds.length > 0))
  const { text: dateText, isOverdue } = calculateRelativeDate(task.at)

  const showOverdueAlert = !isAnswered && isOverdue

  return (
    <>
      <div
        onClick={() => setOpenModal(true)}
        className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 sm:p-5 rounded-xl border border-border/70 bg-card shadow-soft hover:border-primary/40 hover:shadow-elegant hover:-translate-y-0.5 transition-all duration-200 cursor-pointer select-none"
      >
        {/* Left side: Checkbox redondo + Título e Badges */}
        <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
          {/* Checkbox redondo */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setOpenModal(true)
            }}
            aria-label={isAnswered ? 'Ver justificativa' : 'Justificar alteração'}
            className={`mt-0.5 sm:mt-0 h-6 w-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
              isAnswered
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-2xs'
                : 'border-border/80 hover:border-primary/60 bg-card group-hover:scale-105'
            }`}
          >
            {isAnswered && <Check className="h-3.5 w-3.5 stroke-[3]" />}
          </button>

          {/* Info principal */}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {/* Badge Cliente formato cápsula */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted/80 text-[11px] font-semibold text-foreground border border-border/60">
                {task.clientLogo ? (
                  <img
                    src={task.clientLogo}
                    alt={task.clientName}
                    className="h-3.5 w-3.5 rounded-full object-contain"
                  />
                ) : (
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="truncate max-w-[130px]">{task.clientName}</span>
              </span>

              {/* Badge Departamento formato cápsula */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold text-primary uppercase tracking-wider">
                Tráfego Pago
              </span>

              {/* Badge de Justificado / Pendente formato cápsula */}
              {isAnswered ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-200/50">
                  Justificada
                </span>
              ) : (
                showOverdueAlert && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/10 text-[10px] font-bold text-red-600 dark:text-red-400 border border-red-200/50">
                    Atrasada
                  </span>
                )
              )}
            </div>

            {/* Título da Ação */}
            <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug break-words">
              {task.short || task.headline}
            </h4>

            {/* Motivos justificados, se houver */}
            {isAnswered && task.reasonKinds && task.reasonKinds.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs text-muted-foreground">
                <Tag className="h-3 w-3 text-muted-foreground" />
                {task.reasonKinds.map(k => (
                  <span key={k} className="font-medium text-foreground">
                    {REASON_LABEL[k] || k}
                  </span>
                ))}
                {task.reason && (
                  <span className="italic text-muted-foreground truncate max-w-xs">
                    — &ldquo;{task.reason}&rdquo;
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right side: Data e Ação */}
        <div className="flex items-center justify-between sm:justify-end gap-3.5 shrink-0 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-border/40">
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className={`h-3.5 w-3.5 ${showOverdueAlert ? 'text-red-500' : 'text-muted-foreground'}`} />
            <span className={showOverdueAlert ? 'text-red-500 font-semibold' : 'text-muted-foreground font-medium'}>
              {dateText}
            </span>
          </div>

          <button
            type="button"
            className={`btn btn-xs rounded-full ${
              isAnswered ? 'btn-outline' : 'btn-primary'
            }`}
          >
            {isAnswered ? 'Ver Detalhes' : 'Justificar'}
            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
          </button>
        </div>
      </div>

      {openModal && (
        <TaskDetailDialog
          task={task}
          onClose={() => setOpenModal(false)}
          onSaved={onSaved}
        />
      )}
    </>
  )
}
