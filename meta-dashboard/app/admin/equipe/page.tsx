import { Suspense } from 'react'
import { TeamManagers } from '@/components/TeamManagers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Performance · Grupo Don' }

export default function Page() {
  return <Suspense fallback={null}><TeamManagers /></Suspense>
}
