'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Download, Eye, EyeOff } from 'lucide-react'
import { apiFetch } from '@/lib/apiFetch'
import { StaffShell } from './StaffShell'
import { ProfileMenu } from './ProfileMenu'

/** Extensão do navegador: baixar, instalar e copiar o token pessoal. */
export function ExtensionPage() {
  const [tk, setTk] = useState<{ email: string; token: string } | null>(null)
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { apiFetch('/api/admin/extension', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((j: { email: string; token: string } | null) => setTk(j)).catch(() => { }) }, [])

  async function copy() {
    if (!tk) return
    try { await navigator.clipboard.writeText(tk.token); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { }
  }
  const step = (n: number, t: React.ReactNode) => <li key={n} style={{ fontSize: 14, lineHeight: 1.6 }}>{t}</li>

  return (
    <StaffShell>
      <main className="page page-ready" style={{ maxWidth: 760 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>Extensão do navegador</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>Avisa o painel quando você abre uma conta de cliente no Gerenciador da Meta</p>
          </div>
          <ProfileMenu />
        </header>

        <section className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>O que ela faz</h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0', lineHeight: 1.6 }}>
              Lê só o endereço da aba no Gerenciador (a conta que está aberta) e o tempo com a aba ativa. Não lê o conteúdo da página. Só registra contas de clientes da agência.
              Enquanto está registrando, a tela ganha um brilho suave nas bordas e um selo &quot;Grupo Don&quot; no canto.
            </p>
          </div>
          <a className="btn btn-primary btn-sm" href="/don-extension.zip" download style={{ alignSelf: 'flex-start' }}><Download size={16} strokeWidth={1.75} /> Baixar a extensão</a>
        </section>

        <section className="card" style={{ padding: 20, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Como instalar</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {step(1, <>Descompacte o arquivo baixado.</>)}
            {step(2, <>No Chrome, abra <code>chrome://extensions</code> e ligue o <strong>Modo do desenvolvedor</strong>.</>)}
            {step(3, <>Clique em <strong>Carregar sem compactação</strong> e escolha a pasta descompactada.</>)}
            {step(4, <>Clique no ícone da extensão, cole o seu token abaixo e toque em <strong>Salvar e testar</strong>.</>)}
          </ol>
        </section>

        <section className="card" style={{ padding: 20, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Seu token</h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' }}>É pessoal{tk ? ` (${tk.email})` : ''}: identifica você no painel. Não compartilhe. Se sair da equipe, ele deixa de valer.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="field" readOnly aria-label="Token da extensão" type={show ? 'text' : 'password'} value={tk?.token ?? ''} style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
            <button type="button" className="btn btn-outline btn-icon btn-sm" onClick={() => setShow(s => !s)} aria-label={show ? 'Esconder token' : 'Mostrar token'}>{show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={copy} disabled={!tk}>{copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />} {copied ? 'Copiado' : 'Copiar'}</button>
          </div>
        </section>
      </main>
    </StaffShell>
  )
}
