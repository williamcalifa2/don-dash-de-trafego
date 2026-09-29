import { Suspense } from 'react'
import { ConfigTabs } from '@/components/admin/ConfigTabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configurações · Grupo Don' }

export default function Page() {
  return <Suspense fallback={null}><ConfigTabs /></Suspense>
}
