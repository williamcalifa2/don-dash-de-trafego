'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ListChecks,
  Bell,
  Filter,
  ArrowUpDown,
  Search,
  Check,
  Calendar,
} from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { HomeProfileHeader } from './HomeProfileHeader'
import { HomeSummaryCards } from './HomeSummaryCards'
import { HomeTaskItem } from './HomeTaskItem'
import { HomeEmptyState, type MacroType } from './HomeEmptyState'
import { HomeNotificationsList } from './HomeNotificationsList'
import { PulseLoader } from '@/components/PulseLoader'
import type { TaskView } from '@/components/Tasks'

interface TasksData {
  setup: 'ready' | 'tables' | 'columns' | 'error'
  manager: { id: string; name: string; avatarUrl: string | null } | null
  pending: TaskView[]
  answered: TaskView[]
  counts: { pending: number; answered: number; rate: number | null }
}

interface Reminder {
  slug: string
  clientName: string
  daysIdle: number
}

const CYCLES = [
  { id: '2026-09', label: 'Ciclo 09 - Setembro 2026' },
  { id: '2026-08', label: 'Ciclo 08 - Agosto 2026' },
  { id: '2026-07', label: 'Ciclo 07 - Julho 2026' },
  { id: '2026-10', label: 'Ciclo 10 - Outubro 2026' },
]

export function HomeTasksView({ managerId }: { managerId: string | null }) {
  const [data, setData] = useState<TasksData | null>(null)
  const [me, setMe] = useState<{ name: string; avatar: string | null; role: string } | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)

  // Sub-tabs & Macros
  const [activeMainTab, setActiveMainTab] = useState<'tarefas' | 'notificacoes'>('tarefas')
  const [activeMacro, setActiveMacro] = useState<MacroType>('hoje')
  const [selectedCycle, setSelectedCycle] = useState('2026-09')

  // Filtros e Ordenação
  const [filterClient, setFilterClient] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'recentes' | 'antigas' | 'cliente'>('recentes')
  const [openFilterMenu, setOpenFilterMenu] = useState(false)
  const [openSortMenu, setOpenSortMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Carregar dados de perfil
  useEffect(() => {
    apiFetch('/api/admin/profile', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { name?: string; avatar?: string | null; role?: string } | null) => {
        if (j) setMe({ name: j.name ?? '', avatar: j.avatar ?? null, role: j.role ?? '' })
      })
      .catch(() => {})
  }, [])

  // Carregar tarefas
  const loadTasks = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/tasks${managerId ? `?manager=${encodeURIComponent(managerId)}` : ''}`, { cache: 'no-store' })
      if (r.ok) {
        const j = await r.json() as TasksData
        setData(j)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [managerId])

  // Carregar lembretes
  const loadReminders = useCallback(async () => {
    if (!managerId) return
    try {
      const r = await apiFetch(`/api/admin/optimization-reminders?manager=${encodeURIComponent(managerId)}`, { cache: 'no-store' })
      if (r.ok) {
        const j = await r.json() as { reminders?: Reminder[] }
        setReminders(j.reminders || [])
      }
    } catch {
      // ignore
    }
  }, [managerId])

  useEffect(() => {
    void loadTasks()
    void loadReminders()
  }, [loadTasks, loadReminders])

  // Classificação das tarefas por data para macros Pautta:
  const macroCategorized = useMemo(() => {
    const pending = data?.pending || []
    const answered = data?.answered || []
    const now = new Date()

    const hoje: TaskView[] = []
    const atrasadas: TaskView[] = []
    const futuras: TaskView[] = []

    for (const t of pending) {
      const d = new Date(t.at)
      const diffMs = now.getTime() - d.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      const isToday = d.toDateString() === now.toDateString()
      if (isToday || diffDays < 1) {
        hoje.push(t)
      } else {
        atrasadas.push(t)
      }
    }

    return {
      hoje,
      atrasadas,
      futuras,
      todos: pending,
      concluidas: answered,
    }
  }, [data])

  // Clientes disponíveis para filtro
  const availableClients = useMemo(() => {
    const all = [...(data?.pending || []), ...(data?.answered || [])]
    const map = new Map<string, string>()
    for (const t of all) {
      if (t.clientSlug && t.clientName) {
        map.set(t.clientSlug, t.clientName)
      }
    }
    return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }))
  }, [data])

  // Lista filtrada e ordenada atual
  const currentList = useMemo(() => {
    let list: TaskView[] = []
    switch (activeMacro) {
      case 'hoje':
        list = [...macroCategorized.hoje]
        break
      case 'atrasadas':
        list = [...macroCategorized.atrasadas]
        break
      case 'futuras':
        list = [...macroCategorized.futuras]
        break
      case 'todos':
        list = [...macroCategorized.todos]
        break
      case 'concluidas':
        list = [...macroCategorized.concluidas]
        break
    }

    if (filterClient !== 'all') {
      list = list.filter(t => t.clientSlug === filterClient)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        t =>
          (t.short || '').toLowerCase().includes(q) ||
          (t.headline || '').toLowerCase().includes(q) ||
          (t.clientName || '').toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      if (sortBy === 'recentes') return b.at.localeCompare(a.at)
      if (sortBy === 'antigas') return a.at.localeCompare(b.at)
      if (sortBy === 'cliente') return (a.clientName || '').localeCompare(b.clientName || '')
      return 0
    })

    return list
  }, [activeMacro, macroCategorized, filterClient, searchQuery, sortBy])

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <PulseLoader size={48} caption="Carregando Minhas Tarefas..." />
      </div>
    )
  }

  const total = (data?.counts?.pending || 0) + (data?.counts?.answered || 0)
  const completed = data?.counts?.answered || 0
  const pending = data?.counts?.pending || 0
  const completionRate = total > 0 ? (completed / total) * 100 : 100

  const priorityStatus: 'alta' | 'media' | 'normal' =
    macroCategorized.atrasadas.length > 0 || reminders.length > 0
      ? 'alta'
      : pending > 0
      ? 'media'
      : 'normal'

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-16 pt-2">
      {/* 1. Cabeçalho de Perfil Oficial Pautta */}
      <HomeProfileHeader
        name={me?.name || data?.manager?.name || 'Gestor de Tráfego'}
        role="Gestor de Tráfego Pago"
        avatarUrl={me?.avatar || data?.manager?.avatarUrl}
        completionRate={completionRate}
        statusPriority={priorityStatus}
      />

      {/* 2. Abas Sublinhadas & Controles de Ciclo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50">
        {/* Abas sublinhadas com alinhamento perfeito na borda inferior */}
        <div className="flex items-center gap-8 -mb-px">
          <button
            type="button"
            onClick={() => setActiveMainTab('tarefas')}
            className={`pb-3.5 text-sm font-bold flex items-center gap-2 transition-all cursor-pointer border-b-2 ${
              activeMainTab === 'tarefas'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListChecks className="h-4 w-4" />
            Minhas tarefas
            {pending > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold inline-flex items-center justify-center">
                {pending}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('notificacoes')}
            className={`pb-3.5 text-sm font-bold flex items-center gap-2 transition-all cursor-pointer border-b-2 ${
              activeMainTab === 'notificacoes'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bell className="h-4 w-4" />
            Notificações
            {reminders.length > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold inline-flex items-center justify-center shadow-2xs">
                {reminders.length}
              </span>
            )}
          </button>
        </div>

        {/* Controles à direita: todos em cápsula conforme Guia de Design página 8 e 14 */}
        {activeMainTab === 'tarefas' && (
          <div className="flex items-center gap-2.5 pb-2.5 flex-wrap sm:flex-nowrap">
            {/* Seletor de Ciclo (~200px cápsula) */}
            <div className="relative">
              <select
                value={selectedCycle}
                onChange={e => setSelectedCycle(e.target.value)}
                aria-label="Selecionar ciclo"
                className="h-9 w-[190px] sm:w-[215px] rounded-full border border-border/70 bg-card px-4 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer appearance-none pr-9 shadow-soft"
              >
                {CYCLES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Calendar className="h-3.5 w-3.5 text-muted-foreground absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Botão Filtros cápsula */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setOpenFilterMenu(!openFilterMenu)
                  setOpenSortMenu(false)
                }}
                className={`h-9 px-4 rounded-full border border-border/70 bg-card text-xs font-semibold flex items-center gap-1.5 shadow-soft hover:bg-muted/50 transition-all ${
                  filterClient !== 'all' ? 'border-primary text-primary bg-primary/10' : 'text-foreground'
                }`}
              >
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                Filtros
                {filterClient !== 'all' && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>

              {openFilterMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border/70 bg-popover p-3 shadow-elegant z-40 animate-in fade-in-0 zoom-in-95">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/60">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Filtrar por Cliente
                    </span>
                    {filterClient !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setFilterClient('all')}
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterClient('all')
                        setOpenFilterMenu(false)
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                        filterClient === 'all' ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      Todos os clientes
                      {filterClient === 'all' && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                    </button>
                    {availableClients.map(c => (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => {
                          setFilterClient(c.slug)
                          setOpenFilterMenu(false)
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors truncate ${
                          filterClient === c.slug ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="truncate">{c.name}</span>
                        {filterClient === c.slug && <Check className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Botão Classificar cápsula */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setOpenSortMenu(!openSortMenu)
                  setOpenFilterMenu(false)
                }}
                className="h-9 px-4 rounded-full border border-border/70 bg-card text-xs font-semibold flex items-center gap-1.5 shadow-soft hover:bg-muted/50 transition-all text-foreground"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                Classificar
              </button>

              {openSortMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border/70 bg-popover p-2 shadow-elegant z-40 animate-in fade-in-0 zoom-in-95">
                  <div className="space-y-1">
                    {[
                      { id: 'recentes', label: 'Mais recentes' },
                      { id: 'antigas', label: 'Mais antigas' },
                      { id: 'cliente', label: 'Cliente (A-Z)' },
                    ].map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSortBy(s.id as any)
                          setOpenSortMenu(false)
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                          sortBy === s.id ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        {s.label}
                        {sortBy === s.id && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {activeMainTab === 'tarefas' ? (
        <>
          {/* 3. Cards de Resumo (3 Colunas com borda sutil 70% e sombra soft) */}
          <HomeSummaryCards total={total} completed={completed} pending={pending} />

          {/* 4. Barra de Segmentação de Macros e Busca Canônica (cápsula) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Segmented Control oficial Pautta: container bg-muted rounded-full p-1 */}
              <div className="inline-flex items-center bg-muted/80 p-1 rounded-full border border-border/60 gap-1 overflow-x-auto max-w-full scrollbar-none">
                {[
                  { id: 'hoje', label: 'Para hoje', count: macroCategorized.hoje.length, alert: false },
                  { id: 'atrasadas', label: 'Atrasadas', count: macroCategorized.atrasadas.length, alert: true },
                  { id: 'futuras', label: 'Futuras', count: macroCategorized.futuras.length, alert: false },
                  { id: 'todos', label: 'Todos', count: macroCategorized.todos.length, alert: false },
                  { id: 'concluidas', label: 'Concluídas', count: macroCategorized.concluidas.length, alert: false },
                ].map(m => {
                  const active = activeMacro === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveMacro(m.id as MacroType)}
                      className={`h-7.5 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-card text-foreground font-bold shadow-soft border border-border/50'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {m.label}
                      {m.count > 0 && (
                        <span
                          className={`min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                            m.alert
                              ? 'bg-red-500 text-white'
                              : active
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {m.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Busca canônica oficial Pautta (Guia página 14: h-10 + rounded-full + bg-card + ícone 16 px) */}
              <div className="relative w-full sm:w-64 shrink-0">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar nesta lista..."
                  className="h-9.5 w-full rounded-full border border-border/70 bg-card pl-10 pr-4 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium shadow-soft"
                />
              </div>
            </div>

            {/* 5. Lista de Tarefas ou Estado Vazio: sem card dentro de card */}
            {currentList.length === 0 ? (
              <HomeEmptyState macro={activeMacro} />
            ) : (
              <div className="space-y-3">
                {currentList.map(task => (
                  <HomeTaskItem key={task.key} task={task} onSaved={loadTasks} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Aba Notificações */
        <div className="rounded-xl border border-border/70 bg-card p-6 shadow-soft">
          <HomeNotificationsList reminders={reminders} onRefresh={loadReminders} />
        </div>
      )}
    </div>
  )
}
