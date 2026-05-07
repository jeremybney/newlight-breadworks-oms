'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService, customersService } from '@/lib/db'
import { useProducts } from '@/lib/useProducts'
import { Order, Customer, OrderItem } from '@/types'
import { format, addDays } from 'date-fns'
import { Search, ChevronDown, ChevronRight, Plus, Minus, Save, Loader2, X, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/lib/auth-context'

const SLICING_OPTIONS = ['', 'Sliced', 'TH Sliced', 'Half Sliced', 'No Slice']

export default function EditOrdersPage() {
  const { appUser } = useAuth()
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Map<string, Customer>>(new Map())
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [editItems, setEditItems] = useState<Record<string, { qty: number; slicing: string }>>({})
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    const unsub = ordersService.subscribeByDate(date, setOrders)
    return unsub
  }, [date])

  useEffect(() => {
    customersService.getAll().then(list => {
      setCustomers(new Map(list.map(c => [c.id, c])))
    })
  }, [])

  const selectOrder = (order: Order) => {
    setSelectedOrder(order)
    // Populate edit state from existing items
    const itemMap: Record<string, { qty: number; slicing: string }> = {}
    order.items.forEach(item => {
      itemMap[item.productId] = { qty: item.quantity, slicing: item.slicing || '' }
    })
    setEditItems(itemMap)
    // Expand categories that have items
    const cats = new Set(order.items.map(i => {
      const p = products.find(p => p.id === i.productId)
      return p?.category || ''
    }).filter(Boolean))
    setExpandedCategories(cats)
  }

  const setQty = (productId: string, qty: number) => {
    setEditItems(prev => {
      const slicing = prev[productId]?.slicing || ''
      if (qty <= 0) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return { ...prev, [productId]: { qty, slicing } }
    })
  }

  const setSlicing = (productId: string, slicing: string) => {
    setEditItems(prev => ({
      ...prev,
      [productId]: { qty: prev[productId]?.qty || 0, slicing }
    }))
  }

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const handleSave = async () => {
    if (!selectedOrder) return
    setSaving(true)
    try {
      const customer = customers.get(selectedOrder.customerId)
      const updatedItems: OrderItem[] = Object.entries(editItems)
        .filter(([_, v]) => v.qty > 0)
        .map(([productId, { qty, slicing }]) => {
          const product = products.find(p => p.id === productId)!
          const unitPrice = customer?.pricing?.[productId] || selectedOrder.items.find(i => i.productId === productId)?.unitPrice || 0
          return {
            productId,
            productName: product.name,
            category: product.category,
            quantity: qty,
            unitPrice,
            slicing,
          }
        })

      const totalAmount = updatedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

      await ordersService.update(selectedOrder.id, {
        items: updatedItems,
        totalAmount,
      })

      toast.success('Order updated successfully')
      setSelectedOrder(null)
      setEditItems({})
    } catch {
      toast.error('Failed to update order')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    if (!selectedOrder) return
    try {
      await ordersService.cancel(selectedOrder.id)
      toast.success('Order cancelled')
      setSelectedOrder(null)
      setEditItems({})
      setShowCancelConfirm(false)
    } catch {
      toast.error('Failed to cancel order')
    }
  }

  const filteredOrders = orders.filter(o =>
    o.customerName.toLowerCase().includes(customerSearch.toLowerCase())
  )

  const activeOrders = filteredOrders.filter(o => o.status !== 'cancelled')
  const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled')

  const editItemCount = Object.values(editItems).filter(v => v.qty > 0).length
  const editTotal = Object.entries(editItems)
    .filter(([_, v]) => v.qty > 0)
    .reduce((s, [pid, { qty }]) => {
      const unitPrice = customers.get(selectedOrder?.customerId || '')?.pricing?.[pid] ||
        selectedOrder?.items.find(i => i.productId === pid)?.unitPrice || 0
      return s + qty * unitPrice
    }, 0)

  const { products, categories, productsByCategory } = useProducts()

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-4rem)] gap-0 -m-8 p-0">

        {/* LEFT — Order List */}
        <div className="w-72 bg-cream-50 border-r border-wheat-400/20 flex flex-col h-full flex-shrink-0">
          <div className="p-4 border-b border-wheat-400/20">
            <h2 className="font-display text-lg text-bark-900 mb-3">Edit Orders</h2>
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); setSelectedOrder(null) }}
              className="input mb-2"
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-wheat-400" />
              <input
                type="text"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search customer..."
                className="input pl-8 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeOrders.length === 0 && (
              <div className="p-4 text-center text-bark-800/40 text-sm">No orders for {date}</div>
            )}

            {activeOrders.map(order => {
              const itemCount = order.items.reduce((s, i) => s + i.quantity, 0)
              const isSelected = selectedOrder?.id === order.id
              return (
                <button key={order.id} onClick={() => selectOrder(order)}
                  className={`w-full text-left px-4 py-3 border-b border-wheat-400/10 transition-colors ${
                    isSelected ? 'bg-wheat-500/10 border-l-2 border-l-wheat-500' : 'hover:bg-cream-100'
                  }`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-sage-500 flex-shrink-0" />
                    <span className="font-medium text-sm text-bark-900 truncate">{order.customerName}</span>
                  </div>
                  <div className="text-xs font-mono text-bark-800/50 mt-0.5 pl-5">
                    {order.items.length} products · {itemCount} units · ${order.totalAmount.toFixed(2)}
                  </div>
                  {order.isRecurring && (
                    <div className="text-xs text-wheat-600 font-mono pl-5">↺ recurring</div>
                  )}
                </button>
              )
            })}

            {cancelledOrders.length > 0 && (
              <>
                <div className="px-4 py-2 text-xs font-mono text-bark-800/40 uppercase tracking-wider bg-cream-100 border-y border-wheat-400/20">
                  Cancelled
                </div>
                {cancelledOrders.map(order => (
                  <div key={order.id} className="flex items-center gap-2 px-4 py-3 border-b border-wheat-400/10 opacity-50">
                    <XCircle className="w-3.5 h-3.5 text-ember-400 flex-shrink-0" />
                    <span className="text-sm text-bark-900 line-through truncate">{order.customerName}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* RIGHT — Edit Panel */}
        {selectedOrder ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Edit Header */}
            <div className="px-6 py-4 border-b border-wheat-400/20 bg-cream-50 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-display text-xl text-bark-900">{selectedOrder.customerName}</h2>
                <div className="text-xs font-mono text-bark-800/50 mt-0.5">
                  {date} · {editItemCount} products · {Object.values(editItems).reduce((s, v) => s + v.qty, 0)} units
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right mr-3">
                  <div className="text-xs text-bark-800/50 font-mono">Order Total</div>
                  <div className="font-display text-xl text-bark-900">${editTotal.toFixed(2)}</div>
                </div>
                <button onClick={() => setShowCancelConfirm(true)}
                  className="btn-danger flex items-center gap-1.5 text-sm">
                  <XCircle className="w-4 h-4" /> Cancel Order
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="btn-primary flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </div>

            {/* Product Editor */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl space-y-2">
                {categories.map(cat => {
                  const catProducts = (productsByCategory[cat.id] || []).filter(p => p.active)
                  if (!catProducts.length) return null
                  const isExpanded = expandedCategories.has(cat.id)
                  const catQty = catProducts.reduce((s, p) => s + (editItems[p.id]?.qty || 0), 0)

                  return (
                    <div key={cat.id} className="border border-wheat-400/20 rounded overflow-hidden">
                      <button onClick={() => toggleCategory(cat.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-cream-100 hover:bg-cream-200 transition-colors text-left">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }} />
                        <span className="flex-1 font-display text-sm text-bark-900">{cat.label}</span>
                        {catQty > 0 && <span className="badge badge-wheat">{catQty}</span>}
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-bark-800/40" /> : <ChevronRight className="w-4 h-4 text-bark-800/40" />}
                      </button>

                      {isExpanded && (
                        <div className="bg-white border-t border-wheat-400/20">
                          {catProducts.map(product => {
                            const qty = editItems[product.id]?.qty || 0
                            const slicing = editItems[product.id]?.slicing || ''
                            return (
                              <div key={product.id}
                                className={`flex items-center gap-3 px-4 py-2.5 border-b border-wheat-400/10 last:border-0 transition-colors ${qty > 0 ? 'bg-wheat-400/5' : 'hover:bg-cream-50'}`}>
                                <span className="flex-1 text-sm text-bark-900">{product.name}</span>
                                {product.canBeSliced && (
                                  <select value={slicing} onChange={e => setSlicing(product.id, e.target.value)}
                                    className="text-xs font-mono border border-wheat-400/30 rounded px-2 py-1 bg-white w-28 focus:outline-none focus:border-wheat-500">
                                    {SLICING_OPTIONS.map(opt => (
                                      <option key={opt} value={opt}>{opt || '— no slice —'}</option>
                                    ))}
                                  </select>
                                )}
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setQty(product.id, Math.max(0, qty - 1))}
                                    className="w-7 h-7 flex items-center justify-center rounded bg-cream-200 hover:bg-cream-300 transition-colors">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input type="number" value={qty || ''}
                                    onChange={e => setQty(product.id, Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-14 text-center text-sm font-mono border border-wheat-400/30 rounded py-1 bg-white focus:outline-none focus:border-wheat-500"
                                    min="0" placeholder="0" />
                                  <button onClick={() => setQty(product.id, qty + 1)}
                                    className="w-7 h-7 flex items-center justify-center rounded bg-cream-200 hover:bg-cream-300 transition-colors">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-bark-800/40">
            <div className="text-center">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-display text-lg">Select an order to edit</p>
              <p className="text-sm mt-1">Choose a date and click any order on the left</p>
            </div>
          </div>
        )}

        {/* Cancel Confirm Modal */}
        {showCancelConfirm && (
          <div className="fixed inset-0 bg-bark-900/50 flex items-center justify-center z-50">
            <div className="bg-cream-50 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-fade-in">
              <div className="flex items-center gap-3 mb-3">
                <XCircle className="w-6 h-6 text-ember-500" />
                <h3 className="font-display text-lg text-bark-900">Cancel Order?</h3>
              </div>
              <p className="text-sm text-bark-800/70 mb-5">
                This will cancel {selectedOrder?.customerName}'s order for {date}.
                It will be removed from the production sheet but the record is preserved.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowCancelConfirm(false)} className="btn-secondary flex-1">Keep Order</button>
                <button onClick={handleCancel} className="btn-danger flex-1">Yes, Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
