import type { ReactNode } from 'react'

/** Moldura simples das páginas públicas (política de privacidade e exclusão de dados). Servidor, sem login. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Grupo Don · Don Comunicação Digital</p>
        <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>{title}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>Última atualização: {updated}</p>
      </header>
      <div className="legal" style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: 15, lineHeight: 1.7 }}>{children}</div>
    </main>
  )
}

export const H2 = ({ children }: { children: ReactNode }) => <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{children}</h2>
export const P = ({ children }: { children: ReactNode }) => <p style={{ margin: 0 }}>{children}</p>
export const UL = ({ items }: { items: ReactNode[] }) => <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>

/** E-mail de contato para privacidade: vem de PRIVACY_EMAIL no Vercel. */
export const contactEmail = () => (process.env.PRIVACY_EMAIL ?? '').trim()
