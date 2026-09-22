'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, Copy, Check } from 'lucide-react'

interface Item { slug: string; name: string; logoUrl: string | null; hasCode: boolean }

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }
const SHOW_MS = 20_000

/**
 * Menu com todos os clientes e um olhinho que mostra o código de acesso de cada um (só o administrador vê esta tela).
 * O código some sozinho depois de 20 s. Nunca vai para a lista de clientes: só é buscado quando você clica no olho.
 */
export default function ClientCodesMenu({ clients }: { clients: Item[] }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Fechar o menu esconde todos os códigos.
  useEffect(() => { if (!open) { setShown({}); setMsg({}) } }, [open])
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout) }, [])

  const hide = (slug: string) => setShown(s => { const { [slug]: _x, ...rest } = s; void _x; return rest })
  const reveal = (slug: string, code: string) => {
    setShown(s => ({ ...s, [slug]: code }))
    clearTimeout(timers.current[slug])
    timers.current[slug] = setTimeout(() => hide(slug), SHOW_MS)
  }

  async function toggle(c: Item) {
    if (shown[c.slug]) { hide(c.slug); return }
    setBusy(c.slug); setMsg(m => ({ ...m, [c.slug]: '' }))
    try {
      const r = await fetch(`/api/admin/clients/${c.slug}/code`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({})) as { code?: string | null; reason?: string; error?: string }
      if (j.code) reveal(c.slug, j.code)
      else setMsg(m => ({ ...m, [c.slug]: j.reason === 'no_code' ? 'Sem token de acesso.' : j.reason === 'unrecoverable' ? 'Não foi possível recuperar. Revogue e gere outro.' : (j.error ?? 'Erro ao buscar o token.') }))
    } catch { setMsg(m => ({ ...m, [c.slug]: 'Sem conexão.' })) }
    setBusy(null)
  }

  async function generate(c: Item) {
    if (c.hasCode && !confirm(`Revogar o token de ${c.name} e gerar outro? O atual deixa de funcionar.`)) return
    setBusy(c.slug)
    const r = await fetch(`/api/admin/clients/${c.slug}/code`, { method: 'POST' })
    const j = await r.json().catch(() => ({})) as { code?: string; error?: string }
    if (j.code) { reveal(c.slug, j.code); setMsg(m => ({ ...m, [c.slug]: '' })) } else setMsg(m => ({ ...m, [c.slug]: j.error ?? 'Não foi possível gerar.' }))
    setBusy(null)
  }

  async function copy(slug: string, code: string) {
    try { await navigator.clipboard.writeText(code); setCopied(slug); setTimeout(() => setCopied(null), 1500) } catch { /* sem permissão da área de transferência */ }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        title="Tokens dos clientes" aria-label="Tokens dos clientes">
        <KeyRound size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div role="dialog" aria-label="Tokens dos clientes" className="card"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, width: 'min(360px, calc(100vw - 32px))', maxHeight: 'min(70vh, 560px)', overflowY: 'auto', padding: 16, boxShadow: 'var(--shadow-elegant)' }}>
          <div style={eyebrow}>Tokens de acesso</div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 8px', lineHeight: 1.5 }}>Clique no olho para ver. O token some sozinho em 20 s.</p>
          {clients.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Nenhum cliente cadastrado.</p>}
          {clients.map(c => (
            <div key={c.slug} style={{ padding: '10px 0', borderTop: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.hasCode ? 'com acesso' : 'sem acesso'}</span>
                  {!c.hasCode && (
                    <button type="button" onClick={() => generate(c)} disabled={busy === c.slug}
                      style={{ marginLeft: 8, padding: 0, background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      gerar token
                    </button>
                  )}
                </span>
                {shown[c.slug] && (
                  <>
                    <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.18em', fontVariantNumeric: 'tabular-nums' }}>{shown[c.slug]}</code>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => copy(c.slug, shown[c.slug])} aria-label={`Copiar token de ${c.name}`} title="Copiar">
                      {copied === c.slug ? <Check size={16} strokeWidth={1.75} color="var(--green)" /> : <Copy size={16} strokeWidth={1.75} />}
                    </button>
                  </>
                )}
                {c.hasCode && (
                  <button className="btn btn-outline btn-icon btn-sm" onClick={() => toggle(c)} disabled={busy === c.slug}
                    aria-label={shown[c.slug] ? `Esconder token de ${c.name}` : `Ver token de ${c.name}`} title={shown[c.slug] ? 'Esconder' : 'Ver token'}>
                    {shown[c.slug] ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                )}
              </div>
              {msg[c.slug] && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-2)' }}>
                  {msg[c.slug]}{' '}
                  {c.hasCode && (
                    <button type="button" onClick={() => generate(c)} disabled={busy === c.slug}
                      style={{ padding: 0, background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      revogar e gerar outro
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
