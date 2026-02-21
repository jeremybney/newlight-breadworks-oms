'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { mixSheetService, ordersService, computeProductionSummary } from '@/lib/db'
import { DOUGH_CATEGORIES, DoughCategory, Order } from '@/types'
import { PRODUCTS } from '@/lib/products'
import { format, addDays } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import { Save, Loader2, Scale } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MixSheetPage() {
  const { appUser } = useAuth()
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [weights, setWeights] = useState<Partial<Record<DoughCategory, number>>>({})
  const [orders, setOrders] = useState<Order[]>([])
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    // Load existing mix sheet for date
    mixSheetService.getByDate(date).then(entry => {
      if (entry) {
        setWeights(entry.doughWeights as any)
        setNotes(entry.notes)
      } else {
        setWeights({})
        setNotes('')
      }
    })

    // Load orders to show required amounts
    ordersService.getByDate(date).then(setOrders)
  }, [date])

  // Calculate required units per category from orders
  const production = computeProductionSummary(orders)
  const requiredByCategory: Partial<Record<DoughCategory, number>> = {}
  DOUGH_CATEGORIES.forEach(cat => {
    const catProducts = PRODUCTS.filter(p => p.category === cat.id)
    const total = catProducts.reduce((s, p) => s + (production[p.id]?.total || 0), 0)
    if (total > 0) requiredByCategory[cat.id] = total
  })

  const setWeight = (cat: DoughCategory, val: number) => {
    setWeights(prev => ({ ...prev, [cat]: val }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await mixSheetService.save({
        date,
        doughWeights: weights as Record<DoughCategory, number>,
        notes,
        createdBy: appUser?.id || '',
      })
      toast.success('Mix sheet saved')
    } catch {
      toast.error('Failed to save mix sheet')
    } finally {
      setSaving(false)
    }
  }

  const totalWeight = Object.values(weights).reduce((s, w) => s + (w || 0), 0)

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="section-header">Mix Sheet</h1>
            <p className="text-bark-800/60 text-sm">Enter dough weights in grams for each category</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input w-44"
            />
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>

        {/* Total Weight */}
        <div className="card px-5 py-3 mb-5 flex items-center gap-3">
          <Scale className="w-5 h-5 text-wheat-500" />
          <div>
            <div className="text-xs text-bark-800/60 font-mono">Total Dough Weight</div>
            <div className="font-display text-2xl text-bark-900">
              {totalWeight.toLocaleString()}g
              <span className="text-base text-bark-800/50 ml-2">
                ({(totalWeight / 1000).toFixed(2)} kg)
              </span>
            </div>
          </div>
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {DOUGH_CATEGORIES.map(cat => {
            const required = requiredByCategory[cat.id]
            const entered = weights[cat.id]
            const hasOrders = !!required

            return (
              <div
                key={cat.id}
                className={`card p-4 transition-all ${hasOrders ? 'border-wheat-400/40' : 'opacity-60'}`}
                style={{ borderLeftWidth: '3px', borderLeftColor: cat.color }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                  <span className="font-display text-sm text-bark-900">{cat.label}</span>
                  {hasOrders && (
                    <span className="ml-auto text-xs font-mono text-bark-800/50">
                      {required} units ordered
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="label">Weight (grams)</label>
                    <input
                      type="number"
                      value={entered || ''}
                      onChange={e => setWeight(cat.id, parseFloat(e.target.value) || 0)}
                      className="input font-mono"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  {entered && (
                    <div className="text-right mt-5">
                      <div className="text-xs text-bark-800/50 font-mono">{(entered/1000).toFixed(2)}kg</div>
                      {required && (
                        <div className={`text-xs font-mono font-semibold ${
                          entered >= required * 350 ? 'text-sage-600' : 'text-ember-500'
                        }`}>
                          {required > 0 ? `~${Math.round(entered / required)}g/unit` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Notes */}
        <div className="card p-5">
          <h3 className="font-display text-base text-bark-900 mb-3">Baker Notes</h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="input resize-none h-24"
            placeholder="Any notes for today's mix (fermentation times, adjustments, etc.)..."
          />
        </div>

        {/* Summary Table */}
        <div className="card mt-4 overflow-hidden">
          <div className="px-5 py-3 border-b border-wheat-400/20">
            <h3 className="font-display text-base text-bark-900">Summary</h3>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-center">Units Ordered</th>
                <th className="text-center">Dough Weight</th>
                <th className="text-center">g / Unit</th>
              </tr>
            </thead>
            <tbody>
              {DOUGH_CATEGORIES.filter(cat => requiredByCategory[cat.id] || weights[cat.id]).map(cat => (
                <tr key={cat.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                      {cat.label}
                    </div>
                  </td>
                  <td className="text-center font-mono">{requiredByCategory[cat.id] || '—'}</td>
                  <td className="text-center font-mono">
                    {weights[cat.id] ? `${weights[cat.id]?.toLocaleString()}g` : '—'}
                  </td>
                  <td className="text-center font-mono">
                    {weights[cat.id] && requiredByCategory[cat.id]
                      ? `${Math.round(weights[cat.id]! / requiredByCategory[cat.id]!)}g`
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
