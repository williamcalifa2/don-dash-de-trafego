import { ClientScreen } from '@/components/present/ClientScreen'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Apresentação · Grupo Don', robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ClientScreen token={token} />
}
