'use client'
import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { productsService, categoriesService, seedProductsToFirestore, ProductCategory } from '@/lib/products-dynamic'
import { db } from '@/lib/firebase'
import { doc, setDoc } from 'firebase/firestore'
import { useProducts } from '@/lib/useProducts'
import { PRODUCTS as STATIC_PRODUCTS } from '@/lib/products'
import { Product } from '@/types'
import {
  Plus, Save, Loader2, Tag, ChevronDown,
  ChevronRight, ToggleLeft, ToggleRight, Pencil, X, RefreshCw, Scale
} from 'lucide-react'
import toast from 'react-hot-toast'

const COLOR_OPTIONS = [
  '#8B6355','#7A8B55','#D4A574','#E8C547','#A8C5A0',
  '#C4A882','#9B8EA8','#E8D5A3','#A0522D','#F4C842',
  '#D4C5A9','#F5F0E8','#8B7355','#4A3728','#6B8FA3',
  '#C4765A','#7FA88B','#B8A0C8',
]

export default function ProductsAdminPage() {
  const { products, categories, productsByCategory } = useProducts()
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [newProduct, setNewProduct] = useState<Partial<Product> | null>(null)
  const [newCategory, setNewCategory] = useState<Partial<ProductCategory> | null>(null)
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [applyingWeights, setApplyingWeights] = useState(false)
  const [weightEdits, setWeightEdits] = useState<Record<string, string>>({})
  const [showInactive, setShowInactive] = useState(false)

  const handleApplyUnitWeights = async () => {
    setApplyingWeights(true)
    const WEIGHTS_BY_ID: Record<string, number> = {
      'rye-large': 1600, 'rye-retail': 600, 'rye-dinner-roll': 50,
      'mini-deli-rye-roll': 25, 'rye-hoagie': 170, 'light-rye-sandwich': 600,
      'mg-large': 1600, 'mg-retail': 600, 'mg-boule': 900, 'mg-batard': 1400,
      'mg-baguette': 350, 'mg-hoagie': 170, 'mg-burger-bun': 120,
      'mg-dinner-roll': 50, 'mg-mini-roll': 25, 'whole-wheat-hoagie': 240,
      'mb-5in-burger-bun': 100, 'mb-5in-burger-seeded': 100, 'mb-4in-burger-bun': 90,
      'mb-bread-slider-seeded': 30, 'mb-bread-slider': 30,
      'mb-large': 1200, 'mb-retail': 500, 'mb-large-fit-sliced': 1200,
      'mb-large-sliced': 1200, 'mb-mini-loaf-roll': 25,
      'brioche-pullman-retail': 500, 'brioche-pullman-large': 1100,
      'bun-sesame-seeded': 85, 'bun-everything': 85, 'bun-plain': 85,
      'bun-mini-hamburger': 60, 'bun-large-hamburger': 100, 'bun-large-seeded': 100,
      'parker-house-roll': 40, 'parker-house-roll-oeuf': 40,
      'hotdog-bun': 65, 'hotdog-bun-8in': 80, 'hotdog-bun-mini': 40,
      'parker-house-dinner': 55, 'mini-hotdog-bun': 40,
      'croissant': 80, 'plain-croissant': 80, 'chocolate-croissant': 80,
      'portmanteau-sandwich': 120,
      'challah-roll': 45, 'challah-parker-house': 40,
      'challah-burger-bun': 100, 'challah-burger-bun-2': 100,
      'italian-baguette': 230, 'demi-italian-baguette': 150, 'mini-baguette': 75,
      'italian-baguette-24in': 500, 'ciabatta-large': 600, 'ciabatta-small': 75,
      'ciabatta-4in': 135, 'ciabatta-6in': 200, 'ciabatta-medium': 600,
      'ciabatta-large-loaf': 600, 'italian-hoagie-p': 170, 'italian-hoagie-s': 200,
      'italian-slider': 45, 'italian-dinner-roll': 50,
      'italian-burger-bun-reg': 100, 'italian-burger-bun': 120,
      'italian-batard': 1500, 'italian-batard-large': 1500, 'olive-italian-batard': 1500,
      'kaiser-roll': 120, 'kaiser-roll-slider': 60, 'mini-kaiser': 40,
      'sd-baguette-24in': 500, 'sd-focaccia-wholesale': 1800,
      'sd-focaccia-retail': 325, 'sd-focaccia-half': 900,
      'sd-baguette': 235, 'demi-sd-baguette': 150, 'fougasse': 350,
      'sd-pullman-large': 1800, 'sd-dinner-roll': 65,
      'sd-burger-bun': 100, 'mini-sd-roll': 25, 'french-baguette': 230,
      'boule-4in': 150, 'boule-8in': 250,
      'sd-boule-large-orig': 900, 'sd-boule-large-seeded': 900,
      'sd-batard': 900, 'sd-batard-seeded': 900, 'sd-batard-tri-sliced': 900,
      'large-batard': 1500, 'large-batard-sliced': 1500,
      'semolina': 900, 'semolina-hoagie': 170, 'semolina-baguette-24in': 450,
      'semolina-burger-bun': 100, 'mini-semolina-roll': 25,
      'semolina-hoagie-lg': 170, 'semolina-hoagie-seeded': 170,
      'semolina-twist': 120, 'semolina-mini-baguette': 75,
      'pretzel-loop-lg-sliced': 250, 'pretzel-loop-lg-soft': 250,
      'jumbo-pretzel-sliced': 455, 'pretzel-hero-nosalt': 180,
      'pretzel-burger-bun': 140, 'pretzel-parker-house': 45,
      'white-bread-large': 1200,
      'sicilian-pizza': 1000, 'scilian-roll': 300, 'sicilian': 1000, 'white-sandwich': 600,
      'ww-sandwich': 600, 'whole-wheat-sandwich': 600,
    }
    try {
      let updated = 0
      const entries = Object.entries(WEIGHTS_BY_ID)
      for (let i = 0; i < entries.length; i += 10) {
        await Promise.all(
          entries.slice(i, i + 10).map(([id, unitWeight]) =>
            setDoc(doc(db, 'products', id), { unitWeight }, { merge: true }).then(() => updated++)
          )
        )
      }
      toast.success(`✓ Applied unit weights to ${updated} products`)
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`)
    } finally {
      setApplyingWeights(false)
    }
  }

  const handleSaveWeight = async (productId: string) => {
    const raw = weightEdits[productId]
    const grams = raw === '' ? undefined : parseFloat(raw)
    try {
      await productsService.update(productId, { unitWeight: grams })
      setWeightEdits(prev => { const n = { ...prev }; delete n[productId]; return n })
      toast.success('Unit weight saved')
    } catch { toast.error('Failed to save weight') }
  }

  const handleSeedAll = async () => {
    setSeeding(true)
    try {
      await seedProductsToFirestore(STATIC_PRODUCTS)
      toast.success(`All ${STATIC_PRODUCTS.length} products synced to database!`)
    } catch (e) {
      toast.error('Sync failed — check console')
      console.error(e)
    } finally { setSeeding(false) }
  }

  const handleSaveProduct = async () => {
    if (!editingProduct) return
    setSaving(true)
    try {
      await productsService.update(editingProduct.id, editingProduct)
      toast.success('Product updated')
      setEditingProduct(null)
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleCreateProduct = async () => {
    if (!newProduct?.name || !newProduct?.category) return toast.error('Name and category required')
    setSaving(true)
    try {
      const catProducts = productsByCategory[newProduct.category!] || []
      await productsService.create({
        name: newProduct.name!,
        category: newProduct.category! as any,
        canBeSliced: newProduct.canBeSliced || false,
        active: true,
        sortOrder: (catProducts.length + 1) * 10,
      })
      toast.success(`${newProduct.name} added`)
      setNewProduct(null)
    } catch { toast.error('Failed to create product') }
    finally { setSaving(false) }
  }

  const handleCreateCategory = async () => {
    if (!newCategory?.label) return toast.error('Category name required')
    setSaving(true)
    try {
      await categoriesService.create({
        label: newCategory.label!,
        color: newCategory.color || '#8B6355',
        sortOrder: (categories.length + 1) * 10,
        active: true,
      })
      toast.success(`${newCategory.label} category created`)
      setNewCategory(null)
    } catch { toast.error('Failed to create category') }
    finally { setSaving(false) }
  }

  const handleSaveCategory = async () => {
    if (!editingCategory) return
    setSaving(true)
    try {
      await categoriesService.update(editingCategory.id, editingCategory)
      toast.success('Category updated')
      setEditingCategory(null)
    } catch { toast.error('Failed to save category') }
    finally { setSaving(false) }
  }

  const handleToggleProduct = async (p: Product) => {
    try {
      await productsService.update(p.id, { active: !p.active })
      toast.success(p.active ? 'Product deactivated' : 'Product activated')
    } catch { toast.error('Failed to update') }
  }

  const toggleCat = (id: string) => {
    setExpandedCats(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="section-header">Products & Categories</h1>
            <p className="text-bark-800/60 text-sm">Manage your product catalogue and dough categories</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowInactive(v => !v)}
              className="btn-secondary flex items-center gap-2 text-sm">
              {showInactive ? 'Hide Inactive' : 'Show Inactive'}
            </button>
            <button onClick={handleApplyUnitWeights} disabled={applyingWeights}
              className="btn-secondary flex items-center gap-2 text-sm">
              {applyingWeights ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
              Apply Unit Weights
            </button>
            <button onClick={handleSeedAll} disabled={seeding}
              className="btn-secondary flex items-center gap-2 text-sm">
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sync All Products
            </button>
            <button onClick={() => setNewCategory({ label: '', color: '#8B6355' })}
              className="btn-secondary flex items-center gap-2 text-sm">
              <Tag className="w-4 h-4" /> New Category
            </button>
            <button onClick={() => setNewProduct({ canBeSliced: false })}
              className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> New Product
            </button>
          </div>
        </div>

        <div className="bg-wheat-400/10 border border-wheat-400/30 rounded-lg px-4 py-3 mb-5 text-sm text-bark-800/70 flex items-start gap-2">
          <RefreshCw className="w-4 h-4 text-wheat-500 flex-shrink-0 mt-0.5" />
          <span>Click <strong>Sync All Products</strong> to restore all products from the master list. New products you add here will automatically appear in Orders, Pricing, and Slicing.</span>
        </div>

        {newCategory && (
          <div className="card p-5 mb-4 animate-fade-in">
            <h3 className="font-display text-base mb-3 text-bark-900">New Product Category</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">Category Name</label>
                <input className="input" placeholder="e.g. Sourdough, Spelt..."
                  value={newCategory.label || ''}
                  onChange={e => setNewCategory(p => ({ ...p, label: e.target.value }))} />
              </div>
              <div>
                <label className="label">Color</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} onClick={() => setNewCategory(p => ({ ...p, color: c }))}
                      className={`w-6 h-6 rounded-sm transition-transform hover:scale-110 ${newCategory.color === c ? 'ring-2 ring-bark-900 ring-offset-1' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleCreateCategory} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Create Category
              </button>
              <button onClick={() => setNewCategory(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}

        {newProduct && (
          <div className="card p-5 mb-4 animate-fade-in">
            <h3 className="font-display text-base mb-3 text-bark-900">New Product</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Product Name</label>
                <input className="input" placeholder="e.g. Large Rye Batard"
                  value={newProduct.name || ''}
                  onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={newProduct.category || ''}
                  onChange={e => setNewProduct(p => ({ ...p, category: e.target.value as any }))}>
                  <option value="">— select category —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 col-span-2">
                <button onClick={() => setNewProduct(p => ({ ...p, canBeSliced: !p!.canBeSliced }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${newProduct.canBeSliced ? 'bg-wheat-500' : 'bg-cream-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${newProduct.canBeSliced ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-sm text-bark-800/70">This product can be sliced</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleCreateProduct} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Add Product
              </button>
              <button onClick={() => setNewProduct(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {categories.map(cat => {
            const catProducts = (productsByCategory[cat.id] || []).filter(p => showInactive ? true : p.active !== false)
            const isExpanded = expandedCats.has(cat.id)
            const activeCount = (productsByCategory[cat.id] || []).filter(p => p.active !== false).length

            return (
              <div key={cat.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-cream-100">
                  <button onClick={() => toggleCat(cat.id)} className="flex items-center gap-3 flex-1 text-left">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="font-display text-sm text-bark-900">{cat.label}</span>
                    <span className="text-xs font-mono text-bark-800/50">{activeCount} active products</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-bark-800/40 ml-1" /> : <ChevronRight className="w-4 h-4 text-bark-800/40 ml-1" />}
                  </button>
                  <button onClick={() => setEditingCategory({ ...cat })}
                    className="text-bark-800/40 hover:text-bark-800 transition-colors p-1">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setNewProduct({ canBeSliced: false, category: cat.id as any }); setExpandedCats(prev => new Set([...Array.from(prev), cat.id])) }}
                    className="text-wheat-500 hover:text-wheat-600 transition-colors p-1">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {editingCategory?.id === cat.id && (
                  <div className="px-4 py-3 bg-cream-50 border-t border-wheat-400/20 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <input className="input flex-1" value={editingCategory.label}
                        onChange={e => setEditingCategory(p => p ? { ...p, label: e.target.value } : null)} />
                      <div className="flex gap-1">
                        {COLOR_OPTIONS.slice(0, 9).map(c => (
                          <button key={c} onClick={() => setEditingCategory(p => p ? { ...p, color: c } : null)}
                            className={`w-5 h-5 rounded-sm ${editingCategory.color === c ? 'ring-2 ring-bark-900' : ''}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <button onClick={handleSaveCategory} disabled={saving} className="btn-primary py-1.5 px-3 text-xs">Save</button>
                      <button onClick={() => setEditingCategory(null)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="bg-white border-t border-wheat-400/20">
                    <div className="flex items-center gap-3 px-6 py-1.5 bg-cream-50 border-b border-wheat-400/10 text-[10px] font-mono text-bark-800/40 uppercase tracking-wide">
                      <span className="flex-1">Product Name</span>
                      <span className="w-20 text-center">Unit Weight</span>
                      <span className="w-16 text-center">Edit / Toggle</span>
                    </div>
                    {catProducts.length === 0 && (
                      <div className="px-8 py-3 text-sm text-bark-800/40 italic">No products yet — click + to add one</div>
                    )}
                    {catProducts.map(p => (
                      <div key={p.id} className={`flex items-center gap-3 px-6 py-2.5 border-b border-wheat-400/10 last:border-0 ${!p.active ? 'opacity-40' : ''}`}>
                        {editingProduct?.id === p.id ? (
                          <div className="flex items-center gap-2 flex-1 flex-wrap">
                            <input className="input flex-1 py-1 text-sm min-w-[120px]" value={editingProduct.name}
                              onChange={e => setEditingProduct(ep => ep ? { ...ep, name: e.target.value } : null)} />
                            <button onClick={() => setEditingProduct(ep => ep ? { ...ep, canBeSliced: !ep.canBeSliced } : null)}
                              className={`text-xs px-2 py-1 rounded font-mono ${editingProduct.canBeSliced ? 'bg-sage-400/20 text-sage-700' : 'bg-cream-200 text-bark-800/50'}`}>
                              {editingProduct.canBeSliced ? 'sliceable' : 'no slice'}
                            </button>
                            <button onClick={() => setEditingProduct(ep => ep ? { ...ep, isSchripps: !ep.isSchripps, schrippsCode: !ep.isSchripps ? ep.schrippsCode : '' } : null)}
                              className={`text-xs px-2 py-1 rounded font-mono ${editingProduct.isSchripps ? 'bg-amber-100 text-amber-700' : 'bg-cream-200 text-bark-800/50'}`}>
                              {editingProduct.isSchripps ? 'schripps ✓' : 'schripps'}
                            </button>
                            {editingProduct.isSchripps && (
                              <input
                                className="input py-1 text-xs w-28 font-mono"
                                placeholder="Product code"
                                value={editingProduct.schrippsCode || ''}
                                onChange={e => setEditingProduct(ep => ep ? { ...ep, schrippsCode: e.target.value } : null)}
                              />
                            )}
                            <button onClick={handleSaveProduct} disabled={saving} className="btn-primary py-1 px-3 text-xs flex items-center gap-1">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                            </button>
                            <button onClick={() => setEditingProduct(null)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-bark-900">{p.name}</span>
                            {p.canBeSliced && <span className="badge badge-sage text-[10px]">sliceable</span>}
                            {p.isSchripps && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">{p.schrippsCode || 'schripps'}</span>}
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-bark-800/40 font-mono">g/unit</span>
                              <input
                                type="number"
                                min="0"
                                placeholder="—"
                                value={weightEdits[p.id] !== undefined ? weightEdits[p.id] : (p.unitWeight ?? '')}
                                onChange={e => setWeightEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                                onBlur={() => { if (weightEdits[p.id] !== undefined) handleSaveWeight(p.id) }}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveWeight(p.id) }}
                                className="w-20 text-center text-xs font-mono border border-wheat-400/30 rounded px-2 py-1 bg-white focus:outline-none focus:border-wheat-500"
                              />
                            </div>
                            <button onClick={() => setEditingProduct({ ...p })}
                              className="text-bark-800/30 hover:text-bark-800 transition-colors p-1">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleToggleProduct(p)}
                              className="text-bark-800/30 hover:text-bark-800 transition-colors p-1">
                              {p.active !== false
                                ? <ToggleRight className="w-4 h-4 text-sage-500" />
                                : <ToggleLeft className="w-4 h-4" />}
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
