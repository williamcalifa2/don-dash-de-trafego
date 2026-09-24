import { PresenterScreen } from '@/components/present/PresenterScreen'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Apresentar · Grupo Don', robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  return <PresenterScreen slug={slug} id={id} />
}
