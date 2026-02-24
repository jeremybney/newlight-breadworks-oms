'use client'
import { useState, useEffect, Suspense } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService } from '@/lib/db'
import { useProducts } from '@/lib/useProducts'
import { Customer, CustomerType } from '@/types'
import {
  Plus, Search, Trash2, ChevronDown, ChevronRight,
  Save, X, Loader2, Users, DollarSign, Settings, Link2, CheckCircle2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'next/navigation'

type Tab = 'customers' | 'pricing' | 'slicing'
const CUSTOMER_TYPES: CustomerType[] = ['Wholesale', 'Rustic Retail', 'Farmers Market']
const SLICING_OPTIONS = ['', 'Sliced', 'TH Sliced', 'Half Sliced', 'No Slice']

const emptyCustomer = (): Omit<Customer, 'id' | 'createdAt'> => ({
  name: '', type: 'Wholesale', route: '', code: '', address: '',
  deliveryInfo: '', callNumber: '', packagingType: 'ALLNP',
  email: '', phone: '', notes: '', active: true,
  pricing: {}, slicing: {},
})

function AdminPageInner() {
  const searchParams = useSearchParams()
  const freshbooksStatus = searchParams.get('freshbooks')
  const { products, categories } = useProducts()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [fbConnected, setFbConnected] = useState<boolean | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [editData, setEditData] = useState<Partial<Customer>>({})
  const [tab, setTab] = useState<Tab>('customers')
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => { return customersService.subscribeAll(setCustomers) }, [])

  useEffect(() => {
    if (freshbooksStatus === 'connected') toast.success('FreshBooks connected successfully!')
    if (freshbooksStatus === 'error') toast.error('FreshBooks connection failed. Please try again.')
    // Check if tokens exist
    fetch('/api/freshbooks/status').then(r => r.json()).then(d => setFbConnected(d.connected)).catch(() => setFbConnected(false))
  }, [freshbooksStatus])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.route || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.code || '').toLowerCase().includes(search.toLowerCase())
  )

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setEditData({ ...c })
    setIsCreating(false)
    setTab('customers')
  }

  const startCreate = () => {
    setSelectedCustomer(null)
    setEditData(emptyCustomer())
    setIsCreating(true)
    setTab('customers')
  }

  const handleSave = async () => {
    if (!editData.name) return toast.error('Customer name is required')
    setSaving(true)
    try {
      if (isCreating) {
        await customersService.create(editData as any)
        toast.success('Customer created')
        setIsCreating(false)
      } else if (selectedCustomer) {
        await customersService.update(selectedCustomer.id, editData)
        toast.success('Customer updated')
      }
    } catch { toast.error('Failed to save customer') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selectedCustomer) return
    try {
      await customersService.update(selectedCustomer.id, { active: false })
      toast.success('Customer deactivated')
      setSelectedCustomer(null)
      setShowDeleteConfirm(false)
    } catch { toast.error('Failed to deactivate') }
  }

  const setPrice = (productId: string, price: string) => {
    setEditData(prev => ({ ...prev, pricing: { ...prev.pricing, [productId]: parseFloat(price) || 0 } }))
  }

  const setSlicing = (productId: string, slicing: string) => {
    setEditData(prev => ({ ...prev, slicing: { ...prev.slicing, [productId]: slicing } }))
  }

  const toggleCat = (key: string) => {
    setExpandedCats(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  // Group products by category using live Firestore data
  const productsByCategory = products.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, typeof products>)

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-4rem)] -m-8">
        {/* FreshBooks Connection Banner */}
        <div className={`flex items-center justify-between px-6 py-3 border-b ${fbConnected ? 'bg-sage-400/10 border-sage-400/30' : 'bg-wheat-400/10 border-wheat-400/20'}`}>
          <div className="flex items-center gap-3">
            {fbConnected
              ? <CheckCircle2 className="w-4 h-4 text-sage-500" />
              : <Link2 className="w-4 h-4 text-wheat-500" />}
            <span className="text-sm text-bark-900">
              FreshBooks {fbConnected ? <strong>Connected</strong> : 'Not Connected'} —{' '}
              <span className="text-bark-800/60 text-xs">
                {fbConnected ? 'Invoices auto-created on every order' : 'Connect to auto-create invoices on every order'}
              </span>
            </span>
          </div>
          <a href="/api/freshbooks/auth"
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${fbConnected ? 'btn-secondary' : 'btn-primary'}`}>
            {fbConnected ? 'Reconnect' : 'Connect FreshBooks'}
          </a>
        </div>
        <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Customer List */}
        <div className="w-72 bg-cream-50 border-r border-wheat-400/20 flex flex-col h-full flex-shrink-0">
          <div className="p-4 border-b border-wheat-400/20">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg text-bark-900">Customers</h2>
              <button onClick={startCreate} className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1">
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-wheat-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..." className="input pl-8 py-1.5 text-xs" />
            </div>
            <div className="text-xs text-bark-800/50 font-mono mt-1.5">{filtered.length} customers</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.id} onClick={() => selectCustomer(c)}
                className={`w-full text-left px-4 py-3 border-b border-wheat-400/10 transition-colors ${selectedCustomer?.id === c.id ? 'bg-wheat-500/10 border-l-2 border-l-wheat-500' : 'hover:bg-cream-100'}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm text-bark-900 truncate flex-1 mr-2">{c.name}</div>
                  {!c.active && <span className="badge badge-ember text-[10px]">Inactive</span>}
                </div>
                <div className="text-xs font-mono text-bark-800/50 mt-0.5">
                  {c.route && <span className="mr-2">📍{c.route}</span>}{c.type}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — Edit Panel */}
        {(selectedCustomer || isCreating) ? (
          <div className="flex-1 flex flex-col overflow-hidden p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xl text-bark-900">{isCreating ? 'New Customer' : editData.name}</h2>
              <div className="flex items-center gap-2">
                {!isCreating && (
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="btn-ghost text-ember-500 hover:text-ember-600 flex items-center gap-1.5 text-sm">
                    <Trash2 className="w-3.5 h-3.5" /> Deactivate
                  </button>
                )}
                <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-wheat-400/20 mb-5">
              {[{ id: 'customers' as Tab, label: 'Details', icon: Users },
                { id: 'pricing' as Tab, label: 'Pricing', icon: DollarSign },
                { id: 'slicing' as Tab, label: 'Slicing', icon: Settings }].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-body border-b-2 transition-colors ${tab === id ? 'border-wheat-500 text-wheat-700 font-semibold' : 'border-transparent text-bark-800/60 hover:text-bark-900'}`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* DETAILS TAB */}
              {tab === 'customers' && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-w-2xl animate-fade-in">
                  <div className="col-span-2">
                    <label className="label">Customer Name *</label>
                    <input className="input" value={editData.name || ''} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Type</label>
                    <select className="input" value={editData.type || 'Wholesale'} onChange={e => setEditData(p => ({ ...p, type: e.target.value as CustomerType }))}>
                      {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Route</label><input className="input" value={editData.route || ''} onChange={e => setEditData(p => ({ ...p, route: e.target.value }))} placeholder="e.g. B2, ND1" /></div>
                  <div><label className="label">Code</label><input className="input font-mono" value={editData.code || ''} onChange={e => setEditData(p => ({ ...p, code: e.target.value }))} /></div>
                  <div><label className="label">Packaging Type</label><input className="input font-mono" value={editData.packagingType || ''} onChange={e => setEditData(p => ({ ...p, packagingType: e.target.value }))} placeholder="e.g. ALLNP, CTS" /></div>
                  <div><label className="label">Delivery Info</label><input className="input" value={editData.deliveryInfo || ''} onChange={e => setEditData(p => ({ ...p, deliveryInfo: e.target.value }))} /></div>
                  <div><label className="label">Call Number</label><input className="input font-mono" value={editData.callNumber || ''} onChange={e => setEditData(p => ({ ...p, callNumber: e.target.value }))} /></div>
                  <div><label className="label">Email</label><input className="input" type="email" value={editData.email || ''} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><label className="label">Phone</label><input className="input" value={editData.phone || ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} /></div>
                  <div className="col-span-2"><label className="label">Address / Delivery Notes</label><input className="input" value={editData.address || ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))} /></div>
                  <div className="col-span-2"><label className="label">Internal Notes</label><textarea className="input resize-none h-16" value={editData.notes || ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} /></div>
                  <div className="col-span-2 flex items-center gap-3">
                    <button onClick={() => setEditData(p => ({ ...p, active: !p.active }))}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editData.active ? 'bg-sage-500' : 'bg-cream-300'}`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${editData.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <span className="text-sm text-bark-800/70">Customer is {editData.active ? 'active' : 'inactive'}</span>
                  </div>
                </div>
              )}

              {/* PRICING TAB — reads from live Firestore products */}
              {tab === 'pricing' && (
                <div className="animate-fade-in max-w-2xl">
                  <p className="text-sm text-bark-800/60 mb-4">Set per-product prices for {editData.name}.</p>
                  {categories.map(cat => {
                    const catProducts = (productsByCategory[cat.id] || [])
                    if (!catProducts.length) return null
                    const isExp = expandedCats.has(cat.id)
                    const pricedCount = catProducts.filter(p => (editData.pricing?.[p.id] || 0) > 0).length
                    return (
                      <div key={cat.id} className="border border-wheat-400/20 rounded mb-2 overflow-hidden">
                        <button onClick={() => toggleCat(cat.id)} className="w-full flex items-center gap-3 px-4 py-2.5 bg-cream-100 hover:bg-cream-200 transition-colors text-left">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                          <span className="flex-1 font-display text-sm">{cat.label}</span>
                          {pricedCount > 0 && <span className="badge badge-sage">{pricedCount} priced</span>}
                          {isExp ? <ChevronDown className="w-4 h-4 text-bark-800/40" /> : <ChevronRight className="w-4 h-4 text-bark-800/40" />}
                        </button>
                        {isExp && (
                          <div className="bg-white border-t border-wheat-400/20">
                            {catProducts.map(p => (
                              <div key={p.id} className="flex items-center gap-3 px-4 py-2 border-b border-wheat-400/10 last:border-0">
                                <span className="flex-1 text-sm text-bark-900">{p.name}</span>
                                <div className="relative w-28">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bark-800/40 text-sm">$</span>
                                  <input type="number" step="0.01" min="0"
                                    value={editData.pricing?.[p.id] || ''}
                                    onChange={e => setPrice(p.id, e.target.value)}
                                    className="input pl-6 py-1 font-mono text-sm" placeholder="0.00" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* SLICING TAB — reads from live Firestore products */}
              {tab === 'slicing' && (
                <div className="animate-fade-in max-w-2xl">
                  <p className="text-sm text-bark-800/60 mb-4">Set default slicing preferences for {editData.name}.</p>
                  {categories.map(cat => {
                    const catProducts = (productsByCategory[cat.id] || []).filter(p => p.canBeSliced)
                    if (!catProducts.length) return null
                    const isExp = expandedCats.has(`slicing-${cat.id}`)
                    const slicedCount = catProducts.filter(p => editData.slicing?.[p.id]).length
                    return (
                      <div key={cat.id} className="border border-wheat-400/20 rounded mb-2 overflow-hidden">
                        <button onClick={() => toggleCat(`slicing-${cat.id}`)} className="w-full flex items-center gap-3 px-4 py-2.5 bg-cream-100 hover:bg-cream-200 transition-colors text-left">
                          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                          <span className="flex-1 font-display text-sm">{cat.label}</span>
                          {slicedCount > 0 && <span className="badge badge-sage">{slicedCount} set</span>}
                          {isExp ? <ChevronDown className="w-4 h-4 text-bark-800/40" /> : <ChevronRight className="w-4 h-4 text-bark-800/40" />}
                        </button>
                        {isExp && (
                          <div className="bg-white border-t border-wheat-400/20">
                            {catProducts.map(p => (
                              <div key={p.id} className="flex items-center gap-3 px-4 py-2 border-b border-wheat-400/10 last:border-0">
                                <span className="flex-1 text-sm text-bark-900">{p.name}</span>
                                <select value={editData.slicing?.[p.id] || ''}
                                  onChange={e => setSlicing(p.id, e.target.value)}
                                  className="text-xs font-mono border border-wheat-400/30 rounded px-2 py-1 bg-white focus:outline-none focus:border-wheat-500 w-32">
                                  {SLICING_OPTIONS.map(opt => <option key={opt} value={opt}>{opt || '— no slice —'}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {showDeleteConfirm && (
              <div className="fixed inset-0 bg-bark-900/50 flex items-center justify-center z-50">
                <div className="bg-cream-50 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                  <h3 className="font-display text-lg text-bark-900 mb-2">Deactivate Customer?</h3>
                  <p className="text-sm text-bark-800/70 mb-5">{editData.name} will be hidden but historical orders are preserved.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary flex-1">Cancel</button>
                    <button onClick={handleDelete} className="btn-danger flex-1">Deactivate</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center text-bark-800/40">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-display text-lg">Select a customer to edit</p>
              <button onClick={startCreate} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> New Customer
              </button>
            </div>
          </div>
        )}
      </div>
        </div>
      </div>
    </AppShell>
  )
}


export default function AdminPage() {
  return (
    <Suspense fallback={<div />}>
      <AdminPageInner />
    </Suspense>
  )
}