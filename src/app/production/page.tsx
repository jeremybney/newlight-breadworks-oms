'use client'
import { useState, useEffect, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService, computeProductionSummary } from '@/lib/db'
import { PRODUCTS } from '@/lib/products'
import { DOUGH_CATEGORIES, Order, Customer } from '@/types'
import { customersService } from '@/lib/db'
import { format, addDays } from 'date-fns'
import { Printer, ChevronDown, ChevronRight, Download } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ProductionPage() {
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(DOUGH_CATEGORIES.map(c => c.id)))
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = ordersService.subscribeByDate(date, (fetchedOrders) => {
      setOrders(fetchedOrders)
    })
    return unsub
  }, [date])

  useEffect(() => {
    customersService.getAll().then(setCustomers)
  }, [])

  const production = computeProductionSummary(orders)

  // Get all customers who have orders on this date
  const activeCustomerIds = Array.from(new Set(
    orders.filter(o => o.status !== 'cancelled').map(o => o.customerId)
  )]
  const activeCustomers = customers.filter(c => activeCustomerIds.includes(c.id))
    .sort((a, b) => (a.route || '').localeCompare(b.route || '') || a.name.localeCompare(b.name))

  const handlePrint = () => window.print()

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  return (
    <AppShell>
      <div className="max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h1 className="section-header">Production Sheet</h1>
            <p className="text-bark-800/60 text-sm">Daily production overview for bakers</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input w-44"
            />
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>

        {/* Print Header */}
        <div className="hidden print:block mb-4 text-center">
          <h1 className="font-display text-2xl">Newlight Breadworks — Production Sheet</h1>
          <p className="text-sm font-mono">{date} · {orders.filter(o => o.status !== 'cancelled').length} orders · {activeCustomers.length} customers</p>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-3 mb-6 no-print">
          <StatCard label="Total Orders" value={orders.filter(o => o.status !== 'cancelled').length.toString()} />
          <StatCard label="Customers" value={activeCustomers.length.toString()} />
          <StatCard
            label="Total Items"
            value={orders.filter(o => o.status !== 'cancelled')
              .reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0), 0).toString()}
          />
          <StatCard
            label="Revenue"
            value={'$' + orders.filter(o => o.status !== 'cancelled')
              .reduce((s, o) => s + o.totalAmount, 0).toFixed(2)}
          />
        </div>

        {/* Main Production Table */}
        <div ref={printRef} className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base min-w-max">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-cream-200 z-10 min-w-[200px]">Product</th>
                  <th className="bg-bark-900 text-cream-50 text-center min-w-[60px]">TOTAL</th>
                  {activeCustomers.map(c => (
                    <th key={c.id} className="text-center min-w-[80px] max-w-[100px]">
                      <div className="truncate max-w-[90px]" title={c.name}>
                        {c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name}
                      </div>
                      <div className="text-wheat-500 font-mono text-[10px] font-normal">{c.route}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOUGH_CATEGORIES.map(cat => {
                  const catProducts = PRODUCTS.filter(p => p.category === cat.id && p.active)
                    .filter(p => production[p.id])
                  if (!catProducts.length) return null
                  const isExpanded = expandedCategories.has(cat.id)
                  const catTotal = catProducts.reduce((s, p) => s + (production[p.id]?.total || 0), 0)

                  return [
                    // Category header row
                    <tr key={`cat-${cat.id}`}>
                      <td
                        className="sticky left-0 z-10 cursor-pointer font-display text-sm py-2"
                        style={{ backgroundColor: cat.color + '30' }}
                        onClick={() => toggleCategory(cat.id)}
                        colSpan={2 + activeCustomers.length}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />
                          }
                          <span
                            className="w-2.5 h-2.5 rounded-sm"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span>{cat.label}</span>
                          <span className="font-mono text-xs text-bark-800/60 ml-1">({catTotal})</span>
                        </div>
                      </td>
                    </tr>,

                    // Product rows
                    ...(isExpanded ? catProducts.map(product => {
                      const prodData = production[product.id]
                      return (
                        <tr key={product.id}>
                          <td className="sticky left-0 bg-white z-10 pl-8 text-xs">
                            {product.name}
                          </td>
                          <td className="text-center font-mono font-bold text-bark-900 bg-cream-100">
                            {prodData?.total || ''}
                          </td>
                          {activeCustomers.map(c => {
                            const cData = prodData?.byCustomer?.[c.id]
                            return (
                              <td key={c.id} className="text-center text-xs font-mono">
                                {cData ? (
                                  <div>
                                    <span className="font-semibold text-bark-900">{cData.qty}</span>
                                    {cData.slicing && (
                                      <div className="text-sage-600 text-[10px] leading-tight">{cData.slicing}</div>
                                    )}
                                  </div>
                                ) : ''}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    }) : [])
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>

        {orders.length === 0 && (
          <div className="text-center py-16 text-bark-800/40">
            <p className="font-display text-lg">No orders for {date}</p>
            <p className="text-sm mt-1">Orders will appear here once submitted</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-bark-800/60 font-mono mb-0.5">{label}</div>
      <div className="font-display text-2xl text-bark-900">{value}</div>
    </div>
  )
}
