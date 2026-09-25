import type { Metadata } from 'next'
import './globals.css'
import { UsageTracker } from '@/components/UsageTracker'
import { HeatmapOverlay } from '@/components/HeatmapOverlay'

const clientName = process.env.NEXT_PUBLIC_CLIENT_NAME ?? 'Dashboard Don'
const faviconUrl = process.env.NEXT_PUBLIC_CLIENT_FAVICON_URL ?? null

export const metadata: Metadata = {
  title: clientName,
  description: 'Acompanhe suas campanhas em tempo real',
  icons: {
    icon: [
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: faviconUrl ?? '/api/brand/icon' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

const THEME_BOOT = `try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da primeira pintura. Sem isso a página nascia no tema padrão e virava escura só depois de carregar (piscada branca). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>
        {children}
        <UsageTracker />
        <HeatmapOverlay />
      </body>
    </html>
  )
}
