'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService, computeProductionSummary } from '@/lib/db'
import { PRODUCTS } from '@/lib/products'
import { DOUGH_CATEGORIES, Order } from '@/types'
import { format, addDays, parseISO } from 'date-fns'
import { Printer, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'

const NUM_DAYS = 5

export default function ForecastPage() {
  const [startDate, setStartDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [ordersByDate, setOrdersByDate] = useState<Record<string, Order[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(DOUGH_CATEGORIES.map(c => c.id))
  )

  const dates = Array.from({ length: NUM_DAYS }, (_, i) =>
    format(addDays(parseISO(startDate), i), 'yyyy-MM-dd')
  )

  useEffect(() => {
    setLoading(true)
    const unsubscribers: (() => void)[] = []
    const collected: Record<string, Order[]> = {}

    dates.forEach(date => {
      const unsub = ordersService.subscribeByDate(date, (orders) => {
        collected[date] = orders
        setOrdersByDate({ ...collected })
      })
      unsubscribers.push(unsub)
    })

    setLoading(false)
    return () => unsubscribers.forEach(u => u())
  }, [startDate])

  const productionByDate = dates.reduce((acc, date) => {
    acc[date] = computeProductionSummary(ordersByDate[date] || [])
    return acc
  }, {} as Record<string, ReturnType<typeof computeProductionSummary>>)

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // For each product, check if it has any orders across the 5 days
  const hasAnyOrders = (productId: string) =>
    dates.some(d => (productionByDate[d]?.[productId]?.total || 0) > 0)

  return (
    <AppShell>
      <div className="max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h1 className="section-header">5-Day Forecast</h1>
            <p className="text-bark-800/60 text-sm">Production overview for the next 5 days</p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="label">Starting From</label>
              <input type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="input w-44" />
            </div>
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 mt-4">
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-3 mb-6 no-print">
          {dates.map(date => {
            const dayOrders = (ordersByDate[date] || []).filter(o => o.status !== 'cancelled')
            const totalUnits = dayOrders.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0), 0)
            const revenue = dayOrders.reduce((s, o) => s + o.totalAmount, 0)
            return (
              <div key={date} className="card px-4 py-3">
                <div className="font-display text-sm text-bark-900 mb-0.5">
                  {format(parseISO(date), 'EEE')}
                </div>
                <div className="text-xs font-mono text-bark-800/50 mb-2">
                  {format(parseISO(date), 'MMM d')}
                </div>
                <div className="text-2xl font-display text-bark-900">{dayOrders.length}</div>
                <div className="text-xs text-bark-800/50 font-mono">orders</div>
                <div className="text-sm font-mono text-wheat-600 mt-1">{totalUnits} units</div>
                <div className="text-xs font-mono text-bark-800/40">${revenue.toFixed(0)}</div>
              </div>
            )
          })}
        </div>

        {/* Forecast Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base min-w-max">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-cream-200 z-10 min-w-[200px]">Product</th>
                  {dates.map(date => (
                    <th key={date} className="text-center min-w-[90px] bg-cream-200">
                      <div className="font-display">{format(parseISO(date), 'EEE')}</div>
                      <div className="text-wheat-600 font-mono text-[10px] font-normal">
                        {format(parseISO(date), 'MMM d')}
                      </div>
                    </th>
                  ))}
                  <th className="text-center min-w-[70px] bg-bark-900 text-cream-50">5-Day Total</th>
                </tr>
              </thead>
              <tbody>
                {DOUGH_CATEGORIES.map(cat => {
                  const catProducts = PRODUCTS.filter(p =>
                    p.category === cat.id && p.active && hasAnyOrders(p.id)
                  )
                  if (!catProducts.length) return null
                  const isExpanded = expandedCategories.has(cat.id)

                  // Category totals per day
                  const catDayTotals = dates.map(date =>
                    catProducts.reduce((s, p) => s + (productionByDate[date]?.[p.id]?.total || 0), 0)
                  )
                  const cat5DayTotal = catDayTotals.reduce((s, v) => s + v, 0)

                  return [
                    // Category row
                    <tr key={`cat-${cat.id}`}>
                      <td
                        className="sticky left-0 z-10 cursor-pointer font-display text-sm py-2.5"
                        style={{ backgroundColor: cat.color + '25' }}
                        onClick={() => toggleCategory(cat.id)}
                      >
                        <div className="flex items-center gap-2 pl-2">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                          {cat.label}
                        </div>
                      </td>
                      {catDayTotals.map((total, i) => (
                        <td key={dates[i]} className="text-center font-mono font-semibold text-bark-800/70"
                          style={{ backgroundColor: cat.color + '15' }}>
                          {total || '—'}
                        </td>
                      ))}
                      <td className="text-center font-mono font-bold text-bark-900 bg-cream-100">
                        {cat5DayTotal || '—'}
                      </td>
                    </tr>,

                    // Product rows
                    ...(isExpanded ? catProducts.map(product => {
                      const dayTotals = dates.map(date =>
                        productionByDate[date]?.[product.id]?.total || 0
                      )
                      const fiveDayTotal = dayTotals.reduce((s, v) => s + v, 0)

                      return (
                        <tr key={product.id}>
                          <td className="sticky left-0 bg-white z-10 pl-10 text-xs text-bark-900">
                            {product.name}
                          </td>
                          {dayTotals.map((total, i) => (
                            <td key={dates[i]} className="text-center font-mono text-sm">
                              {total > 0 ? (
                                <span className="font-semibold text-bark-900">{total}</span>
                              ) : (
                                <span className="text-bark-800/20">—</span>
                              )}
                            </td>
                          ))}
                          <td className="text-center font-mono font-bold text-wheat-700 bg-cream-50">
                            {fiveDayTotal}
                          </td>
                        </tr>
                      )
                    }) : [])
                  ]
                })}
              </tbody>

              {/* Totals Row */}
              <tfoot>
                <tr className="border-t-2 border-wheat-400/30">
                  <td className="sticky left-0 bg-cream-200 z-10 font-display text-sm px-4 py-2.5">
                    Daily Total (units)
                  </td>
                  {dates.map(date => {
                    const dayOrders = (ordersByDate[date] || []).filter(o => o.status !== 'cancelled')
                    const total = dayOrders.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0), 0)
                    return (
                      <td key={date} className="text-center font-mono font-bold text-bark-900 bg-cream-200 py-2.5">
                        {total}
                      </td>
                    )
                  })}
                  <td className="text-center font-mono font-bold text-bark-900 bg-bark-900/10 py-2.5">
                    {dates.reduce((s, date) => {
                      const dayOrders = (ordersByDate[date] || []).filter(o => o.status !== 'cancelled')
                      return s + dayOrders.reduce((s2, o) => s2 + o.items.reduce((s3, i) => s3 + i.quantity, 0), 0)
                    }, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {loading && (
          <div className="text-center py-8 text-bark-800/40 text-sm font-mono">Loading forecast data...</div>
        )}
      </div>
    </AppShell>
  )
}
