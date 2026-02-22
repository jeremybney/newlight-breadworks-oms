import type { Metadata } from 'next'
import { Playfair_Display, Source_Sans_3, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from 'react-hot-toast'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Newlight Breadworks — Order Management',
  description: 'Internal order management system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${sourceSans.variable} ${jetbrains.variable}`}>
      <body className="bg-cream-100 text-bark-900 font-body antialiased">
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#2c1a0e',
                color: '#fdf9ed',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                borderRadius: '4px',
              },
              success: { iconTheme: { primary: '#5c7f61', secondary: '#fdf9ed' } },
              error: { iconTheme: { primary: '#e8632a', secondary: '#fdf9ed' } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
