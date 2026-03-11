'use client'
import { useState, useEffect, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService, customersService } from '@/lib/db'
import { Order, Customer } from '@/types'
import { format, addDays } from 'date-fns'
import { Printer } from 'lucide-react'

export default function StickersPage() {
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Map<string, Customer>>(new Map())
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const unsub = ordersService.subscribeByDate(date, (fetchedOrders) => {
      const active = fetchedOrders.filter(o => o.status !== 'cancelled')
      setOrders(active)
      setSelectedOrderIds(new Set(active.map(o => o.id)))
    })
    return unsub
  }, [date])

  useEffect(() => {
    customersService.getAll().then(list => {
      setCustomers(new Map(list.map(c => [c.id, c])))
    })
  }, [])

  const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id))

  const toggleOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <AppShell>
      {/* ── Controls (hidden on print) ── */}
      <div className="no-print max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="section-header">Sticker Generator</h1>
            <p className="text-bark-800/60 text-sm">Generate 3×2" shipping labels for orders</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-44" />
            <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Print {selectedOrders.length} Sticker{selectedOrders.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Order Selection */}
          <div className="col-span-1 card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base">Select Orders</h3>
              <div className="flex gap-2">
                <button onClick={() => setSelectedOrderIds(new Set(orders.map(o => o.id)))}
                  className="text-xs text-wheat-600 hover:text-wheat-700">All</button>
                <span className="text-bark-800/30">|</span>
                <button onClick={() => setSelectedOrderIds(new Set())}
                  className="text-xs text-wheat-600 hover:text-wheat-700">None</button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {orders.map(order => {
                const customer = customers.get(order.customerId)
                const checked = selectedOrderIds.has(order.id)
                return (
                  <label key={order.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded cursor-pointer transition-colors ${checked ? 'bg-wheat-400/15' : 'hover:bg-cream-100'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleOrder(order.id)} className="mt-0.5 accent-wheat-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-bark-900 truncate">{order.customerName}</div>
                      <div className="text-xs font-mono text-bark-800/50">
                        {customer?.route} · {customer?.distributor} · {order.items.reduce((s, i) => s + i.quantity, 0)} units
                      </div>
                    </div>
                  </label>
                )
              })}
              {orders.length === 0 && (
                <div className="text-center py-8 text-bark-800/40 text-sm">No orders for {date}</div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="col-span-2">
            <h3 className="font-display text-base text-bark-900 mb-3">Preview</h3>
            <div className="flex flex-wrap gap-4">
              {selectedOrders.map(order => (
                <StickerBox key={order.id} order={order} customer={customers.get(order.customerId)} date={date} forPrint={false} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Print Area ── */}
      <div className="hidden print:block">
        {selectedOrders.map(order => (
          <StickerBox key={order.id} order={order} customer={customers.get(order.customerId)} date={date} forPrint={true} />
        ))}
      </div>
    </AppShell>
  )
}

// ── Single Sticker (used for both preview and print) ──────────────────────────
function StickerBox({ order, customer, date, forPrint }: {
  order: Order; customer?: Customer; date: string; forPrint: boolean
}) {
  // Format date as M/D/YYYY
  const d = new Date(date + 'T00:00:00')
  const displayDate = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`

  const outerStyle: React.CSSProperties = forPrint
    ? { width: '3in', minHeight: '2in', pageBreakAfter: 'always', fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden' }
    : { width: '300px', minHeight: '200px', border: '2px dashed #d4a96a', borderRadius: '6px', fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden', backgroundColor: '#fff' }

  return (
    <div style={outerStyle}>
      {/* ── Top: Newlight Breadworks bar ── */}
      <div style={{
        backgroundColor: '#1e3a5f', color: '#ffffff',
        padding: '3px 8px', fontSize: '8px', fontWeight: 'bold', letterSpacing: '0.06em',
      }}>
        Newlight Breadworks
      </div>

      {/* ── Date in grey bar ── */}
      <div style={{
        backgroundColor: '#c8c8c8', color: '#111',
        padding: '2px 8px', fontSize: '11px', fontWeight: '700',
        letterSpacing: '0.04em',
      }}>
        {displayDate}
      </div>

      <div style={{ padding: '6px 8px' }}>
        {/* ── Customer name ── */}
        <div style={{ fontSize: '14px', fontWeight: '700', lineHeight: 1.2, color: '#111', marginBottom: '4px' }}>
          {order.customerName}
        </div>

        {/* ── Distributor HUGE on top, Route below ── */}
        <div style={{ marginBottom: '6px', lineHeight: 1 }}>
          {customer?.distributor && (
            <div style={{ fontSize: '40px', fontWeight: '900', color: '#1a56b0', lineHeight: 1 }}>
              {customer.distributor}
            </div>
          )}
          {customer?.route && (
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#1a56b0', lineHeight: 1.1 }}>
              {customer.route}
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ borderTop: '1.5px solid #999', marginBottom: '5px' }} />

        {/* ── Items: product name + qty + slicing on same line ── */}
        {order.items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: '12px', fontWeight: '700', color: '#111',
            padding: '3px 0', borderBottom: '1px solid #e8e8e8',
          }}>
            <span style={{ flex: 1, paddingRight: '8px' }}>{item.productName}</span>
            <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              {item.quantity}
              {item.slicing && item.slicing !== 'No Slice' ? ` ${item.slicing}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* ── Packaging — between red lines ── */}
      {customer?.packagingType && (
        <div style={{ borderTop: '2.5px solid #dc2626', margin: '0 8px' }}>
          <div style={{
            borderBottom: '2.5px solid #dc2626',
            textAlign: 'center', fontSize: '9px', fontWeight: '800',
            color: '#111', padding: '3px 0', letterSpacing: '0.05em',
          }}>
            {customer.packagingType}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '8px', color: '#666',
        padding: '3px 8px', borderTop: '1px solid #ddd', marginTop: '3px',
      }}>
        <span>Code: {customer?.code || '—'}</span>
        <span>{order.items.reduce((s, i) => s + i.quantity, 0)} units</span>
      </div>
    </div>
  )
}
