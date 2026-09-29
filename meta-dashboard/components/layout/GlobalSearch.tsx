'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Command,
  X,
  CheckSquare,
  Gauge,
  FileBarChart,
  Receipt,
  Users,
  Settings,
  Puzzle,
  Activity,
  MousePointerClick,
  Building2,
  ArrowRight,
} from 'lucide-react'

interface SearchItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  category: 'Módulos' | 'Clientes'
}

const STATIC_MODULES: SearchItem[] = [
  { id: 'tarefas', title: 'Minhas Tarefas & Pauta', subtitle: 'Planejamento e tarefas da equipe', icon: CheckSquare, href: '/admin/tarefas', category: 'Módulos' },
  { id: 'dashboard', title: 'Dashboard de Tráfego', subtitle: 'Métricas e campanhas Meta/Google', icon: Gauge, href: '/admin', category: 'Módulos' },
  { id: 'relatorios', title: 'Criação & Relatórios', subtitle: 'Apresentações e entregáveis', icon: FileBarChart, href: '/admin/reports', category: 'Módulos' },
  { id: 'faturamento', title: 'Faturamento', subtitle: 'Gestão de cobrança e receita', icon: Receipt, href: '/admin/faturamento', category: 'Módulos' },
  { id: 'equipe', title: 'Equipe & Gestores', subtitle: 'Gestão de membros e permissões', icon: Users, href: '/admin/membros', category: 'Módulos' },
  { id: 'configuracoes', title: 'Configurações', subtitle: 'Preferências gerais e integrações', icon: Settings, href: '/admin/configuracoes', category: 'Módulos' },
  { id: 'extensao', title: 'Extensão Chrome', subtitle: 'Ferramenta para Meta Ads', icon: Puzzle, href: '/admin/extensao', category: 'Módulos' },
  { id: 'uso', title: 'Uso do App', subtitle: 'Estatísticas de navegação da equipe', icon: Activity, href: '/admin/uso', category: 'Módulos' },
  { id: 'heatmap', title: 'Heatmap', subtitle: 'Mapa de calor de horários', icon: MousePointerClick, href: '/admin/heatmap', category: 'Módulos' },
]

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<{ id: string; name: string; slug: string }[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch client list on mount
  useEffect(() => {
    let alive = true
    fetch('/api/admin/clients/names', { cache: 'force-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: Array<{ id?: string; name: string; slug: string }> | null) => {
        if (!alive || !Array.isArray(data)) return
        setClients(data.map(c => ({ id: c.id || c.slug, name: c.name, slug: c.slug })))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const filteredItems = useMemo<SearchItem[]>(() => {
    const q = query.trim().toLowerCase()
    const moduleMatches = STATIC_MODULES.filter(m =>
      !q || m.title.toLowerCase().includes(q) || (m.subtitle && m.subtitle.toLowerCase().includes(q))
    )

    const clientMatches: SearchItem[] = clients
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
      .slice(0, 8)
      .map(c => ({
        id: `client-${c.slug}`,
        title: c.name,
        subtitle: `Cliente · /dashboard/${c.slug}`,
        icon: Building2,
        href: `/admin?client=${c.slug}`,
        category: 'Clientes',
      }))

    return [...moduleMatches, ...clientMatches]
  }, [query, clients])

  const navigateTo = useCallback((item: SearchItem) => {
    setOpen(false)
    router.push(item.href)
  }, [router])

  // Keyboard arrow navigation
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filteredItems[selectedIndex]
      if (item) navigateTo(item)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 w-full max-w-[280px] md:max-w-[320px] rounded-lg border border-border/80 bg-background/60 hover:bg-background px-3 text-xs text-muted-foreground flex items-center justify-between shadow-xs transition-colors cursor-pointer group"
        aria-label="Buscar em tudo"
      >
        <span className="flex items-center gap-2 truncate">
          <Search className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          <span className="truncate">Buscar em tudo...</span>
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shrink-0">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Busca global"
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 md:pt-24 px-4 bg-black/40 backdrop-blur-xs animate-in fade-in-0 duration-150"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center gap-2 px-3 border-b border-border bg-muted/20">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Buscar clientes, módulos, tarefas..."
                className="w-full h-11 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none font-medium"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-md"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum resultado encontrado para &ldquo;{query}&rdquo;
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const Icon = item.icon
                  const isSelected = idx === selectedIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateTo(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div
                        className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate leading-snug">
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div
                            className={`text-[11px] truncate ${
                              isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                            }`}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isSelected
                              ? 'bg-primary-foreground/20 text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.category}
                        </span>
                        <ArrowRight className="h-3 w-3 opacity-60" />
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            <div className="px-3 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span>Navegar: <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd></span>
                <span>Selecionar: <kbd className="font-mono">↵</kbd></span>
              </span>
              <span>Fechar: <kbd className="font-mono">ESC</kbd></span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
