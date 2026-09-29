'use client'

import { useEffect, useState } from 'react'
import { Check, Timer } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { PulseLoader } from '../PulseLoader'

interface CadenceData { cadenceDays: number; min: number; max: number }

/**
 * Aba "Automação" de Configurações: a cada quantos dias sem otimizar um cliente, o gestor dele ganha um
 * lembrete no Início ("Otimização Semanal - {Cliente}"). O cron confere isso sozinho (dentro do /api/cron/sync).
 */
export function AutomationSettings() {
  const [data, setData] = useState<CadenceData | null>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiFetch('/api/admin/settings/optimization', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: CadenceData | null) => {
      if (j) { setData(j); setValue(String(j.cadenceDays)) }
    }).catch(() => {})
  }, [])

  async function save() {
    const n = Number(value)
    if (!data || !Number.isFinite(n) || n < data.min || n > data.max) return setErr(`Informe um número entre ${data?.min ?? 1} e ${data?.max ?? 30}.`)
    setBusy(true); setErr(null); setSaved(false)
    const r = await apiFetch('/api/admin/settings/optimization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cadenceDays: n }) }).catch(() => null)
    setBusy(false)
    if (!r?.ok) { const j = await r?.json().catch(() => ({})) as { error?: string }; return setErr(j?.error ?? 'Não foi possível salvar.') }
    setData(d => (d ? { ...d, cadenceDays: n } : d)); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!data) return <PulseLoader size={40} />
  return (
    <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 520 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', color: 'var(--accent-dim)', flexShrink: 0 }}>
          <Timer size={20} strokeWidth={1.75} />
        </span>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Lembrete de otimização</h3>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
            Cliente ativo, com gestor vinculado, sem nenhuma ação registrada há esse tanto de dias: o gestor ganha um lembrete &ldquo;Otimização Semanal&rdquo; no Início dele.
          </p>
        </div>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-2)', maxWidth: 220 }}>
        Dias sem otimizar
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" className="field" min={data.min} max={data.max} value={value} onChange={e => { setValue(e.target.value); setErr(null) }} style={{ width: 90 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>dias</span>
        </div>
      </label>
      {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>{err}</p>}
      <div>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || value === String(data.cadenceDays)}>
          {saved ? <Check size={16} strokeWidth={1.75} /> : null} {saved ? 'Salvo' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
