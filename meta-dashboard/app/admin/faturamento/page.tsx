import { Suspense } from 'react'
import { Billing } from '@/components/Billing'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Faturamento · Grupo Don' }

export default function Page() {
  return <Suspense fallback={null}><Billing /></Suspense>
}
