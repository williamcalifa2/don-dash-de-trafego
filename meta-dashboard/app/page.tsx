import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sessionRole } from '@/lib/admin'
import { loadRegistry } from '@/lib/activityLog'
import { readSession, SESSION_COOKIE } from '@/lib/auth'

/**
 * Endereço raiz do domínio: quem tem sessão de administração cai direto no Início (gestor) ou no Painel
 * (sem gestor vinculado); sem sessão, cai no dashboard de exemplo do cliente, como sempre foi.
 */
export default async function Home() {
  const jar = await cookies()
  const session = await readSession(jar.get(SESSION_COOKIE)?.value)
  const role = await sessionRole(session)
  if (role && session) {
    const email = (session.m ?? '').toLowerCase()
    const reg = await loadRegistry().catch(() => null)
    const isManager = !!reg?.managers.find(m => m.email && m.email.toLowerCase() === email)
    redirect(isManager ? '/admin/tarefas' : '/admin')
  }
  redirect('/admin')
}
