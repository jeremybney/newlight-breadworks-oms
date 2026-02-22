'use client'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import { Wheat } from 'lucide-react'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen bg-cream-100">
        <div className="p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
