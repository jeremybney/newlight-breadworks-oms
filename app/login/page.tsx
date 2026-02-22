'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Wheat, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { signIn } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
      router.push('/orders')
    } catch (err: any) {
      toast.error('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bark-900 flex items-center justify-center p-4"
         style={{
           backgroundImage: `radial-gradient(ellipse at 30% 20%, rgba(200,149,108,0.15) 0%, transparent 60%),
                            radial-gradient(ellipse at 70% 80%, rgba(92,127,97,0.10) 0%, transparent 60%)`
         }}>
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-wheat-500 rounded-2xl mb-4 shadow-lg">
            <Wheat className="w-8 h-8 text-cream-50" />
          </div>
          <h1 className="font-display text-3xl text-cream-50 mb-1">Newlight Breadworks</h1>
          <p className="text-wheat-400 text-sm font-mono">Order Management System</p>
        </div>

        {/* Form Card */}
        <div className="bg-cream-50 rounded-xl shadow-2xl p-8">
          <h2 className="font-display text-xl text-bark-900 mb-6">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@newlightbreadworks.com"
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-wheat-400 hover:text-bark-800 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-cream-50/30 border-t-cream-50 rounded-full animate-spin" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-cream-200/40 text-xs mt-6 font-mono">
          Staff access only · Contact admin for credentials
        </p>
      </div>
    </div>
  )
}
