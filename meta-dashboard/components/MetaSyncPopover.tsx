'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Shield } from 'lucide-react'
import type { MetaStatus } from '@/lib/meta/status'
import { fileToIconDataUrl, fileToLogoDataUrl } from '@/lib/resizeLogo'

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }

const ago = (ms: number | null | undefined) => {
  if (!ms) return 'nunca'
  const m = Math.round((Date.now() - ms) / 60_000)
  return m < 1 ? 'agora' : m < 90 ? `há ${m} min` : m < 2160 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`
}
/** As métricas são guardadas por período (insights:today, insights:last_7d...): vale a coleta mais recente. */
const lastInsights = (ls: Record<string, number>) => Object.entries(ls).filter(([k]) => k.startsWith('insights:') && k !== 'insights:daily_full').reduce((m, [, v]) => Math.max(m, v), ls.insights ?? 0) || undefined
const until = (ms: number) => { const m = Math.max(1, Math.round((ms - Date.now()) / 60_000)); return m < 90 ? `${m} min` : `${Math.round(m / 60)} h` }

const PHASE_LABEL = ['Simulação', 'Fase 1 · 1 conta', 'Fase 2 · até 5 contas', 'Fase 3 · todas as contas']

function Bar({ pct, color = 'var(--accent)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-card2)', overflow: 'hidden' }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  )
}

function Row({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'ok' | 'bad' }) {
  const color = tone === 'warn' ? 'var(--amber)' : tone === 'bad' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--text-1)'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border-soft)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color, display: 'block' }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block' }}>{sub}</span>}
      </span>
    </div>
  )
}

/**
 * Botão discreto (o escudo do cabeçalho) que abre um menuzinho só de leitura com o estado da sincronização com a Meta.
 * Nada aqui liga, pausa ou altera coisa alguma: o sistema é automático. O ponto colorido do botão avisa se algo pede atenção.
 */
export default function MetaSyncPopover({ logoUrl = null, onLogoChange, canEditBrand = true }: { logoUrl?: string | null; onLogoChange?: (url: string | null) => void; canEditBrand?: boolean }) {
  const [logoMsg, setLogoMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [s, setS] = useState<MetaStatus | null>(null)
  const [missing, setMissing] = useState(false)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(0)
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id) }, [])
  const boxRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/meta', { cache: 'no-store' })
      const j = await r.json().catch(() => ({})) as MetaStatus & { notMigrated?: boolean }
      if (j.notMigrated) setMissing(true)
      else if (r.ok) { setS(j); setMissing(false) }
    } catch { /* sem rede: mantém o último estado */ }
  }, [])

  useEffect(() => { load(); const id = setInterval(load, open ? 30_000 : 5 * 60_000); return () => clearInterval(id) }, [load, open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const attention = missing || (!!s && (s.system.paused || !!s.system.killUntil || !s.token?.valid || (s.token?.unaccepted.length ?? 0) > 0 || s.jobs.dead > 0 || s.accounts.suspended > 0))
  const stale = now > 0 && !!s && !!s.lastCycle && now - s.lastCycle.at > 30 * 60_000
  const dot = attention ? 'var(--red)' : stale ? 'var(--amber)' : 'var(--green)'

  const ap = s?.autopilot
  const stageMs = (ap?.stageHours ?? 48) * 3_600_000
  const stagePct = ap ? Math.min(100, ((now - ap.since) / stageMs) * 100) : 0
  const overall = ap ? Math.min(100, ((ap.phase + (ap.cutover ? 1 : stagePct / 100)) / 4) * 100) : 0

  return (
    <div ref={boxRef} style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label="Estado da sincronização com a Meta" title="Sincronização com a Meta"
        style={{ position: 'relative', height: 56, minWidth: 56, maxWidth: 160, padding: 0, borderRadius: 'var(--radius-lg)', background: logoUrl ? 'transparent' : 'var(--accent-soft)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        {logoUrl ? <img src={logoUrl} alt="Logo" style={{ height: '100%', width: 'auto', maxWidth: '100%', objectFit: 'contain', borderRadius: 'var(--radius-lg)', display: 'block' }} /> : <Shield size={28} color="var(--accent)" strokeWidth={1.75} />}
      </button>

      {/* Luz de estado: fora do logo, centralizada entre o logo e o título, piscando como "ao vivo". */}
      <span aria-hidden="true" style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
        <span className="live-dot-ring" style={{ background: dot }} />
        <span className="live-dot-core" style={{ background: dot }} />
      </span>

      {open && (
        <div role="dialog" aria-label="Sincronização com a Meta" className="card"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 60, width: 'min(380px, calc(100vw - 32px))', maxHeight: 'min(80vh, 640px)', overflowY: 'auto', padding: 16, boxShadow: 'var(--shadow-elegant)' }}>
          {missing && <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>As tabelas de sincronização ainda não existem no banco. Rode <code>supabase/2026-09-meta-sync.sql</code> no Supabase.</p>}
          {!missing && !s && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Carregando…</p>}
          {s && !missing && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Sincronização com a Meta</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>API {s.mode.apiVersion}</span>
              </div>

              {ap && (
                <div style={{ margin: '12px 0 4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{ap.cutover ? 'Painel lendo do banco' : PHASE_LABEL[ap.phase] ?? `Fase ${ap.phase}`}</span>
                    <span style={{ color: 'var(--text-2)' }}>{ap.cutover ? 'concluído' : `${Math.round(overall)}% até o corte`}</span>
                  </div>
                  <Bar pct={ap.cutover ? 100 : overall} color={ap.cutover ? 'var(--green)' : 'var(--accent)'} />
                  {!ap.cutover && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Etapa atual: {Math.round(stagePct)}% da observação. Avança e recua sozinho.</div>}
                </div>
              )}

              {(s.system.paused || s.system.killUntil) && (
                <div role="alert" style={{ margin: '10px 0', padding: 10, borderRadius: 'var(--radius)', background: 'var(--amber-soft)', fontSize: 12, lineHeight: 1.5 }}>
                  {s.system.paused ? `Tudo pausado (${s.system.pauseReason}).` : `Kill switch ativo por mais ${until(s.system.killUntil!)}: a Meta pediu para reduzir o ritmo.`}
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <Row label="Token" tone={!s.token || !s.token.valid || s.token.unaccepted.length ? 'warn' : 'ok'}
                  value={!s.token ? 'Não validado' : !s.token.valid ? 'Inválido' : s.token.unaccepted.length ? 'Escopo de escrita' : 'Válido'}
                  sub={s.token ? `conferido ${ago(s.token.checkedAt)}${s.token.expiresAt ? ` · expira em ${until(s.token.expiresAt)}` : ''}${s.token.error ? ` · ${s.token.error}` : ''}` : undefined} />
                <Row label="Contas" value={`${s.accounts.total} no total`}
                  sub={`${s.accounts.blocked} bloqueadas · ${s.accounts.suspended} suspensas · ${s.accounts.paused} pausadas`} tone={s.accounts.suspended ? 'warn' : undefined} />
                <Row label="Último ciclo" value={s.lastCycle ? ago(s.lastCycle.at) : 'nenhum'} tone={stale ? 'warn' : undefined}
                  sub={s.lastCycle?.skipped ?? (s.lastCycle ? `${s.lastCycle.processed} tarefas · ${s.lastCycle.enqueued} novas` : 'o cron ainda não rodou')} />
                <Row label="Fila" value={`${s.jobs.pending} pendentes · ${s.jobs.running} rodando`} tone={s.jobs.dead ? 'bad' : undefined}
                  sub={s.jobs.dead ? `${s.jobs.dead} travadas na dead-letter` : 'nenhuma travada'} />
                <Row label="Observação (48 h)" tone={!s.observation.hasData ? undefined : s.observation.readyToAdvance ? 'ok' : 'warn'}
                  value={!s.observation.hasData ? 'Sem dados ainda' : s.observation.readyToAdvance ? 'Saudável' : 'Atenção'}
                  sub={`${s.observation.rateLimitErrors} erros de limite · pico ${Math.round(s.observation.peakAccountPct)}% · ${s.observation.dryRunCalls} simuladas`} />
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={eyebrow}>Contas</div>
                {s.accounts.list.map(a => (
                  <div key={a.clientId} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border-soft)', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.slug}</span>
                    <span style={{ color: a.suspended ? 'var(--red)' : a.blockedUntil ? 'var(--amber)' : 'var(--text-2)', textAlign: 'right' }}>
                      {a.suspended ? 'suspensa' : a.blockedUntil ? `bloqueada ${until(a.blockedUntil)}` : a.paused ? 'pausada' : `métricas ${ago(lastInsights(a.lastSynced))} · leads ${ago(a.lastSynced.leads)} · orgânico ${a.lastSynced.organic_notoken ? 'sem token' : a.lastSynced.organic_nopage ? 'sem Página' : ago(a.lastSynced.organic)}`}
                      {a.usagePct != null ? ` · uso ${Math.round(a.usagePct)}%` : ''}
                    </span>
                  </div>
                ))}
              </div>

              {canEditBrand && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-2)' }}>
                <span style={{ flex: 1 }}>Logo do painel e ícone da aba</span>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
                  onChange={async e => {
                    const f = e.target.files?.[0]; e.target.value = ''
                    if (!f) return
                    setLogoMsg(null)
                    try {
                      const [logo, icon] = await Promise.all([fileToLogoDataUrl(f), fileToIconDataUrl(f)])
                      const r = await fetch('/api/admin/brand', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo, icon }) })
                      const j = await r.json().catch(() => ({})) as { url?: string | null; error?: string }
                      if (!r.ok) throw new Error(j.error ?? 'Não foi possível salvar.')
                      onLogoChange?.(j.url ?? null)
                    } catch (err) { setLogoMsg(err instanceof Error ? err.message : 'Não foi possível usar essa imagem.') }
                  }} />
                <button type="button" onClick={() => fileRef.current?.click()} style={{ padding: 0, background: 'none', border: 'none', fontSize: 12, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>{logoUrl ? 'trocar' : 'escolher arquivo'}</button>
                {logoUrl && <button type="button" onClick={async () => { const r = await fetch('/api/admin/brand', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: '' }) }); if (r.ok) onLogoChange?.(null) }} style={{ padding: 0, background: 'none', border: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>remover</button>}
              </div>}
              {logoMsg && <p role="alert" style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{logoMsg}</p>}

              {s.alerts.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={eyebrow}>Avisos das últimas 24 h</div>
                  {s.alerts.slice(0, 5).map((a, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '5px 0', borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 8 }}>
                      <span style={{ flex: 1, color: 'var(--text-2)', lineHeight: 1.45 }}>{a.message}</span>
                      <span style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{ago(a.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
