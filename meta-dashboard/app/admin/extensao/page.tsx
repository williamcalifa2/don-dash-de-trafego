import { Suspense } from 'react'
import { ExtensionPage } from '@/components/ExtensionPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Extensão · Grupo Don' }

export default function Page() {
  return <Suspense fallback={null}><ExtensionPage /></Suspense>
}
