'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService, ordersService, recurringService, sendToZapier } from '@/lib/db'
import { useProducts } from '@/lib/useProducts'
import { DOUGH_CATEGORIES } from '@/types'
import { Customer, OrderItem } from '@/types'
import { format, addDays, addWeeks, addMonths, parseISO, isAfter, getDay, differenceInCalendarDays } from 'date-fns'
import toast from 'react-hot-toast'
import { useAuth } from '@/lib/auth-context'
import {
  Search, ChevronDown, ChevronRight, Plus, Minus,
  Calendar, RefreshCw, X, CheckCircle, Loader2, Fuel, CreditCard
} from 'lucide-react'

const SLICING_OPTIONS = ['', 'Sliced', 'TH Sliced', '1" Sliced', 'No Slice']
const RECURRING_FREQUENCIES = [
  { value: 'daily',    label: 'Every Day' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-Weekly' },
  { value: 'monthly',  label: 'Monthly' },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DOW_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function generateRecurringDates(startDate: string, endDate: string, frequency: string, daysOfWeek: string[]): string[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const dates: string[] = []

  if (frequency === 'daily') {
    let cur = start
    while (!isAfter(cur, end)) {
      dates.push(format(cur, 'yyyy-MM-dd'))
      cur = addDays(cur, 1)
    }
  } else if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 1 : 2
    daysOfWeek.forEach(day => {
      const dow = DOW_INDEX[day]
      let cur = start
      while (getDay(cur) !== dow) cur = addDays(cur, 1)
      while (!isAfter(cur, end)) {
        dates.push(format(cur, 'yyyy-MM-dd'))
        cur = addWeeks(cur, step)
      }
    })
  } else if (frequency === 'monthly') {
    let cur = start
    while (!isAfter(cur, end)) {
      dates.push(format(cur, 'yyyy-MM-dd'))
      cur = addMonths(cur, 1)
    }
  }

  return dates.sort()
}

export default function OrdersPage() {
  const { appUser } = useAuth()
  const { products, categories, productsByCategory } = useProducts()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [items, setItems] = useState<Record<string, { qty: number; slicing: string }>>({})
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringFrequency, setRecurringFrequency] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly'>('weekly')
  const [recurringDays, setRecurringDays] = useState<string[]>([])
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [productSearch, setProductSearch] = useState('')

  // ── Surcharges ──
  const [fuelSurcharge, setFuelSurcharge] = useState(false)
  const [fuelAmount, setFuelAmount] = useState(4.00)
  const [ccSurcharge, setCcSurcharge] = useState(false)
  const [ccPercent, setCcPercent] = useState(3.0)

  useEffect(() => {
    return customersService.subscribeAll(setCustomers)
  }, [])

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) && c.active
  )

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setFuelSurcharge(c.fuelSurchargeDefault ?? false)
    setCustomerSearch(c.name)
    setShowCustomerDropdown(false)
    const newItems: Record<string, { qty: number; slicing: string }> = {}
    Object.entries(c.slicing || {}).forEach(([pid, slicing]) => {
      if (slicing) newItems[pid] = { qty: 0, slicing }
    })
    setItems(newItems)
    const catsWithPrefs = new Set(
      products.filter(p => c.slicing?.[p.id]).map(p => p.category)
    )
    setExpandedCategories(catsWithPrefs)
  }

  const setQty = (productId: string, qty: number) => {
    setItems(prev => {
      const slicing = prev[productId]?.slicing || selectedCustomer?.slicing?.[productId] || ''
      if (qty <= 0) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return { ...prev, [productId]: { qty, slicing } }
    })
  }

  const setSlicing = (productId: string, slicing: string) => {
    setItems(prev => ({
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

  const expandAll = () => setExpandedCategories(new Set(categories.map(c => c.id)))
  const collapseAll = () => setExpandedCategories(new Set())

  const orderItems: OrderItem[] = Object.entries(items)
    .filter(([_, v]) => v.qty > 0)
    .map(([productId, { qty, slicing }]) => {
      const product = products.find(p => p.id === productId)!
      const unitPrice = selectedCustomer?.pricing?.[productId] || 0
      return {
        productId,
        productName: product?.name || productId,
        category: product?.category,
        quantity: qty,
        unitPrice,
        slicing,
      }
    })

  const totalItems = orderItems.reduce((s, i) => s + i.quantity, 0)
  const productSubtotal = orderItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const fuelTotal = fuelSurcharge ? fuelAmount : 0
  const ccTotal = ccSurcharge ? productSubtotal * (ccPercent / 100) : 0
  const totalAmount = productSubtotal + fuelTotal + ccTotal

 const handleSubmit = async () => {
  if (!selectedCustomer) return toast.error('Please select a customer')
  if (orderItems.length === 0) return toast.error('Please add at least one item')
  if (!deliveryDate) return toast.error('Please select a delivery date')
  if (isRecurring) {
    if (recurringFrequency !== 'daily' && recurringDays.length === 0)
      return toast.error('Please select days for recurring order')
    if (!recurringEndDate) return toast.error('Please select an end date for the recurring order')
    if (recurringEndDate < deliveryDate) return toast.error('End date must be after the start date')
    if (differenceInCalendarDays(parseISO(recurringEndDate), parseISO(deliveryDate)) > 90)
      return toast.error('Recurring orders can span a maximum of 90 days')
  }

  setSubmitting(true)
  try {
    const fbItems = orderItems.map(i => ({
      name: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      slicing: i.slicing,
    }))
    if (fuelSurcharge && fuelTotal > 0) {
      fbItems.push({ name: 'Fuel Surcharge', quantity: 1, unitPrice: fuelTotal, slicing: '' })
    }
    if (ccSurcharge && ccTotal > 0) {
      fbItems.push({ name: `Credit Card Surcharge (${ccPercent}%)`, quantity: 1, unitPrice: parseFloat(ccTotal.toFixed(2)), slicing: '' })
    }

    const createOneOrder = async (date: string, scheduleId?: string) => {
      const orderId = await ordersService.create({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        deliveryDate: date,
        items: orderItems,
        status: 'confirmed',
        isRecurring: !!scheduleId,
        ...(scheduleId ? { recurringScheduleId: scheduleId } : {}),
        notes,
        createdBy: appUser?.id || '',
        totalAmount,
      })
      const fbPayload = {
        orderId,
        deliveryDate: date,
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email || '',
        items: fbItems,
      }
      fetch('/api/freshbooks/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbPayload),
      }).then(async r => {
        const d = await r.json()
        if (d.invoiceNumber) toast.success(`Invoice ${d.invoiceNumber} created for ${date}`)
        else if (d.error) toast.error(`FreshBooks (${date}): ${d.error}`)
      }).catch(() => toast.error(`FreshBooks invoice failed for ${date} — check console`))
    }

    if (isRecurring) {
      const scheduleId = await recurringService.create({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        frequency: recurringFrequency,
        daysOfWeek: recurringDays as any,
        items: orderItems,
        startDate: deliveryDate,
        endDate: recurringEndDate,
        active: true,
        createdBy: appUser?.id || '',
      })
      const dates = generateRecurringDates(deliveryDate, recurringEndDate, recurringFrequency, recurringDays)
      for (const date of dates) {
        await createOneOrder(date, scheduleId)
      }
      toast.success(`${dates.length} orders created for ${selectedCustomer.name}, ${deliveryDate} – ${recurringEndDate}`)
    } else {
      await createOneOrder(deliveryDate)
      toast.success(`Order placed for ${selectedCustomer.name}`)
    }

    setSelectedCustomer(null)
    setCustomerSearch('')
    setItems({})
    setNotes('')
    setIsRecurring(false)
    setRecurringDays([])
    setRecurringEndDate('')
    setFuelSurcharge(false)
    setCcSurcharge(false)
  } catch (err) {
    toast.error('Failed to submit order. Please try again.')
  } finally {
    setSubmitting(false)
  }
}
   
  const filteredProducts = productSearch
    ? products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : null

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="section-header">New Order</h1>
            <p className="text-bark-800/60 text-sm">Enter customer order details below</p>
          </div>
          {totalItems > 0 && (
            <div className="card px-5 py-3 text-right animate-fade-in">
              <div className="text-xs text-bark-800/60 font-mono mb-0.5">{totalItems} items</div>
              <div className="font-display text-2xl text-bark-900">${totalAmount.toFixed(2)}</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* LEFT — Customer + Settings */}
          <div className="col-span-1 space-y-4">
            <div className="card p-5">
              <h3 className="font-display text-base text-bark-900 mb-3">Customer</h3>
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wheat-400" />
                  <input type="text" value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); if (!e.target.value) setSelectedCustomer(null) }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Search customers..." className="input pl-9" />
                  {customerSearch && (
                    <button onClick={() => { setCustomerSearch(''); setSelectedCustomer(null); setItems({}) }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-wheat-400 hover:text-bark-800">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-wheat-400/30 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button key={c.id} onClick={() => handleSelectCustomer(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-cream-100 text-sm font-body text-bark-900 transition-colors border-b border-wheat-400/10 last:border-0">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-bark-800/50 font-mono">{c.route} · {c.packagingType}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedCustomer && (
                <div className="mt-3 pt-3 border-t border-wheat-400/20 space-y-1.5 animate-fade-in">
                  {[['Route', selectedCustomer.route], ['Distributor', selectedCustomer.distributor], ['Code', selectedCustomer.code], ['Packaging', selectedCustomer.packagingType]].map(([label, val]) => val ? (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-bark-800/60">{label}</span>
                      <span className="font-mono font-semibold">{val}</span>
                    </div>
                  ) : null)}
                  {selectedCustomer.address && <div className="text-xs text-bark-800/60 mt-1 pt-1 border-t border-wheat-400/20">{selectedCustomer.address}</div>}
                </div>
              )}
            </div>

            <div className="card p-5">
              <h3 className="font-display text-base text-bark-900 mb-3">Delivery Date</h3>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wheat-400 pointer-events-none" />
                <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="input pl-9" />
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-display text-base text-bark-900 mb-3">Surcharges</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-bark-800/50" />
                    <span className="text-sm text-bark-900">Fuel Surcharge</span>
                  </div>
                  <button onClick={() => setFuelSurcharge(!fuelSurcharge)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fuelSurcharge ? 'bg-wheat-500' : 'bg-cream-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${fuelSurcharge ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {fuelSurcharge && (
                  <div className="flex items-center gap-2 pl-6 animate-fade-in">
                    <span className="text-xs text-bark-800/60 whitespace-nowrap">Amount ($)</span>
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-bark-800/50">$</span>
                      <input type="number" value={fuelAmount}
                        onChange={e => setFuelAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                        step="0.50" min="0" className="input pl-5 py-1 text-sm w-full" />
                    </div>
                  </div>
                )}
                <div className="border-t border-wheat-400/10" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-bark-800/50" />
                    <span className="text-sm text-bark-900">Credit Card Surcharge</span>
                  </div>
                  <button onClick={() => setCcSurcharge(!ccSurcharge)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ccSurcharge ? 'bg-wheat-500' : 'bg-cream-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${ccSurcharge ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {ccSurcharge && (
                  <div className="flex items-center gap-2 pl-6 animate-fade-in">
                    <span className="text-xs text-bark-800/60 whitespace-nowrap">Rate (%)</span>
                    <div className="relative flex-1">
                      <input type="number" value={ccPercent}
                        onChange={e => setCcPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                        step="0.5" min="0" className="input py-1 text-sm w-full pr-5" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-bark-800/50">%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base text-bark-900">Recurring</h3>
                <button onClick={() => setIsRecurring(!isRecurring)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isRecurring ? 'bg-wheat-500' : 'bg-cream-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${isRecurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {isRecurring && (
                <div className="space-y-3 animate-fade-in">
                  <div>
                    <label className="label">Frequency</label>
                    <select value={recurringFrequency} onChange={e => setRecurringFrequency(e.target.value as any)} className="input">
                      {RECURRING_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  {(recurringFrequency === 'weekly' || recurringFrequency === 'biweekly') && (
                    <div>
                      <label className="label">Days</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {DAYS.map(day => (
                          <button key={day} onClick={() => setRecurringDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${recurringDays.includes(day) ? 'bg-wheat-500 text-cream-50' : 'bg-cream-200 text-bark-800 hover:bg-cream-300'}`}>
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
  <label className="label">End Date</label>
  <input type="date" value={recurringEndDate} onChange={e => setRecurringEndDate(e.target.value)} className="input" min={deliveryDate} />
</div>
<div className="flex items-center gap-1.5 text-xs text-wheat-600 bg-wheat-400/10 rounded p-2">
  <RefreshCw className="w-3 h-3" />
  {deliveryDate}{recurringEndDate ? ` – ${recurringEndDate}` : ''} · Max 90 days · Creates one order per date, invoiced immediately
</div>
                </div>
              )}
            </div>

            <div className="card p-5">
              <h3 className="font-display text-base text-bark-900 mb-3">Notes</h3>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input resize-none h-20" placeholder="Any special instructions..." />
            </div>

            <button onClick={handleSubmit} disabled={submitting || !selectedCustomer || orderItems.length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><CheckCircle className="w-4 h-4" /> {isRecurring ? 'Set Up Recurring Order' : 'Submit Order'}</>}
            </button>
          </div>

          {/* RIGHT — Products */}
          <div className="col-span-2">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base text-bark-900">Products</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-wheat-400" />
                    <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                      placeholder="Search products..." className="input pl-8 py-1.5 text-xs w-44" />
                  </div>
                  <button onClick={expandAll} className="btn-ghost text-xs py-1.5">Expand All</button>
                  <button onClick={collapseAll} className="btn-ghost text-xs py-1.5">Collapse</button>
                </div>
              </div>

              {filteredProducts ? (
                <div className="space-y-1">
                  {filteredProducts.map(product => (
                    <ProductRow key={product.id} product={product}
                      qty={items[product.id]?.qty || 0}
                      slicing={items[product.id]?.slicing || selectedCustomer?.slicing?.[product.id] || ''}
                      onQtyChange={(q) => setQty(product.id, q)}
                      onSlicingChange={(s) => setSlicing(product.id, s)}
                      price={selectedCustomer?.pricing?.[product.id]} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {categories.map(cat => {
                    const catProducts = (productsByCategory[cat.id] || [])
                    if (!catProducts.length) return null
                    const isExpanded = expandedCategories.has(cat.id)
                    const catTotal = catProducts.reduce((s, p) => s + (items[p.id]?.qty || 0), 0)
                    return (
                      <div key={cat.id} className="border border-wheat-400/20 rounded overflow-hidden">
                        <button onClick={() => toggleCategory(cat.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-cream-100 hover:bg-cream-200 transition-colors text-left">
                          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="flex-1 font-display text-sm text-bark-900">{cat.label}</span>
                          <span className="text-xs font-mono text-bark-800/50">{catProducts.length} products</span>
                          {catTotal > 0 && <span className="badge badge-wheat">{catTotal}</span>}
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-bark-800/40" /> : <ChevronRight className="w-4 h-4 text-bark-800/40" />}
                        </button>
                        {isExpanded && (
                          <div className="bg-white border-t border-wheat-400/20">
                            {catProducts.map(product => (
                              <ProductRow key={product.id} product={product}
                                qty={items[product.id]?.qty || 0}
                                slicing={items[product.id]?.slicing || selectedCustomer?.slicing?.[product.id] || ''}
                                onQtyChange={(q) => setQty(product.id, q)}
                                onSlicingChange={(s) => setSlicing(product.id, s)}
                                price={selectedCustomer?.pricing?.[product.id]} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {orderItems.length > 0 && (
              <div className="card p-5 mt-4 animate-fade-in">
                <h3 className="font-display text-base text-bark-900 mb-3">Order Summary</h3>
                <div className="space-y-1.5">
                  {orderItems.map(item => (
                    <div key={item.productId} className="flex items-center justify-between text-sm py-1 border-b border-wheat-400/10 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-wheat-600 w-6 text-right">{item.quantity}×</span>
                        <span className="text-bark-900">{item.productName}</span>
                        {item.slicing && <span className="badge badge-sage text-xs">{item.slicing}</span>}
                      </div>
                      <span className="font-mono text-bark-800/70">${(item.quantity * item.unitPrice).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                  {/* Surcharge line items */}
                  {fuelSurcharge && fuelTotal > 0 && (
                    <div className="flex items-center justify-between text-sm py-1 border-b border-wheat-400/10">
                      <div className="flex items-center gap-2">
                        <Fuel className="w-3 h-3 text-amber-500" />
                        <span className="text-bark-900">Fuel Surcharge</span>
                      </div>
                      <span className="font-mono text-bark-800/70">+${fuelTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {ccSurcharge && ccTotal > 0 && (
                    <div className="flex items-center justify-between text-sm py-1 border-b border-wheat-400/10">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-3 h-3 text-blue-500" />
                        <span className="text-bark-900">CC Surcharge ({ccPercent}%)</span>
                      </div>
                      <span className="font-mono text-bark-800/70">+${ccTotal.toFixed(2)}</span>
                    </div>
                  )}

                <div className="mt-3 pt-3 border-t border-wheat-400/20 space-y-1">
                  {(fuelSurcharge || ccSurcharge) && (
                    <div className="flex justify-between items-center text-sm text-bark-800/60">
                      <span>Subtotal</span>
                      <span className="font-mono">${productSubtotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-bark-900">Total</span>
                    <span className="font-display text-xl text-bark-900">${totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function ProductRow({ product, qty, slicing, onQtyChange, onSlicingChange, price }: {
  product: { id: string; name: string; canBeSliced: boolean }
  qty: number; slicing: string
  onQtyChange: (q: number) => void
  onSlicingChange: (s: string) => void
  price?: number
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-wheat-400/10 last:border-0 transition-colors ${qty > 0 ? 'bg-wheat-400/5' : 'hover:bg-cream-50'}`}>
      <span className="flex-1 text-sm text-bark-900 font-body">{product.name}</span>
      {price !== undefined && <span className="text-xs font-mono text-bark-800/40 w-12 text-right">${price.toFixed(2)}</span>}
      {product.canBeSliced && (
        <select value={slicing} onChange={e => onSlicingChange(e.target.value)}
          className="text-xs font-mono border border-wheat-400/30 rounded px-2 py-1 bg-white text-bark-900 focus:outline-none focus:border-wheat-500 w-28">
          {SLICING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt || '— no slice —'}</option>)}
        </select>
      )}
      <div className="flex items-center gap-1">
        <button onClick={() => onQtyChange(Math.max(0, qty - 1))}
          className="w-7 h-7 flex items-center justify-center rounded bg-cream-200 hover:bg-cream-300 text-bark-800 transition-colors">
          <Minus className="w-3 h-3" />
        </button>
        <input type="number" value={qty || ''} onChange={e => onQtyChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-14 text-center text-sm font-mono border border-wheat-400/30 rounded py-1 bg-white focus:outline-none focus:border-wheat-500"
          min="0" placeholder="0" />
        <button onClick={() => onQtyChange(qty + 1)}
          className="w-7 h-7 flex items-center justify-center rounded bg-cream-200 hover:bg-cream-300 text-bark-800 transition-colors">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
