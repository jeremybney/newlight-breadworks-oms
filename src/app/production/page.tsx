'use client'
import { useState, useEffect, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService, computeProductionSummary } from '@/lib/db'
import { PRODUCTS } from '@/lib/products'
import { DOUGH_CATEGORIES, Order, Customer } from '@/types'
import { customersService } from '@/lib/db'
import { format, addDays } from 'date-fns'
import { Printer, ChevronDown, ChevronRight } from 'lucide-react'

type Tab = 'production' | 'slice'

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>('production')
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(DOUGH_CATEGORIES.map(c => c.id)))
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = ordersService.subscribeByDate(date, setOrders)
    return unsub
  }, [date])

  useEffect(() => {
    customersService.getAll().then(setCustomers)
  }, [])

  const activeOrders = orders.filter(o => o.status !== 'cancelled')
  const production = computeProductionSummary(orders)

  const activeCustomerIds = Array.from(new Set(activeOrders.map(o => o.customerId)))
  const activeCustomers = customers
    .filter(c => activeCustomerIds.includes(c.id))
    .sort((a, b) => (a.route || '').localeCompare(b.route || '') || a.name.localeCompare(b.name))

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // ── Build Slice Summary ────────────────────────────────────────────────────
  // productId -> { thSliced: total, sliced: total }
  const sliceSummary: Record<string, { thSliced: number; sliced: number }> = {}
  activeOrders.forEach(order => {
    order.items.forEach(item => {
      const s = item.slicing
      if (!s || s === 'No Slice' || s === '') return
      if (!sliceSummary[item.productId]) sliceSummary[item.productId] = { thSliced: 0, sliced: 0 }
      if (s === 'TH Sliced') sliceSummary[item.productId].thSliced += item.quantity
      else sliceSummary[item.productId].sliced += item.quantity // Sliced, Half Sliced, etc.
    })
  })

  const totalThSliced = Object.values(sliceSummary).reduce((s, v) => s + v.thSliced, 0)
  const totalSliced = Object.values(sliceSummary).reduce((s, v) => s + v.sliced, 0)

  return (
    <AppShell>
      <div className="max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 no-print">
          <div>
            <h1 className="section-header">Production Sheet</h1>
            <p className="text-bark-800/60 text-sm">Daily production overview for bakers</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-44" />
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 no-print border-b border-wheat-400/30">
          {(['production', 'slice'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 500,
                borderBottom: tab === t ? '2px solid #c4943a' : '2px solid transparent',
                color: tab === t ? '#1a0f00' : '#7a6040',
                background: 'none',
                cursor: 'pointer',
                marginBottom: '-1px',
                textTransform: 'capitalize',
              }}
            >
              {t === 'slice' ? '✂ Slice' : '🍞 Production'}
            </button>
          ))}
        </div>

        {/* Print Header */}
        <div className="hidden print:block mb-6 text-center">
          <div style={{ fontFamily: 'serif', fontSize: '20px', fontWeight: 'bold' }}>
            Newlight Breadworks — {tab === 'slice' ? 'Slice Sheet' : 'Production Sheet'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '13px', marginTop: '4px' }}>{date}</div>
        </div>

        {/* ── PRODUCTION TAB ── */}
        {tab === 'production' && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-6 no-print">
              <StatCard label="Total Orders" value={activeOrders.length.toString()} />
              <StatCard label="Customers" value={activeCustomers.length.toString()} />
              <StatCard label="Total Items" value={activeOrders.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.quantity, 0), 0).toString()} />
              <StatCard label="Revenue" value={'$' + activeOrders.reduce((s, o) => s + o.totalAmount, 0).toFixed(2)} />
            </div>

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
                      const catProducts = PRODUCTS.filter(p => p.category === cat.id && p.active).filter(p => production[p.id])
                      if (!catProducts.length) return null
                      const isExpanded = expandedCategories.has(cat.id)
                      const catTotal = catProducts.reduce((s, p) => s + (production[p.id]?.total || 0), 0)
                      return [
                        <tr key={`cat-${cat.id}`}>
                          <td className="sticky left-0 z-10 cursor-pointer font-display text-sm py-2"
                            style={{ backgroundColor: cat.color + '30' }}
                            onClick={() => toggleCategory(cat.id)}
                            colSpan={2 + activeCustomers.length}>
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                              <span>{cat.label}</span>
                              <span className="font-mono text-xs text-bark-800/60 ml-1">({catTotal})</span>
                            </div>
                          </td>
                        </tr>,
                        ...(isExpanded ? catProducts.map(product => {
                          const prodData = production[product.id]
                          return (
                            <tr key={product.id}>
                              <td className="sticky left-0 bg-white z-10 pl-8 text-xs">{product.name}</td>
                              <td className="text-center font-mono font-bold text-bark-900 bg-cream-100">{prodData?.total || ''}</td>
                              {activeCustomers.map(c => {
                                const cData = prodData?.byCustomer?.[c.id]
                                return (
                                  <td key={c.id} className="text-center text-xs font-mono">
                                    {cData ? (
                                      <div>
                                        <span className="font-semibold text-bark-900">{cData.qty}</span>
                                        {cData.slicing && <div className="text-sage-600 text-[10px] leading-tight">{cData.slicing}</div>}
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
          </>
        )}

        {/* ── SLICE TAB ── */}
        {tab === 'slice' && (
          <div>
            {/* Slice stat cards */}
            <div className="grid grid-cols-3 gap-3 mb-6 no-print">
              <StatCard label="Products Needing Slicing" value={Object.keys(sliceSummary).length.toString()} />
              <StatCard label="TH Sliced Total" value={totalThSliced.toString()} />
              <StatCard label="Sliced Total" value={totalSliced.toString()} />
            </div>

            {Object.keys(sliceSummary).length === 0 ? (
              <div className="card text-center py-16 text-bark-800/40">
                <p className="font-display text-lg">No sliced items for {date}</p>
                <p className="text-sm mt-1">Sliced orders will appear here once submitted</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr>
                        {/* Date header */}
                        <th style={{
                          backgroundColor: '#1e3a5f', color: 'white',
                          padding: '12px 16px', textAlign: 'left',
                          fontSize: '16px', fontWeight: 'bold', minWidth: '260px'
                        }}>
                          {(() => {
                            const d = new Date(date + 'T00:00:00')
                            return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}`
                          })()}
                        </th>
                        <th style={{
                          backgroundColor: '#2c5282', color: 'white',
                          padding: '12px 24px', textAlign: 'center',
                          fontSize: '14px', fontWeight: 'bold', minWidth: '120px'
                        }}>
                          TH SLICED
                        </th>
                        <th style={{
                          backgroundColor: '#2c5282', color: 'white',
                          padding: '12px 24px', textAlign: 'center',
                          fontSize: '14px', fontWeight: 'bold', minWidth: '120px'
                        }}>
                          SLICED
                        </th>
                        <th style={{
                          backgroundColor: '#4a5568', color: 'white',
                          padding: '12px 16px', textAlign: 'center',
                          fontSize: '14px', fontWeight: 'bold', minWidth: '100px'
                        }}>
                          ACTUAL
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {DOUGH_CATEGORIES.map(cat => {
                        // Products in this category that need slicing
                        const catProducts = PRODUCTS.filter(p =>
                          p.category === cat.id && p.active && sliceSummary[p.id]
                        )
                        if (!catProducts.length) return null

                        const catThTotal = catProducts.reduce((s, p) => s + (sliceSummary[p.id]?.thSliced || 0), 0)
                        const catSliceTotal = catProducts.reduce((s, p) => s + (sliceSummary[p.id]?.sliced || 0), 0)

                        return [
                          // Category header row
                          <tr key={`cat-${cat.id}`} style={{ backgroundColor: cat.color + '20' }}>
                            <td colSpan={4} style={{
                              padding: '6px 16px',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              color: '#2d3748',
                              borderTop: `3px solid ${cat.color}`,
                            }}>
                              <span style={{
                                display: 'inline-block',
                                width: '10px', height: '10px',
                                backgroundColor: cat.color,
                                borderRadius: '2px',
                                marginRight: '8px',
                                verticalAlign: 'middle',
                              }} />
                              {cat.label}
                              {catThTotal > 0 && <span style={{ marginLeft: '16px', color: '#4a5568', fontWeight: 'normal' }}>TH: {catThTotal}</span>}
                              {catSliceTotal > 0 && <span style={{ marginLeft: '12px', color: '#4a5568', fontWeight: 'normal' }}>Sliced: {catSliceTotal}</span>}
                            </td>
                          </tr>,

                          // Product rows
                          ...catProducts.map((product, idx) => {
                            const s = sliceSummary[product.id]
                            return (
                              <tr key={product.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f7fafc' }}>
                                <td style={{ padding: '8px 16px 8px 32px', fontSize: '14px', color: '#1a202c', borderBottom: '1px solid #e2e8f0' }}>
                                  {product.name}
                                </td>
                                <td style={{
                                  textAlign: 'center', fontWeight: 'bold',
                                  fontSize: '20px', color: '#1a202c',
                                  borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0',
                                  padding: '8px',
                                }}>
                                  {s.thSliced > 0 ? s.thSliced : ''}
                                </td>
                                <td style={{
                                  textAlign: 'center', fontWeight: 'bold',
                                  fontSize: '20px', color: '#1a202c',
                                  borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0',
                                  padding: '8px',
                                }}>
                                  {s.sliced > 0 ? s.sliced : ''}
                                </td>
                                <td style={{
                                  textAlign: 'center',
                                  borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0',
                                  padding: '8px', color: '#a0aec0', fontSize: '12px',
                                }}>
                                  —
                                </td>
                              </tr>
                            )
                          })
                        ]
                      })}

                      {/* Totals row */}
                      <tr style={{ backgroundColor: '#edf2f7', borderTop: '3px solid #2d3748' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 'bold', fontSize: '14px' }}>TOTAL</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '22px', borderLeft: '1px solid #cbd5e0', padding: '10px' }}>
                          {totalThSliced || ''}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '22px', borderLeft: '1px solid #cbd5e0', padding: '10px' }}>
                          {totalSliced || ''}
                        </td>
                        <td style={{ borderLeft: '1px solid #cbd5e0' }} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

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
