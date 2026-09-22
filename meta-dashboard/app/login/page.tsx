'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'

interface PublicClient { slug: string | null; name?: string; logoUrl?: string | null }

export default function LoginPage() {
  const { theme, toggle } = useTheme()
  const [client, setClient] = useState<PublicClient | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c') ?? ''
    fetch(`/api/auth/client${c ? `?c=${encodeURIComponent(c)}` : ''}`)
      .then(r => r.json()).then((j: PublicClient) => { setClient(j); if (j.name) document.title = `Dashboard Don - ${j.name}` }).catch(() => setClient({ slug: null }))
  }, [])

  const slug = client?.slug ?? null
  const noAddress = client !== null && !client.slug

  async function submit(value: string) {
    if (loading || value.length !== 6 || !slug) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value, c: slug, next: new URLSearchParams(window.location.search).get('next') }),
      })
      const json = await res.json().catch(() => ({})) as { ok?: boolean; next?: string; error?: string }
      if (res.ok && json.ok) { window.location.href = json.next ?? '/dashboard/meta'; return }
      setError(json.error ?? 'Não foi possível entrar. Tente de novo.')
    } catch {
      setError('Sem conexão. Verifique a internet e tente de novo.')
    }
    setCode('')
    setLoading(false)
    codeRef.current?.focus()
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
      <button onClick={toggle} className="btn btn-outline btn-icon btn-sm" style={{ position: 'absolute', top: 16, right: 16 }} aria-label="Alternar tema" title="Alternar tema">
        {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      </button>

      <form onSubmit={e => { e.preventDefault(); submit(code) }} className="card" style={{ width: '100%', maxWidth: 420, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {client?.logoUrl ? (
            <img src={client.logoUrl} alt="" style={{ height: 56, width: 'auto', maxWidth: 120, objectFit: 'contain', borderRadius: 'var(--radius-lg)' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-lg)', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Lock size={28} color="var(--accent)" strokeWidth={1.75} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{client?.name ?? 'Painel de resultados'}</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)' }}>Acesso restrito</p>
          </div>
        </div>

        {noAddress && (
          <p role="alert" style={{ fontSize: 14, lineHeight: 1.6, padding: 12, background: 'var(--amber-soft)', borderRadius: 'var(--radius)' }}>
            Abra o link do painel que a sua agência enviou. É por ele que identificamos o seu painel.
          </p>
        )}

        <div>
          <label htmlFor="code" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Código de acesso (6 dígitos)</label>
          <input
            id="code" ref={codeRef} className="field" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus
            autoComplete="one-time-code" placeholder="••••••" disabled={loading || noAddress}
            value={code}
            onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); setError(null); if (v.length === 6) submit(v) }}
            aria-invalid={!!error} aria-describedby={error ? 'code-error' : undefined}
            style={{ height: 56, textAlign: 'center', fontSize: 28, fontWeight: 700, letterSpacing: '0.5em', paddingLeft: '0.5em' }}
          />
          {error && <p id="code-error" role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</p>}
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading || code.length !== 6 || !slug}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>Não tem o código? Peça à sua agência.</p>
      </form>
    </main>
  )
}
