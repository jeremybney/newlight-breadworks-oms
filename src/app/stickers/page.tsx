'use client'
import { useState, useEffect, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService } from '@/lib/db'
import { customersService } from '@/lib/db'
import { Order, Customer, OrderItem } from '@/types'
import { format, addDays } from 'date-fns'
import { Printer, Package } from 'lucide-react'

export default function StickersPage() {
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Map<string, Customer>>(new Map())
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const printRef = useRef<HTMLDivElement>(null)

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
      const map = new Map(list.map(c => [c.id, c]))
      setCustomers(map)
    })
  }, [])

  const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id))

  const handlePrint = () => window.print()

  const toggleOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedOrderIds(new Set(orders.map(o => o.id)))
  const selectNone = () => setSelectedOrderIds(new Set())

  return (
    <AppShell>
      {/* Controls - hidden on print */}
      <div className="no-print max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="section-header">Sticker Generator</h1>
            <p className="text-bark-800/60 text-sm">Generate 3×2" shipping labels for orders</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input w-44"
            />
            <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
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
                <button onClick={selectAll} className="text-xs text-wheat-600 hover:text-wheat-700">All</button>
                <span className="text-bark-800/30">|</span>
                <button onClick={selectNone} className="text-xs text-wheat-600 hover:text-wheat-700">None</button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {orders.map(order => {
                const customer = customers.get(order.customerId)
                const checked = selectedOrderIds.has(order.id)
                return (
                  <label key={order.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded cursor-pointer transition-colors ${checked ? 'bg-wheat-400/15' : 'hover:bg-cream-100'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOrder(order.id)}
                      className="mt-0.5 accent-wheat-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-bark-900 truncate">{order.customerName}</div>
                      <div className="text-xs font-mono text-bark-800/50">
                        {customer?.route} · {order.items.length} items · {order.items.reduce((s,i) => s+i.quantity, 0)} units
                      </div>
                    </div>
                  </label>
                )
              })}
              {orders.length === 0 && (
                <div className="text-center py-8 text-bark-800/40 text-sm">
                  No orders for {date}
                </div>
              )}
            </div>
          </div>

          {/* Sticker Preview */}
          <div className="col-span-2">
            <h3 className="font-display text-base text-bark-900 mb-3 no-print">Preview</h3>
            <div className="flex flex-wrap gap-3">
              {selectedOrders.map(order => {
                const customer = customers.get(order.customerId)
                return (
                  <StickerPreview
                    key={order.id}
                    order={order}
                    customer={customer}
                    date={date}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Print Area - only stickers */}
      <div ref={printRef} className="hidden print:block">
        {selectedOrders.map(order => {
          const customer = customers.get(order.customerId)
          return (
            <StickerPrint
              key={order.id}
              order={order}
              customer={customer}
              date={date}
            />
          )
        })}
      </div>
    </AppShell>
  )
}

// ── STICKER PREVIEW (on-screen) ───────────────────────────────────────────────
function StickerPreview({ order, customer, date }: {
  order: Order; customer?: Customer; date: string
}) {
  return (
    <div className="sticker-print-area border-2 border-dashed border-wheat-400/40 rounded p-2 bg-white text-[9px] font-mono leading-tight overflow-hidden relative"
         style={{ fontFamily: 'monospace' }}>
      <StickerContent order={order} customer={customer} date={date} />
    </div>
  )
}

// ── STICKER PRINT (for actual printing) ──────────────────────────────────────
function StickerPrint({ order, customer, date }: {
  order: Order; customer?: Customer; date: string
}) {
  return (
    <div className="sticker-print-area p-1 text-[8pt] font-mono leading-tight overflow-hidden"
         style={{ fontFamily: 'monospace', pageBreakAfter: 'always' }}>
      <StickerContent order={order} customer={customer} date={date} />
    </div>
  )
}

// ── STICKER CONTENT ───────────────────────────────────────────────────────────
function StickerContent({ order, customer, date }: {
  order: Order; customer?: Customer; date: string
}) {
  const slicedItems = order.items.filter(i => i.slicing && i.slicing !== 'No Slice')
  const regularItems = order.items.filter(i => !i.slicing || i.slicing === 'No Slice')

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-black pb-1 mb-1">
        <div>
          <div className="font-bold text-[10px] leading-tight">{order.customerName}</div>
          {customer?.route && <div>Route: {customer.route}</div>}
        </div>
        <div className="text-right">
          <div className="font-bold">{date}</div>
          {customer?.distributor && <div className="font-bold">{customer.distributor}</div>}
        </div>
      </div>

      {/* Address / delivery notes */}
      {customer?.address && (
        <div className="text-[8px] border-b border-black pb-1 mb-1">
          <span>{customer.address}</span>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-hidden">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between leading-tight">
            <span className="truncate flex-1">{item.productName}</span>
            <span className="ml-1 flex-shrink-0">
              {item.quantity}
              {item.slicing ? ` (${item.slicing})` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Packaging — bottom red lines area */}
      {customer?.packagingType && (
        <div className="border-t-2 border-red-600 mt-0.5 pt-0.5">
          <div className="border-b-2 border-red-600 pb-0.5 text-[8px] font-bold text-center">
            {customer.packagingType}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-black pt-0.5 mt-0.5 flex justify-between text-[8px]">
        <span>Code: {customer?.code || '—'}</span>
        <span>{order.items.reduce((s,i) => s+i.quantity, 0)} units</span>
      </div>
    </div>
  )
}
