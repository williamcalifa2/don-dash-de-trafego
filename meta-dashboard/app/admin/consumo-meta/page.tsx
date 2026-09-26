import { Suspense } from 'react'
import { MetaUsage } from '@/components/MetaUsage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Consumo da Meta · Grupo Don' }

export default function Page() {
  return <Suspense fallback={null}><MetaUsage /></Suspense>
}
