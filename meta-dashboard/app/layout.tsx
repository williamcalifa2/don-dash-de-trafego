import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Meta Ads Dashboard',
  description: 'Acompanhe suas campanhas em tempo real',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
