'use client'

import { useState } from 'react'
import { Check, X, Clock, User, Calendar, Loader2, Building2, Layers } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { REASONS, REASON_LABEL } from '@/lib/managers'
import type { TaskView } from '@/components/Tasks'

interface TaskDetailDialogProps {
  task: TaskView
  onClose: () => void
  onSaved: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const formatFullDate = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TaskDetailDialog({ task, onClose, onSaved }: TaskDetailDialogProps) {
  const [kinds, setKinds] = useState<string[]>(task.reasonKinds || [])
  const [text, setText] = useState(task.reason || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'justificar' | 'historico'>('justificar')

  const isAnswered = !!(task.reason || (task.reasonKinds && task.reasonKinds.length > 0))

  const toggleKind = (k: string) => {
    setKinds(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]))
  }

  async function handleSave() {
    setBusy(true)
    setErr(null)
    try {
      const res = await apiFetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: task.ids,
          reasonKinds: kinds,
          reason: text.trim(),
        }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        setErr(json.error ?? 'Não foi possível salvar a justificativa.')
        setBusy(false)
        return
      }
      onSaved()
      onClose()
    } catch {
      setErr('Erro de conexão ao salvar.')
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes da Tarefa"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top bar: Responsável → Prazo → Status */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5 text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {task.actorName || 'Gestor'}
            </span>
            <span className="text-border">•</span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatFullDate(task.at)}
            </span>
            <span className="text-border">•</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] ${
              isAnswered
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {isAnswered ? 'Justificada' : 'Aguardando'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Fechar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Header client & action */}
        <div className="p-6 border-b border-border/80">
          <div className="flex items-center gap-3 mb-2">
            {task.clientLogo ? (
              <img
                src={task.clientLogo}
                alt={task.clientName}
                className="h-7 w-7 rounded-md object-contain border border-border bg-background"
              />
            ) : (
              <div className="h-7 w-7 rounded-md bg-primary/10 border border-border flex items-center justify-center text-primary font-bold text-xs">
                <Building2 className="h-3.5 w-3.5" />
              </div>
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {task.clientName}
            </span>
          </div>
          <h2 className="text-lg md:text-xl font-bold text-foreground leading-snug">
            {task.short || task.headline}
          </h2>
        </div>

        {/* Tab selection: Justificar / Histórico */}
        <div className="flex border-b border-border px-6 bg-muted/10 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('justificar')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
              activeTab === 'justificar'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Comprovante & Justificativa
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
              activeTab === 'historico'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Histórico de Alterações ({task.items?.length || 1})
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'justificar' ? (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                  Motivo da Otimização (selecione um ou mais)
                </label>
                <div className="flex flex-wrap gap-2">
                  {REASONS.map(([k, l]) => {
                    const selected = kinds.includes(k)
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggleKind(k)}
                        className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                            : 'bg-background hover:bg-muted border-border text-foreground'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 stroke-[3]" />}
                        {l}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="task-comment" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Comentário / Observação {kinds.length ? '(opcional)' : '(obrigatório)'}
                </label>
                <textarea
                  id="task-comment"
                  rows={3}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Explique o contexto técnico ou resultado esperado com essa ação..."
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-medium"
                />
              </div>

              {err && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-600 dark:text-red-400">
                  {err}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground mb-3">
                Registros exatos capturados da Meta Marketing API para esta tarefa:
              </p>
              {task.items && task.items.length > 0 ? (
                task.items.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-border bg-background flex items-start gap-3">
                    <Layers className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold text-foreground">
                        {it.objectName ?? it.text}
                      </p>
                      {it.change && (
                        <p className="text-muted-foreground">
                          Tipo: <span className="font-medium text-foreground">{it.change}</span>
                        </p>
                      )}
                      {it.objectName && it.text !== it.objectName && (
                        <p className="text-muted-foreground">
                          {it.text}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground text-center">
                  {task.headline}
                </div>
              )}
            </div>
          )}
        </div>

          {/* Footer buttons */}
          <div className="p-4 md:px-6 border-t border-border bg-muted/20 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline btn-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || (!kinds.length && text.trim().length < 3)}
              className="btn btn-primary btn-sm"
            >
              {busy ? <Loader2 className="h-4 w-4 spin" /> : <Check className="h-4 w-4 stroke-[2.5]" />}
              Confirmar Comprovante
            </button>
          </div>
      </div>
    </div>
  )
}
