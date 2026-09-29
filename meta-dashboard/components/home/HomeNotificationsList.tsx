'use client'

import { useState } from 'react'
import { Bell, AlarmClock, Check, Loader2, Sparkles, ArrowRight } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'

interface Reminder {
  slug: string
  clientName: string
  daysIdle: number
}

interface HomeNotificationsListProps {
  reminders: Reminder[]
  onRefresh: () => void
}

export function HomeNotificationsList({ reminders, onRefresh }: HomeNotificationsListProps) {
  const [busySlug, setBusySlug] = useState<string | null>(null)

  async function handleDismiss(slug: string) {
    setBusySlug(slug)
    try {
      await apiFetch('/api/admin/optimization-reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      onRefresh()
    } catch {
      // ignore
    } finally {
      setBusySlug(null)
    }
  }

  if (reminders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center text-muted-foreground/80 mb-3 shadow-2xs">
          <Bell className="h-7 w-7 stroke-[1.6]" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          Nenhuma nova notificação
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Você leu todos os lembretes de otimização e avisos das contas.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {reminders.map(r => (
        <div
          key={r.slug}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5 hover:border-red-500/50 transition-all"
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <AlarmClock className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Lembrete de Cadência
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-700 dark:text-red-300">
                  Prioridade Alta
                </span>
              </div>
              <h4 className="text-sm font-bold text-foreground">
                Otimização Semanal — {r.clientName}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Essa conta está sem nenhuma ação ou alteração registrada há{' '}
                <strong className="text-foreground">{r.daysIdle} {r.daysIdle === 1 ? 'dia' : 'dias'}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={() => handleDismiss(r.slug)}
              disabled={busySlug === r.slug}
              className="btn btn-outline btn-sm text-xs font-semibold"
            >
              {busySlug === r.slug ? (
                <Loader2 className="h-3.5 w-3.5 spin" />
              ) : (
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              )}
              Marcar como Feito
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
