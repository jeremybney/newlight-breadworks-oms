'use client'
import { useState, useEffect, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService, computeProductionSummary, productsService } from '@/lib/db'
import { PRODUCTS } from '@/lib/products'
import { DOUGH_CATEGORIES, Order, Customer } from '@/types'
import { customersService } from '@/lib/db'
import { format, addDays, parseISO, getDay } from 'date-fns'
import { Printer, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'production' | 'slice' | 'shape' | 'schripps'

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>('production')
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(DOUGH_CATEGORIES.map(c => c.id)))
  const [extraUnits, setExtraUnits] = useState<Record<string, number>>({})
  const [productData, setProductData] = useState<Record<string, any>>({})
  const [sundayOrders, setSundayOrders] = useState<Order[]>([])
  const [mondayOrders, setMondayOrders] = useState<Order[]>([])
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = ordersService.subscribeByDate(date, setOrders)
    return unsub
  }, [date])

  useEffect(() => {
    customersService.getAll().then(setCustomers)
  }, [])

  useEffect(() => {
    productsService.getAll().then(setProductData)
  }, [])

  // For Saturday: load Sunday + Monday orders
  const isSaturday = getDay(parseISO(date)) === 6
  const sundayDate = format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
  const mondayDate = format(addDays(parseISO(date), 2), 'yyyy-MM-dd')

  useEffect(() => {
    if (isSaturday) {
      ordersService.getByDate(sundayDate).then(setSundayOrders)
      ordersService.getByDate(mondayDate).then(setMondayOrders)
    }
  }, [date, isSaturday])

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

  function applyRounding(qty: number, productName: string): number {
    const needsRounding = /\bBun\b|\bRoll\b/i.test(productName)
    if (!needsRounding || qty === 0) return qty
    return Math.ceil(qty / 12) * 12
  }

  // ── Check if product is Schripps ──────────────────────────────────────────
  function isSchrippsProduct(productId: string): boolean {
    const data = productData[productId]
    if (!data) return false
    if (data.isSchripps) return true
    // Check if category name contains 'schripps' (case insensitive)
    if (data.category && typeof data.category === 'string' &&
        data.category.toLowerCase().includes('schripps')) return true
    return false
  }

  // ── Build Slice Summary ────────────────────────────────────────────────────
  const sliceSummary: Record<string, { thSliced: number; sliced: number }> = {}
  activeOrders.forEach(order => {
    order.items.forEach(item => {
      const s = item.slicing
      if (!s || s === 'No Slice' || s === '') return
      if (!sliceSummary[item.productId]) sliceSummary[item.productId] = { thSliced: 0, sliced: 0 }
      if (s === 'TH Sliced') sliceSummary[item.productId].thSliced += item.quantity
      else sliceSummary[item.productId].sliced += item.quantity
    })
  })

  const totalThSliced = Object.values(sliceSummary).reduce((s, v) => s + v.thSliced, 0)
  const totalSliced = Object.values(sliceSummary).reduce((s, v) => s + v.sliced, 0)

  // ── Shape Sheet data (exclude Schripps) ───────────────────────────────────
  const shapeSheetRows = DOUGH_CATEGORIES.flatMap(cat => {
    const catProducts = PRODUCTS.filter(p =>
      p.category === cat.id && p.active && production[p.id] && !isSchrippsProduct(p.id)
    )
    if (!catProducts.length) return []
    return [
      { type: 'category' as const, cat },
      ...catProducts.map(product => {
        const orderQty = production[product.id]?.total || 0
        const rounded = applyRounding(orderQty, product.name)
        const extra = extraUnits[product.id] || 0
        const total = rounded + extra
        return { type: 'product' as const, product, orderQty, rounded, extra, total }
      })
    ]
  })

  const shapeSheetTotal = shapeSheetRows
    .filter(r => r.type === 'product')
    .reduce((s, r) => s + (r.type === 'product' ? r.total : 0), 0)

  // ── Schripps Order data ───────────────────────────────────────────────────
  // Build qty map from orders
  function buildSchrippsQty(orderList: Order[]): Record<string, number> {
    const qty: Record<string, number> = {}
    orderList.filter(o => o.status !== 'cancelled').forEach(order => {
      order.items.forEach(item => {
        // Check if this product is Schripps by looking at productData
        const data = productData[item.productId]
        const catId = data?.category || ''
        const isSchripps = data?.isSchripps ||
          Object.keys(productData).some(id =>
            id === item.productId && productData[id]?.category?.toLowerCase?.()?.includes?.('schripps')
          )
        // Also check by category label in orders
        const catLabel = (item as any).categoryLabel || ''
        if (isSchripps || catLabel.toLowerCase().includes('schripps') ||
            (item as any).category?.toLowerCase?.()?.includes?.('schripps')) {
          qty[item.productId] = (qty[item.productId] || 0) + item.quantity
        }
      })
    })
    return qty
  }

  // For weekday: use current orders. For Saturday: use Sunday + Monday combined
  const schrippsQty = isSaturday
    ? (() => {
        const sunQty = buildSchrippsQty(sundayOrders)
        const monQty = buildSchrippsQty(mondayOrders)
        const combined: Record<string, number> = { ...sunQty }
        Object.entries(monQty).forEach(([id, qty]) => {
          combined[id] = (combined[id] || 0) + qty
        })
        return combined
      })()
    : buildSchrippsQty(activeOrders)

  // Get all Schripps products that have orders
  const schrippsOrderItems = Object.entries(schrippsQty)
    .filter(([_, qty]) => qty > 0)
    .map(([productId, qty]) => {
      const data = productData[productId]
      // Find product name from orders
      const orderItem = activeOrders.flatMap(o => o.items).find(i => i.productId === productId)
        || sundayOrders.flatMap(o => o.items).find(i => i.productId === productId)
        || mondayOrders.flatMap(o => o.items).find(i => i.productId === productId)
      return {
        productId,
        name: orderItem?.productName || productId,
        code: data?.schrippsCode || '',
        qty,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

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
          {(['production', 'slice', 'shape', 'schripps'] as Tab[]).map(t => (
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
              {t === 'slice' ? '✂ Slice' : t === 'shape' ? '📋 Shape Sheet' : t === 'schripps' ? '🥐 Schripps Order' : '🍞 Production'}
            </button>
          ))}
        </div>

        {/* Print Header */}
        <div className="hidden print:block mb-4">
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
            <span>Newlight Breadworks — {tab === 'slice' ? 'Slice Sheet' : tab === 'shape' ? 'Shape Sheet' : tab === 'schripps' ? 'Schripps Order' : 'Production Sheet'}</span>
            <span>{date}</span>
          </div>
          <hr style={{ marginTop: '4px', borderColor: '#2d1f0e' }} />
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
                      const catProducts = PRODUCTS.filter(p => p.category === cat.id && p.active).filter(p => production[p.id] && !isSchrippsProduct(p.id))
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
              <div className="card overflow-hidden print:shadow-none print:border-0 print-full-width">
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '12px 16px', textAlign: 'left', fontSize: '16px', fontWeight: 'bold', minWidth: '260px' }}>
                          {(() => {
                            const d = new Date(date + 'T00:00:00')
                            return `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}`
                          })()}
                        </th>
                        <th style={{ backgroundColor: '#2c5282', color: 'white', padding: '12px 24px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', minWidth: '120px' }}>TH SLICED</th>
                        <th style={{ backgroundColor: '#2c5282', color: 'white', padding: '12px 24px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', minWidth: '120px' }}>SLICED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DOUGH_CATEGORIES.map(cat => {
                        const catProducts = PRODUCTS.filter(p => p.category === cat.id && p.active && sliceSummary[p.id])
                        if (!catProducts.length) return null
                        const catThTotal = catProducts.reduce((s, p) => s + (sliceSummary[p.id]?.thSliced || 0), 0)
                        const catSliceTotal = catProducts.reduce((s, p) => s + (sliceSummary[p.id]?.sliced || 0), 0)
                        return [
                          <tr key={`cat-${cat.id}`} style={{ backgroundColor: cat.color + '20' }}>
                            <td colSpan={3} style={{ padding: '6px 16px', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2d3748', borderTop: `3px solid ${cat.color}` }}>
                              <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: cat.color, borderRadius: '2px', marginRight: '8px', verticalAlign: 'middle' }} />
                              {cat.label}
                            </td>
                          </tr>,
                          ...catProducts.map((product, idx) => {
                            const s = sliceSummary[product.id]
                            return (
                              <tr key={product.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f7fafc' }}>
                                <td style={{ padding: '8px 16px 8px 32px', fontSize: '14px', color: '#1a202c', borderBottom: '1px solid #e2e8f0' }}>{product.name}</td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '20px', color: '#1a202c', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '8px' }}>{s.thSliced > 0 ? s.thSliced : ''}</td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '20px', color: '#1a202c', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '8px' }}>{s.sliced > 0 ? s.sliced : ''}</td>
                              </tr>
                            )
                          })
                        ]
                      })}
                      <tr style={{ backgroundColor: '#edf2f7', borderTop: '3px solid #2d3748' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 'bold', fontSize: '14px' }}>TOTAL</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '22px', borderLeft: '1px solid #cbd5e0', padding: '10px' }}>{totalThSliced || ''}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '22px', borderLeft: '1px solid #cbd5e0', padding: '10px' }}>{totalSliced || ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SHAPE SHEET TAB ── */}
        {tab === 'shape' && (
          <div>
            <div className="no-print mb-4 p-3 rounded-lg bg-wheat-100 border border-wheat-300 text-sm text-bark-800/70">
              💡 Enter any extra units to add on top of orders before printing. Buns and rolls are automatically rounded up to the nearest dozen.
            </div>
            {shapeSheetRows.filter(r => r.type === 'product').length === 0 ? (
              <div className="card text-center py-16 text-bark-800/40">
                <p className="font-display text-lg">No production for {date}</p>
                <p className="text-sm mt-1">Orders will appear here once submitted</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr>
                        <th style={{ backgroundColor: '#2d1f0e', color: '#f5ead8', padding: '6px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', minWidth: '260px' }}>PRODUCT</th>
                        <th style={{ backgroundColor: '#2d1f0e', color: '#f5ead8', padding: '6px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', minWidth: '90px' }}>WEIGHT</th>
                        <th style={{ backgroundColor: '#2d1f0e', color: '#f5ead8', padding: '6px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', minWidth: '80px' }} className="no-print">ORDERS</th>
                        <th style={{ backgroundColor: '#2d1f0e', color: '#f5ead8', padding: '6px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', minWidth: '90px' }} className="no-print">+ EXTRA</th>
                        <th style={{ backgroundColor: '#c4943a', color: 'white', padding: '6px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', minWidth: '80px' }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shapeSheetRows.map((row, idx) => {
                        if (row.type === 'category') {
                          return (
                            <tr key={`cat-${row.cat.id}`} style={{ backgroundColor: row.cat.color + '15' }}>
                              <td colSpan={5} style={{ padding: '3px 10px', fontWeight: 'bold', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2d3748', borderTop: `2px solid ${row.cat.color}` }}>
                                {row.cat.label}
                              </td>
                            </tr>
                          )
                        }
                        const { product, orderQty, rounded, extra, total } = row
                        const wasRounded = rounded > orderQty
                        return (
                          <tr key={product.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#faf8f5' }}>
                            <td style={{ padding: '3px 10px 3px 20px', fontSize: '11px', color: '#1a202c', borderBottom: '1px solid #e2e8f0' }}>{product.name}</td>
                            <td style={{ textAlign: 'center', fontSize: '11px', color: '#718096', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '3px 8px', fontFamily: 'monospace' }}>
                              {productData[product.id]?.unitWeight ? `${productData[product.id].unitWeight}g` : '—'}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '11px', color: '#4a5568', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '3px 8px', fontFamily: 'monospace' }} className="no-print">
                              {wasRounded ? (
                                <span title={`${orderQty} orders → rounded up to ${rounded}`}>
                                  {rounded}<span style={{ fontSize: '10px', color: '#a0aec0', marginLeft: '2px' }}>↑</span>
                                </span>
                              ) : orderQty}
                            </td>
                            <td style={{ textAlign: 'center', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '2px 8px' }} className="no-print">
                              <input
                                type="number"
                                min="0"
                                value={extra || ''}
                                placeholder="0"
                                onChange={e => setExtraUnits(prev => ({ ...prev, [product.id]: parseInt(e.target.value) || 0 }))}
                                style={{ width: '60px', textAlign: 'center', padding: '2px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px', color: '#1a0f00', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '3px 8px', backgroundColor: '#fdf6ec' }}>{total}</td>
                          </tr>
                        )
                      })}
                      <tr style={{ backgroundColor: '#2d1f0e' }}>
                        <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 'bold', fontSize: '11px', color: '#f5ead8' }}>TOTAL UNITS</td>
                        <td className="no-print" style={{ borderLeft: '1px solid #4a3520' }} />
                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', color: '#c4943a', borderLeft: '1px solid #4a3520', padding: '8px' }}>{shapeSheetTotal}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SCHRIPPS ORDER TAB ── */}
        {tab === 'schripps' && (
          <div>
            <div className="no-print mb-4 flex items-center justify-between">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 flex-1 mr-3">
                {isSaturday
                  ? `📦 Saturday order — combining Sunday (${sundayDate}) + Monday (${mondayDate}) orders`
                  : `📦 Daily Schripps order for ${date}`}
              </div>
              <button
                onClick={() => {
                  const d = new Date(date + 'T00:00:00')
                  const formatted = `${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')}`
                  const rows = schrippsOrderItems.map(item =>
                    `${item.name}\t${item.code || '—'}\t${item.qty}\tpc`
                  ).join('\n')
                  const tableRows = schrippsOrderItems.map(item =>
                    `<tr><td style="padding:6px 12px;border:1px solid #ccc;">${item.name}</td><td style="padding:6px 12px;border:1px solid #ccc;font-weight:bold;">${item.code || '—'}</td><td style="padding:6px 12px;border:1px solid #ccc;text-align:center;">${item.qty}</td><td style="padding:6px 12px;border:1px solid #ccc;">pc</td></tr>`
                  ).join('')
                  const html = `<p>Hello,</p><p>Please see our order ${formatted} below:</p><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;"><thead><tr><th style="padding:6px 12px;border:1px solid #ccc;background:#f5f5f5;text-align:left;">PRODUCT</th><th style="padding:6px 12px;border:1px solid #ccc;background:#f5f5f5;text-align:left;">CODE</th><th style="padding:6px 12px;border:1px solid #ccc;background:#f5f5f5;text-align:left;">QUANTITY</th><th style="padding:6px 12px;border:1px solid #ccc;background:#f5f5f5;text-align:left;">UNIT</th></tr></thead><tbody>${tableRows}</tbody></table><p>Best,<br>Newlight Breadworks Team</p>`
                  const blob = new Blob([html], { type: 'text/html' })
                  const item = new ClipboardItem({ 'text/html': blob })
                  navigator.clipboard.write([item])
                  toast.success('Email copied to clipboard!')
                }}
                className="btn-secondary flex items-center gap-2 text-sm whitespace-nowrap"
              >
                📋 Copy as Email
              </button>
            </div>
            {schrippsOrderItems.length === 0 ? (
              <div className="card text-center py-16 text-bark-800/40">
                <p className="font-display text-lg">No Schripps products ordered for {date}</p>
                <p className="text-sm mt-1">Schripps items will appear here once orders are placed</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif' }}>
                    <thead>
                      <tr>
                        <th style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>PRODUCT</th>
                        <th style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '10px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', minWidth: '120px' }}>CODE</th>
                        <th style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '10px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', minWidth: '80px' }}>QTY</th>
                        <th style={{ backgroundColor: '#1e3a5f', color: 'white', padding: '10px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', minWidth: '80px' }}>UNIT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schrippsOrderItems.map((item, idx) => (
                        <tr key={item.productId} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f7fafc' }}>
                          <td style={{ padding: '10px 16px', fontSize: '13px', color: '#1a202c', borderBottom: '1px solid #e2e8f0' }}>{item.name}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold', color: '#2563eb', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '10px' }}>{item.code || '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '20px', color: '#1a202c', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '10px' }}>{item.qty}</td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#718096', borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #e2e8f0', padding: '10px' }}>pc</td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: '#edf2f7', borderTop: '3px solid #1e3a5f' }}>
                        <td colSpan={2} style={{ padding: '10px 16px', fontWeight: 'bold', fontSize: '13px' }}>TOTAL</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '20px', borderLeft: '1px solid #cbd5e0', padding: '10px' }}>
                          {schrippsOrderItems.reduce((s, i) => s + i.qty, 0)}
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
