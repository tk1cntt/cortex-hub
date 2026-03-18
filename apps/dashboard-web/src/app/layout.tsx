import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cortex Hub',
  description: 'The Neural Intelligence Platform for AI Agent Orchestration',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
