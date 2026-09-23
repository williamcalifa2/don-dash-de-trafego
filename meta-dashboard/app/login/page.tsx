'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Moon, Sun, ArrowRight, ShieldCheck } from 'lucide-react'
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
      .then(r => r.json())
      .then((j: PublicClient) => {
        setClient(j)
        if (j.name) document.title = `Dashboard Don - ${j.name}`
      })
      .catch(() => setClient({ slug: null }))
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
      if (res.ok && json.ok) {
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

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        position: 'relative',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99, 102, 241, 0.18), transparent 70%), var(--bg)',
      }}
    >
      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="btn btn-outline btn-icon btn-sm"
        style={{ position: 'absolute', top: 20, right: 20 }}
        aria-label="Alternar tema"
        title="Alternar tema"
      >
        {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      </button>

      {/* Main Container */}
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

        {/* Top Agency Branding & Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(99, 102, 241, 0.05))',
              border: '1.5px solid rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px -4px rgba(99, 102, 241, 0.3)',
              overflow: 'hidden',
            }}
          >
            <img
              src="/brand-icon.png"
              alt="Don Digital"
              onError={e => {
                (e.currentTarget as HTMLImageElement).src = '/icon-192.png'
              }}
              style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase' }}>
              Don Digital
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              O Ouro ou Nada
            </div>
          </div>
        </div>

        {/* Card de Login */}
        <form
          onSubmit={e => { e.preventDefault(); submit(code) }}
          className="card"
          style={{
            width: '100%',
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            background: 'var(--bg-card)',
            borderRadius: 24,
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-elegant)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Client Header Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--border-soft)', paddingBottom: 18 }}>
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
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'var(--accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Lock size={24} color="var(--accent)" strokeWidth={1.8} />
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25, color: 'var(--text-1)', margin: 0, overflowWrap: 'anywhere' }}>
                {client?.name ?? 'Painel de Performance'}
              </h1>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={13} color="var(--accent)" />
                <span>Área Segura do Cliente</span>
              </p>
            </div>
          </div>

          {noAddress ? (
            <div style={{ background: 'var(--amber-soft)', padding: 16, borderRadius: 14, border: '1px solid var(--amber)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, lineHeight: 1.5 }}>
                Abra o link específico enviado pela equipe da agência para identificar o seu painel de tráfego.
              </p>
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
                          width: 46,
                          height: 56,
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
                          fontSize: 22,
                          fontWeight: 800,
                          color: 'var(--text-1)',
                          boxShadow: isCurrent ? '0 0 12px var(--accent-glow)' : 'none',
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
            disabled={loading || code.length !== 6 || !slug}
            style={{
              width: '100%',
              height: 46,
              borderRadius: 14,
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
            }}
          >
            {loading ? (
              <span>Entrando no painel…</span>
            ) : (
              <>
                <span>Acessar Dashboard</span>
                <ArrowRight size={16} strokeWidth={2.2} />
              </>
            )}
          </button>

          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
            Não possui o código de acesso? Solicite diretamente à sua equipe na <strong>Don Digital</strong>.
          </p>
        </form>

        {/* Footer */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
          Don Digital © 2026 · Painel de Performance & Métricas
        </div>
      </div>
    </main>
  )
}
