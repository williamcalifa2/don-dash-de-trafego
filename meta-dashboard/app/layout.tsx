import type { Metadata } from 'next'
import './globals.css'

const clientName = process.env.NEXT_PUBLIC_CLIENT_NAME ?? 'Dashboard Don'
const faviconUrl = process.env.NEXT_PUBLIC_CLIENT_FAVICON_URL ?? null

export const metadata: Metadata = {
  title: clientName,
  description: 'Acompanhe suas campanhas em tempo real',
  icons: {
    icon: [
      { url: faviconUrl ?? '/api/brand/icon' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: faviconUrl ?? '/api/brand/icon',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href={faviconUrl ?? '/api/brand/icon'} />
      </head>
      <body>{children}</body>
    </html>
  )
}
