import { Suspense } from 'react'
import { TeamManagement } from '@/components/TeamManagement'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Equipe · Grupo Don' }

export default function Page() {
  return <Suspense fallback={null}><TeamManagement /></Suspense>
}
