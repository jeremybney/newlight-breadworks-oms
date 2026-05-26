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
const SLICING_OPTIONS = ['', 'Sliced', 'TH Sliced', '1" Sliced', 'No Slice']

const emptyCustomer = (): Omit<Customer, 'id' | 'createdAt'> => ({
  name: '', type: 'Wholesale', route: '', code: '', address: '',
  deliveryInfo: '', callNumber: '', packagingType: '', distributor: '',
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
    fetch('/api/freshbooks/status')
      .then(r => r.json())
      .then(d => setFbConnected(d.connected))
      .catch(() => setFbConnected(false))
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

  const productsByCategory = products.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, typeof products>)

  return (
    <AppShell>
      {/* FreshBooks Banner */}
      <div className={`flex items-center justify-between px-6 py-2.5 -mx-8 -mt-8 mb-0 border-b text-sm ${fbConnected ? 'bg-sage-400/10 border-sage-400/30' : 'bg-wheat-400/10 border-wheat-400/20'}`}>
        <div className="flex items-center gap-2">
          {fbConnected
            ? <CheckCircle2 className="w-4 h-4 text-sage-500" />
            : <Link2 className="w-4 h-4 text-wheat-500" />}
          <span className="text-bark-900 font-medium">
            FreshBooks {fbConnected ? 'Connected' : 'Not Connected'}
          </span>
          <span className="text-bark-800/50 text-xs">
            {fbConnected ? '— Invoices auto-created on every order' : '— Connect to auto-create invoices'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ApplySlicingButton />
          <a href="/api/freshbooks/auth"
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${fbConnected ? 'btn-secondary' : 'btn-primary'}`}>
            {fbConnected ? 'Reconnect' : 'Connect FreshBooks'}
          </a>
        </div>
      </div>

      <div className="flex h-[calc(100vh-4rem)] gap-0 -mx-8 -mb-8 mt-0">
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
                  <div className="text-[10px] font-mono text-bark-800/40 flex-shrink-0">{c.code}</div>
                </div>
                <div className="text-xs text-bark-800/50 mt-0.5">{c.route || c.type}</div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT — Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {(selectedCustomer || isCreating) ? (
            <>
              {/* Tabs */}
              <div className="flex border-b border-wheat-400/20 bg-white px-6 pt-4 gap-1">
                {([
                  { key: 'customers', label: 'Details', icon: Users },
                  { key: 'pricing',   label: 'Pricing',  icon: DollarSign },
                  { key: 'slicing',   label: 'Slicing',  icon: Settings },
                ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === key ? 'border-wheat-500 text-wheat-700' : 'border-transparent text-bark-800/50 hover:text-bark-800'}`}>
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2 pb-2">
                  {!isCreating && (
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="text-ember-400 hover:text-ember-600 p-1.5 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={handleSave} disabled={saving}
                    className="btn-primary flex items-center gap-2 py-1.5 px-4 text-sm">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isCreating ? 'Create' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* DETAILS TAB */}
                {tab === 'customers' && (
                  <div className="grid grid-cols-2 gap-4 max-w-2xl">
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
                    <div>
                      <label className="label">Route</label>
                      <input className="input" value={editData.route || ''} onChange={e => setEditData(p => ({ ...p, route: e.target.value }))} />
                     <div>
                       <label className="label">Distributor</label>
                       <input className="input" value={editData.distributor || ''} onChange={e => setEditData(p => ({ ...p, distributor: e.target.value }))} />
                     </div>
                     <div>
                       <label className="label">Packaging Type</label>
                       <input className="input" value={editData.packagingType || ''} onChange={e => setEditData(p => ({ ...p, packagingType: e.target.value }))} />
                     </div>
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input className="input" type="email" value={editData.email || ''} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input className="input" value={editData.phone || ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Address / Delivery Instructions</label>
                      <textarea className="input min-h-[80px]" value={editData.address || ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Notes</label>
                      <textarea className="input min-h-[60px]" value={editData.notes || ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">FreshBooks ID</label>
                      <input className="input" value={editData.freshbooksId || ''} onChange={e => setEditData(p => ({ ...p, freshbooksId: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Invoice Email</label>
                      <input className="input" type="email" value={editData.invoiceEmail || ''} onChange={e => setEditData(p => ({ ...p, invoiceEmail: e.target.value }))} />
                    </div>
                  </div>
                )}

                {/* PRICING TAB */}
                {tab === 'pricing' && (
                  <div className="max-w-2xl space-y-3">
                    <p className="text-sm text-bark-800/60 mb-4">Set per-unit prices for this customer. Leave blank to use default pricing.</p>
                    {categories.map(cat => {
                      const catProducts = productsByCategory[cat.id] || []
                      if (catProducts.length === 0) return null
                      const isExpanded = expandedCats.has(cat.id)
                      return (
                        <div key={cat.id} className="card overflow-hidden">
                          <button onClick={() => toggleCat(cat.id)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 bg-cream-100 text-left">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                            <span className="font-display text-sm text-bark-900 flex-1">{cat.label}</span>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-bark-800/30" /> : <ChevronRight className="w-4 h-4 text-bark-800/30" />}
                          </button>
                          {isExpanded && (
                            <div className="divide-y divide-wheat-400/10">
                              {catProducts.map(p => (
                                <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                                  <span className="flex-1 text-sm text-bark-900">{p.name}</span>
                                  <div className="relative w-24">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bark-800/40 text-sm">$</span>
                                    <input type="number" step="0.01" min="0"
                                      className="input pl-6 py-1 text-sm text-right"
                                      value={editData.pricing?.[p.id] || ''}
                                      onChange={e => setPrice(p.id, e.target.value)}
                                      placeholder="—" />
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

                {/* SLICING TAB */}
                {tab === 'slicing' && (
                  <div className="max-w-2xl space-y-3">
                    <p className="text-sm text-bark-800/60 mb-4">Set default slicing preferences for sliceable products.</p>
                    {categories.map(cat => {
                      const catProducts = (productsByCategory[cat.id] || []).filter(p => p.canBeSliced)
                      if (catProducts.length === 0) return null
                      const isExpanded = expandedCats.has(`slicing-${cat.id}`)
                      return (
                        <div key={cat.id} className="card overflow-hidden">
                          <button onClick={() => toggleCat(`slicing-${cat.id}`)}
                            className="w-full flex items-center gap-2 px-4 py-2.5 bg-cream-100 text-left">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cat.color }} />
                            <span className="font-display text-sm text-bark-900 flex-1">{cat.label}</span>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-bark-800/30" /> : <ChevronRight className="w-4 h-4 text-bark-800/30" />}
                          </button>
                          {isExpanded && (
                            <div className="divide-y divide-wheat-400/10">
                              {catProducts.map(p => (
                                <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                                  <span className="flex-1 text-sm text-bark-900">{p.name}</span>
                                  <select className="input py-1 text-sm w-36"
                                    value={editData.slicing?.[p.id] || ''}
                                    onChange={e => setSlicing(p.id, e.target.value)}>
                                    {SLICING_OPTIONS.map(o => <option key={o} value={o}>{o || '— default —'}</option>)}
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

              {/* Delete Confirm Modal */}
              {showDeleteConfirm && (
                <div className="fixed inset-0 bg-bark-900/40 flex items-center justify-center z-50">
                  <div className="card p-6 max-w-sm w-full mx-4">
                    <h3 className="font-display text-lg mb-2">Deactivate Customer?</h3>
                    <p className="text-sm text-bark-800/70 mb-4">This will hide {selectedCustomer?.name} from new orders. Their order history is preserved.</p>
                    <div className="flex gap-3">
                      <button onClick={handleDelete} className="btn-primary bg-ember-500 hover:bg-ember-600 flex-1">Deactivate</button>
                      <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary flex-1">Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-bark-800/30">
              <Users className="w-16 h-16 mb-4" />
              <p className="font-display text-lg">Select a customer to edit</p>
              <button onClick={startCreate} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> New Customer
              </button>
            </div>
          )}
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

function ApplySlicingButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(null)

  const handleApply = async () => {
    if (status === 'loading') return
    if (!confirm('This will update slicing preferences for all matching customers from the CSV data. Continue?')) return
    setStatus('loading')
    try {
      const r = await fetch('/api/admin/apply-slicing', { method: 'POST' })
      const d = await r.json()
      setResult(d)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 5000)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <button
      onClick={handleApply}
      disabled={status === 'loading'}
      style={{
        fontSize: '12px', padding: '6px 12px', borderRadius: '6px',
        fontWeight: 600, cursor: status === 'loading' ? 'wait' : 'pointer',
        backgroundColor: status === 'done' ? '#16a34a' : status === 'error' ? '#dc2626' : '#4a3728',
        color: '#ffffff', border: 'none',
      }}
    >
      {status === 'loading' && '⏳ Applying...'}
      {status === 'done' && result && `✓ Updated ${result.updated} customers`}
      {status === 'error' && '✗ Error — try again'}
      {status === 'idle' && '✂ Apply Slicing Data'}
    </button>
  )
}
