'use client'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import { Wheat, Menu } from 'lucide-react'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-wheat-500 rounded-lg flex items-center justify-center animate-pulse">
            <Wheat className="w-6 h-6 text-cream-50" />
          </div>
          <div className="text-bark-800/50 text-sm font-body">Loading...</div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content — offset by sidebar width on desktop only */}
      <main className="flex-1 min-h-screen md:ml-56 bg-white">

        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 bg-bark-900 px-4 py-3 flex items-center gap-3 shadow-md">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-cream-200 hover:text-cream-50 transition-colors p-1"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-wheat-500 rounded flex items-center justify-center">
              <Wheat className="w-3.5 h-3.5 text-cream-50" />
            </div>
            <span className="font-display text-cream-50 text-sm">Newlight Breadworks</span>
          </div>
        </div>

        <div className="p-4 md:p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
