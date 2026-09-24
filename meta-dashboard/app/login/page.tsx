'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Moon, Sun, ArrowRight, Loader2 } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'
import { PulseLoader } from '@/components/PulseLoader'

interface PublicClient {
  slug: string | null
  name?: string
  logoUrl?: string | null
  /** o cliente entra por e-mail e token (tem e-mail cadastrado) */
  emailLogin?: boolean
}

export default function LoginPage() {
  const { theme, toggle } = useTheme()
  const [client, setClient] = useState<PublicClient | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [entering, setEntering] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c') ?? ''
    fetch(`/api/auth/client${c ? `?c=${encodeURIComponent(c)}` : ''}`)
      .then(r => r.json())
      .then((j: PublicClient) => {
        setClient(j)
        if (j.name) document.title = `Dashboard Don - ${j.name}`
      })
      .catch(() => setClient({ slug: null }))
  }, [])

  const slug = client?.slug ?? null
  const noAddress = client !== null && !client.slug

  async function submitEmail() {
    if (loading || !slug || !email.trim() || !token.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), token: token.trim(), c: slug, next: new URLSearchParams(window.location.search).get('next') }),
      })
      const json = await res.json().catch(() => ({})) as { ok?: boolean; next?: string; error?: string }
      if (res.ok && json.ok) { setEntering(true); window.location.href = json.next ?? '/dashboard/meta'; return }
      setError(json.error ?? 'E-mail ou token incorreto.')
    } catch {
      setError('Sem conexão. Verifique sua internet e tente de novo.')
    }
    setToken('')
    setLoading(false)
  }

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
      if (res.ok && json.ok) {
        setEntering(true)
        window.location.href = json.next ?? '/dashboard/meta'
        return
      }
      setError(json.error ?? 'Código incorreto. Tente novamente.')
    } catch {
      setError('Sem conexão. Verifique sua internet e tente de novo.')
    }
    setCode('')
    setLoading(false)
    codeRef.current?.focus()
  }

  if (entering) return <PulseLoader fullscreen size={72} caption="Entrando no painel" />

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        position: 'relative',
        background: 'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(99, 102, 241, 0.12), transparent 70%), var(--bg)',
      }}
    >
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="btn btn-outline btn-icon btn-sm"
        style={{ position: 'absolute', top: 20, right: 20, borderRadius: 10 }}
        aria-label="Alternar tema"
        title="Alternar tema"
      >
        {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
      </button>

      {/* Main Container */}
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        {/* Top Grupo Don Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <img
            src={theme === 'dark' ? '/logo-grupo-don-white.png' : '/logo-grupo-don-dark.png'}
            srcSet={theme === 'dark' ? '/logo-grupo-don-white.png 1x, /logo-grupo-don@2x.png 2x' : '/logo-grupo-don-dark.png 1x, /logo-grupo-don-dark@2x.png 2x'}
            alt="Grupo Don"
            style={{ height: 28, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Card de Login */}
        <form
          onSubmit={e => { e.preventDefault(); if (client?.emailLogin) void submitEmail(); else submit(code) }}
          className="card"
          style={{
            width: '100%',
            padding: '32px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            background: 'var(--bg-card)',
            borderRadius: 20,
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-elegant)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Client Header Info */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
            {client?.logoUrl ? (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'var(--bg-card2)',
                  border: '1px solid var(--border-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <img
                  src={client.logoUrl}
                  alt={client.name || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10 }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'var(--accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Lock size={22} color="var(--accent)" strokeWidth={1.8} />
              </div>
            )}

            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-1)', margin: 0 }}>
                {client?.name ?? 'Painel de Performance'}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
                {client?.emailLogin ? 'Entre com o seu e-mail e o token de acesso' : 'Digite seu código de acesso para entrar'}
              </p>
            </div>
          </div>

          {noAddress ? (
            <div style={{ background: 'var(--amber-soft)', padding: 14, borderRadius: 12, border: '1px solid var(--amber)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, lineHeight: 1.5, textAlign: 'center' }}>
                Abra o link específico enviado pela equipe da agência para identificar o seu painel de tráfego.
              </p>
            </div>
          ) : client?.emailLogin ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-2)' }}>E-mail
                <input className="field" type="email" name="email" autoComplete="username" autoFocus disabled={loading} value={email} onChange={e => { setEmail(e.target.value); setError(null) }} placeholder="voce@empresa.com.br" style={{ textTransform: 'none', letterSpacing: 'normal', fontWeight: 500 }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-2)' }}>Token
                <input className="field" type="text" name="token" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} disabled={loading} value={token} onChange={e => { setToken(e.target.value.toUpperCase().slice(0, 20)); setError(null) }} placeholder="K7QM-2XNP-9TDW" style={{ letterSpacing: '0.1em', fontWeight: 700 }} />
              </label>
              {error && <p role="alert" style={{ fontSize: 12, color: 'var(--red)', margin: 0, textAlign: 'center', fontWeight: 600 }}>{error}</p>}
            </div>
          ) : (
            <div>
              <label
                htmlFor="code"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-2)',
                  marginBottom: 10,
                  textAlign: 'center',
                }}
              >
                Digite seu Código de Acesso
              </label>

              {/* 6 Digit Input Display */}
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <input
                  id="code"
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                  disabled={loading}
                  value={code}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setCode(v)
                    setError(null)
                    if (v.length === 6) submit(v)
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'code-error' : undefined}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                    zIndex: 2,
                  }}
                />

                {/* 6 Visual Digit Boxes */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%' }}>
                  {Array.from({ length: 6 }).map((_, idx) => {
                    const digit = code[idx] || ''
                    const isCurrent = code.length === idx
                    return (
                      <div
                        key={idx}
                        style={{
                          width: 44,
                          height: 52,
                          borderRadius: 12,
                          background: digit ? 'var(--bg-card2)' : 'var(--bg)',
                          border: isCurrent
                            ? '2px solid var(--accent)'
                            : digit
                              ? '1.5px solid var(--border)'
                              : '1px solid var(--border-soft)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          fontWeight: 700,
                          color: 'var(--text-1)',
                          boxShadow: isCurrent ? '0 0 0 3px var(--accent-soft)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {digit ? '•' : ''}
                      </div>
                    )
                  })}
                </div>
              </div>

              {error && (
                <p id="code-error" role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 12, textAlign: 'center', fontWeight: 600 }}>
                  {error}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !slug || (client?.emailLogin ? !email.trim() || !token.trim() : code.length !== 6)}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.28)',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                <span>Entrando no painel…</span>
              </>
            ) : (
              <>
                <span>Acessar Dashboard</span>
                <ArrowRight size={15} strokeWidth={2.2} />
              </>
            )}
          </button>

          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
            {client?.emailLogin ? 'Não tem o token ou o seu e-mail não foi cadastrado?' : 'Não possui o código de acesso?'} Solicite diretamente à sua equipe no <strong>Grupo Don</strong>.
          </p>
        </form>

        {/* Footer */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
          Grupo Don © 2026 · Painel de Performance & Tráfego
        </div>
      </div>
    </main>
  )
}
