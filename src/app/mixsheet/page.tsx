'use client'
import { useState, useEffect, useMemo } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService } from '@/lib/db'
import { useProducts } from '@/lib/useProducts'
import { DoughCategory, Order } from '@/types'
import { format, addDays, parseISO } from 'date-fns'
import { Calendar, Scale, ChevronRight, ChevronDown, RefreshCw, AlertCircle, Pencil, Save, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type MixTab = 'dough' | 'recipes'

interface RecipeIngredient {
  name: string
  pct: number
  note?: string
}

interface Recipe {
  id: string
  label: string
  color: string
  totalPct: number
  ingredients: RecipeIngredient[]
  addIns?: {
    label: string
    sourceCategories: string[]
    ingredients: RecipeIngredient[]
  }[]
}

// ─── Default Recipes ─────────────────────────────────────────────────────────
const DEFAULT_RECIPES: Recipe[] = [
  {
    id: 'rye_multi',
    label: 'Rye & Multigrain',
    color: '#7A8B55',
    totalPct: 243,
    ingredients: [
      { name: 'Sir Lancelot', pct: 60 },
      { name: 'Whole Wheat', pct: 40 },
      { name: 'Levain', pct: 70 },
      { name: 'Water', pct: 45 },
      { name: 'Canola Oil', pct: 8 },
      { name: 'Salt', pct: 3 },
      { name: 'Fresh Yeast', pct: 0.7 },
      { name: 'Honey', pct: 14 },
    ],
    addIns: [
      {
        label: 'Deli-Style Rye',
        sourceCategories: ['RYE'],
        ingredients: [
          { name: 'Caraway', pct: 2.5 },
        ],
      },
      {
        label: 'Multi-Grain',
        sourceCategories: ['MULTIGRAIN', 'WHOLE_WHEAT'],
        ingredients: [
          { name: 'Soaker', pct: 40 },
        ],
      },
    ],
  },
  {
    id: 'milk_bread',
    label: 'Milk Bread / Challah',
    color: '#D4A574',
    totalPct: 238,
    ingredients: [
      { name: 'Sir Galahad', pct: 100 },
      { name: 'Milk', pct: 50 },
      { name: 'Eggs', pct: 8 },
      { name: 'Biga', pct: 35 },
      { name: 'Sugar', pct: 18.5 },
      { name: 'Salt', pct: 3 },
      { name: 'Yeast', pct: 4 },
      { name: 'Butter', pct: 20, note: 'add after mix' },
    ],
  },
  {
    id: 'brioche',
    label: 'Brioche',
    color: '#E8C547',
    totalPct: 204,
    ingredients: [
      { name: 'Sir Galahad', pct: 100 },
      { name: 'Milk', pct: 6 },
      { name: 'Water / Ice', pct: 8 },
      { name: 'Eggs', pct: 35 },
      { name: 'Honey', pct: 10 },
      { name: 'Sugar', pct: 18 },
      { name: 'Yeast', pct: 10 },
      { name: 'Salt', pct: 2.3 },
      { name: 'Butter', pct: 15, note: 'add after mix' },
    ],
  },
  {
    id: 'italian',
    label: 'Italian (Poolish)',
    color: '#A8C5A0',
    totalPct: 266,
    ingredients: [
      { name: 'Sir Lancelot', pct: 93 },
      { name: 'Semolina', pct: 7 },
      { name: 'Poolish', pct: 100 },
      { name: 'Water', pct: 51 },
      { name: 'Olive Oil', pct: 10 },
      { name: 'Salt', pct: 3 },
      { name: 'Fresh Yeast', pct: 0.7 },
      { name: 'Malt Powder', pct: 2 },
    ],
  },
  {
    id: 'baguette',
    label: 'Baguette / Focaccia',
    color: '#6B8FA3',
    totalPct: 181.2,
    ingredients: [
      { name: 'Sir Lancelot', pct: 85 },
      { name: 'Whole Wheat', pct: 15 },
      { name: 'Water (warm)', pct: 66 },
      { name: 'Salt', pct: 2.2 },
      { name: 'Levain', pct: 12 },
      { name: 'Yeast', pct: 1 },
    ],
  },
  {
    id: 'boule',
    label: 'Boule',
    color: '#8B6355',
    totalPct: 182.05,
    ingredients: [
      { name: 'Sir Lancelot', pct: 66 },
      { name: 'Whole Wheat (Fine)', pct: 26 },
      { name: 'Semolina', pct: 8 },
      { name: 'Water (55-60°F)', pct: 65 },
      { name: 'Yeast (Fresh)', pct: 0.05 },
      { name: 'Salt', pct: 2 },
      { name: 'Levain', pct: 15 },
    ],
  },
]

// ─── Dough → Recipe mapping ───────────────────────────────────────────────────
const CATEGORY_TO_RECIPE: Record<string, string> = {
  RYE: 'rye_multi',
  MULTIGRAIN: 'rye_multi',
  WHOLE_WHEAT: 'rye_multi',
  MILK_BREAD: 'milk_bread',
  CHALLAH: 'milk_bread',
  BRIOCHE: 'brioche',
  POOLISH: 'italian',
  SEMOLINA: 'italian',
  BAGUETTE_FOCACCIA: 'baguette',
  BOULE: 'boule',
}

const MIX_CATEGORIES: { id: DoughCategory; label: string; color: string }[] = [
  { id: 'RYE',               label: 'RYE',                 color: '#A0522D' },
  { id: 'MULTIGRAIN',        label: 'MULTIGRAIN',          color: '#7A8B55' },
  { id: 'MILK_BREAD',        label: 'MILK BREAD',          color: '#D4A574' },
  { id: 'BRIOCHE',           label: 'BRIOCHE',             color: '#E8C547' },
  { id: 'POOLISH',           label: 'POOLISH',             color: '#A8C5A0' },
  { id: 'BAGUETTE_FOCACCIA', label: 'BAGUETTE / FOCACCIA', color: '#6B8FA3' },
  { id: 'BOULE',             label: 'BOULE',               color: '#8B6355' },
  { id: 'SEMOLINA',          label: 'SEMOLINA',            color: '#C4A882' },
  { id: 'CHALLAH',           label: 'CHALLAH',             color: '#E8D5A3' },
  { id: 'WHOLE_WHEAT',       label: 'WHOLE WHEAT',         color: '#7FA88B' },
]

interface ProductLine { name: string; qty: number; unitWeight: number; totalGrams: number }
interface CategoryWeight { grams: number; products: ProductLine[] }
type WeightMap = Record<string, CategoryWeight>

const ZERO_WHEN_EMPTY = new Set<string>(['PRETZEL','CHALLAH','POTATO_MILK','WHITE','WHOLE_WHEAT','COCO'])
const MIXER_MAX_KG = 150

function roundUp(n: number, decimals = 0) {
  const factor = Math.pow(10, decimals)
  return Math.ceil(n * factor) / factor
}

function ceilTo10(n: number) {
  return Math.ceil(n / 10) * 10
}

function adjustedKg(grams: number, cat: DoughCategory, extra: number = 0): number {
  if (grams === 0 && ZERO_WHEN_EMPTY.has(cat)) return 0
  const base = roundUp(grams / 1000, 0)
  return base + extra
}

function computeWeights(
  orders: Order[],
  products: { id: string; name: string; category: DoughCategory; unitWeight?: number }[]
): { weights: WeightMap; missing: string[] } {
  const qtyByProduct: Record<string, number> = {}
  const nameByProduct: Record<string, string> = {}
  for (const order of orders) {
    for (const item of order.items) {
      if (item.quantity > 0) {
        qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + item.quantity
        nameByProduct[item.productId] = item.productName
      }
    }
  }
  const weights: WeightMap = {}
  const missing: string[] = []
  for (const [productId, qty] of Object.entries(qtyByProduct)) {
    const product = products.find(p => p.id === productId)
    if (!product) continue
    if (!product.unitWeight) { missing.push(nameByProduct[productId] || productId); continue }
    const cat = product.category
    if (!weights[cat]) weights[cat] = { grams: 0, products: [] }
    const totalGrams = qty * product.unitWeight
    weights[cat].grams += totalGrams
    weights[cat].products.push({ name: product.name, qty, unitWeight: product.unitWeight, totalGrams })
  }
  return { weights, missing }
}

function Cell({ value, unit, className = '' }: { value: number | string; unit?: string; className?: string }) {
  if (value === 0 || value === '—') return (
    <td className={`px-3 py-2 text-center font-mono text-bark-800/25 text-sm ${className}`}>—</td>
  )
  return (
    <td className={`px-3 py-2 text-center font-mono font-semibold text-bark-900 text-sm ${className}`}>
      {typeof value === 'number' ? value.toLocaleString() : value}
      {unit && <span className="text-bark-800/40 text-xs ml-0.5">{unit}</span>}
    </td>
  )
}

function DoughSection({ title, subtitle, orderCount, totalGrams, weights, missing, expanded, onToggle, headerColor, extraKg, onExtraChange }: {
  title: string; subtitle: string; orderCount: number; totalGrams: number
  weights: WeightMap; missing: string[]; expanded: Set<string>
  onToggle: (id: string) => void; headerColor: string
  extraKg: Record<string, number>
  onExtraChange: (catId: string, val: number) => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: headerColor }}>
        <div>
          <h2 className="font-display text-white text-lg tracking-wide">{title}</h2>
          <p className="text-white/70 text-xs font-mono">{subtitle} · {orderCount} order{orderCount !== 1 ? 's' : ''}</p>
        </div>
        {totalGrams > 0 && (
          <div className="text-right">
            <div className="text-white/70 text-xs font-mono">Total Dough</div>
            <div className="font-display text-white text-xl">
              {(totalGrams / 1000).toFixed(3)} kg
              <span className="text-white/60 text-xs ml-2">({totalGrams.toLocaleString()} g)</span>
            </div>
          </div>
        )}
      </div>
      {missing.length > 0 && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-800">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span><strong>Missing unit weights:</strong> {missing.join(', ')}</span>
        </div>
      )}
      {orderCount === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-bark-800/40 italic">No orders placed for this date.</div>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-cream-50 border-b border-wheat-400/20 text-[10px] font-mono uppercase tracking-wider text-bark-800/50">
            <div className="col-span-3">Dough Category</div>
            <div className="col-span-2 text-right">Grams</div>
            <div className="col-span-2 text-right">Kilograms</div>
            <div className="col-span-2 text-center">+ Extra kg</div>
            <div className="col-span-2 text-right">Total kg</div>
            <div className="col-span-1 text-right">SKUs</div>
          </div>
          {MIX_CATEGORIES.map(cat => {
            const data = weights[cat.id]
            if (!data || data.grams === 0) return null
            const isOpen = expanded.has(cat.id)
            const extra = extraKg[cat.id] || 0
            const baseKg = roundUp(data.grams / 1000, 0)
            const totalKg = baseKg + extra
            return (
              <div key={cat.id} className="border-b border-wheat-400/10 last:border-0">
                <div className="w-full grid grid-cols-12 gap-2 px-5 py-3.5 hover:bg-cream-50 transition-colors items-center">
                  <div className="col-span-3 flex items-center gap-2.5">
                    <button onClick={() => onToggle(cat.id)}>
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-bark-800/30 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-bark-800/30 flex-shrink-0" />}
                    </button>
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="font-display text-sm text-bark-900">{cat.label}</span>
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-bark-900 text-base">
                    {data.grams.toLocaleString()}<span className="text-bark-800/40 text-xs font-normal ml-0.5">g</span>
                  </div>
                  <div className="col-span-2 text-right font-mono text-bark-800/70">
                    {(data.grams / 1000).toFixed(3)}<span className="text-bark-800/40 text-xs ml-0.5">kg</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <input
                      type="number"
                      min="0"
                      value={extra || ''}
                      placeholder="0"
                      onChange={e => onExtraChange(cat.id, parseFloat(e.target.value) || 0)}
                      style={{ width: '64px', textAlign: 'center', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-bark-900 text-base">
                    {totalKg}<span className="text-bark-800/40 text-xs font-normal ml-0.5">kg</span>
                  </div>
                  <div className="col-span-1 text-right text-xs font-mono text-bark-800/40">{data.products.length}</div>
                </div>
                {isOpen && (
                  <div className="bg-cream-50 border-t border-wheat-400/10">
                    <div className="grid grid-cols-12 gap-2 px-10 py-1.5 text-[10px] font-mono uppercase tracking-wider text-bark-800/40 border-b border-wheat-400/10">
                      <div className="col-span-5">Product</div>
                      <div className="col-span-2 text-right">Qty</div>
                      <div className="col-span-2 text-right">g/Unit</div>
                      <div className="col-span-3 text-right">Total g</div>
                    </div>
                    {data.products.sort((a, b) => b.totalGrams - a.totalGrams).map((prod, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 px-10 py-2.5 border-b border-wheat-400/10 last:border-0 hover:bg-cream-100/50">
                        <div className="col-span-5 text-sm text-bark-900">{prod.name}</div>
                        <div className="col-span-2 text-right font-mono text-bark-800/70 text-sm font-semibold">{prod.qty}</div>
                        <div className="col-span-2 text-right font-mono text-bark-800/40 text-sm">× {prod.unitWeight}g</div>
                        <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-sm">{prod.totalGrams.toLocaleString()}g</div>
                      </div>
                    ))}
                    <div className="grid grid-cols-12 gap-2 px-10 py-2 bg-cream-100 border-t border-wheat-400/20">
                      <div className="col-span-9 text-xs font-mono text-bark-800/50 font-semibold uppercase">{cat.label} Total</div>
                      <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-sm">
                        {data.grams.toLocaleString()}g <span className="text-bark-800/40 font-normal text-xs">/ {(data.grams / 1000).toFixed(3)}kg</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div className="grid grid-cols-12 gap-2 px-5 py-4 border-t-2 border-wheat-400/30" style={{ backgroundColor: headerColor + '18' }}>
            <div className="col-span-3 font-display text-sm font-bold text-bark-900 uppercase tracking-wide flex items-center gap-2">
              <Scale className="w-4 h-4" style={{ color: headerColor }} /> Total Dough
            </div>
            <div className="col-span-2 text-right font-mono font-bold text-bark-900 text-base">{totalGrams.toLocaleString()}<span className="text-bark-800/40 text-xs font-normal ml-0.5">g</span></div>
            <div className="col-span-2 text-right font-mono font-bold text-bark-900 text-base">{(totalGrams / 1000).toFixed(3)}<span className="text-bark-800/40 text-xs font-normal ml-0.5">kg</span></div>
            <div className="col-span-2 text-center font-mono text-bark-800/40 text-sm">
              {Object.values(extraKg).reduce((s, v) => s + v, 0) > 0 ? `+${Object.values(extraKg).reduce((s, v) => s + v, 0)} kg` : ''}
            </div>
            <div className="col-span-2 text-right font-mono font-bold text-bark-900 text-base">
              {MIX_CATEGORIES.reduce((s, cat) => {
                const grams = weights[cat.id]?.grams || 0
                if (grams === 0) return s
                return s + roundUp(grams / 1000, 0) + (extraKg[cat.id] || 0)
              }, 0)}<span className="text-bark-800/40 text-xs font-normal ml-0.5">kg</span>
            </div>
            <div className="col-span-1" />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Recipe Card ──────────────────────────────────────────────────────────────
function RecipeCard({ recipe, totalKg, onUpdate }: {
  recipe: Recipe
  totalKg: number
  onUpdate: (updated: Recipe) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Recipe>(recipe)

  const flourKg = totalKg / (recipe.totalPct / 100)
  const batches = totalKg > 0 ? Math.ceil(totalKg / MIXER_MAX_KG) : 1
  const batchKg = totalKg > 0 ? totalKg / batches : 0

  const flourPerBatch = batchKg / (recipe.totalPct / 100)

  const handleSave = () => {
    onUpdate(draft)
    setEditing(false)
  }

  const updateIngredient = (idx: number, field: 'name' | 'pct', value: string) => {
    setDraft(prev => {
      const ingredients = [...prev.ingredients]
      ingredients[idx] = { ...ingredients[idx], [field]: field === 'pct' ? parseFloat(value) || 0 : value }
      return { ...prev, ingredients }
    })
  }

  const addIngredient = () => {
    setDraft(prev => ({ ...prev, ingredients: [...prev.ingredients, { name: '', pct: 0 }] }))
  }

  const removeIngredient = (idx: number) => {
    setDraft(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: recipe.color }}>
        <div>
          <h3 className="font-display text-white text-base tracking-wide">{recipe.label}</h3>
          <p className="text-white/70 text-xs font-mono">
            {totalKg > 0 ? `${totalKg} kg total` : 'No dough today'}
            {batches > 1 && <span className="ml-2 bg-white/20 px-2 py-0.5 rounded text-white font-bold">×{batches} batches</span>}
          </p>
        </div>
        <button
          onClick={() => { setDraft(recipe); setEditing(!editing) }}
          className="text-white/70 hover:text-white transition-colors p-1"
        >
          {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
        </button>
      </div>

      {totalKg === 0 ? (
        <div className="px-5 py-6 text-center text-bark-800/40 text-sm italic">No {recipe.label} dough needed today</div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f7f3ee' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc' }}>INGREDIENT</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc', width: '80px' }}>%</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc', width: '100px', backgroundColor: recipe.color + '20' }}>
                  TOTAL kg
                </th>
                {batches > 1 && (
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc', width: '100px', backgroundColor: '#fdf6ec' }}>
                    PER BATCH
                  </th>
                )}
                {editing && <th style={{ padding: '8px 12px', width: '40px', borderBottom: '2px solid #e2d9cc' }} />}
              </tr>
              {/* Total flour row */}
              <tr style={{ backgroundColor: '#e8f0fe' }}>
                <td style={{ padding: '6px 12px', fontStyle: 'italic', fontWeight: 'bold' }}>Total Flour</td>
                <td style={{ padding: '6px 12px', textAlign: 'center', fontStyle: 'italic' }}>100%</td>
                <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: recipe.color + '15' }}>
                  {flourKg.toFixed(3)}
                </td>
                {batches > 1 && (
                  <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fdf6ec' }}>
                    {flourPerBatch.toFixed(3)}
                  </td>
                )}
                {editing && <td />}
              </tr>
              {/* Total dough row */}
              <tr style={{ backgroundColor: '#f0f4f0' }}>
                <td style={{ padding: '6px 12px', fontStyle: 'italic', fontWeight: 'bold' }}>Total Dough</td>
                <td style={{ padding: '6px 12px', textAlign: 'center', fontStyle: 'italic' }}>{recipe.totalPct}%</td>
                <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: recipe.color + '15' }}>
                  {totalKg.toFixed(3)}
                </td>
                {batches > 1 && (
                  <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fdf6ec' }}>
                    {batchKg.toFixed(3)}
                  </td>
                )}
                {editing && <td />}
              </tr>
            </thead>
            <tbody>
              {(editing ? draft.ingredients : recipe.ingredients).map((ing, idx) => {
                const kgTotal = flourKg * (ing.pct / 100)
                const kgPerBatch = flourPerBatch * (ing.pct / 100)
                return (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#faf8f5', borderBottom: '1px solid #f0ebe3' }}>
                    <td style={{ padding: '7px 12px' }}>
                      {editing ? (
                        <input
                          value={ing.name}
                          onChange={e => updateIngredient(idx, 'name', e.target.value)}
                          style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '3px 6px', width: '100%', fontSize: '12px' }}
                        />
                      ) : (
                        <span>{ing.name}{ing.note && <span style={{ color: '#a0aec0', fontSize: '11px', marginLeft: '6px' }}>({ing.note})</span>}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', color: '#718096' }}>
                      {editing ? (
                        <input
                          type="number"
                          value={ing.pct}
                          onChange={e => updateIngredient(idx, 'pct', e.target.value)}
                          style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '3px 6px', width: '60px', textAlign: 'center', fontSize: '12px' }}
                        />
                      ) : `${ing.pct}%`}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 'bold', backgroundColor: recipe.color + '08' }}>
                      {kgTotal.toFixed(3)}
                    </td>
                    {batches > 1 && (
                      <td style={{ textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fdf6ec' }}>
                        {kgPerBatch.toFixed(3)}
                      </td>
                    )}
                    {editing && (
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => removeIngredient(idx)} style={{ color: '#fc8181', cursor: 'pointer', background: 'none', border: 'none', fontSize: '16px' }}>×</button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {editing && (
                <tr>
                  <td colSpan={batches > 1 ? 5 : 4} style={{ padding: '8px 12px' }}>
                    <button onClick={addIngredient} style={{ color: '#c4943a', fontSize: '12px', cursor: 'pointer', background: 'none', border: 'none' }}>+ Add ingredient</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Add-ins section */}
          {recipe.addIns && recipe.addIns.length > 0 && (
            <div style={{ borderTop: '2px solid #e2d9cc', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#718096', marginBottom: '8px' }}>
                Add-ins by Dough Type
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {recipe.addIns.map((addIn, ai) => {
                  // This will be populated with actual kg in the parent
                  return (
                    <div key={ai} style={{ flex: 1, minWidth: '200px', border: '1px solid #e2d9cc', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#f7f3ee', padding: '6px 10px', fontWeight: 'bold', fontSize: '12px', borderBottom: '1px solid #e2d9cc' }}>
                        {addIn.label}
                      </div>
                      <div style={{ padding: '8px 10px', fontSize: '12px', color: '#718096', fontStyle: 'italic' }}>
                        Set kg in dough section above
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {editing && (
            <div style={{ padding: '12px', borderTop: '1px solid #e2d9cc', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '12px' }}>
                <span style={{ fontSize: '12px', color: '#718096' }}>Total %:</span>
                <input
                  type="number"
                  value={draft.totalPct}
                  onChange={e => setDraft(prev => ({ ...prev, totalPct: parseFloat(e.target.value) || 0 }))}
                  style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '3px 6px', width: '70px', textAlign: 'center', fontSize: '12px' }}
                />
              </div>
              <button
                onClick={handleSave}
                style={{ backgroundColor: '#c4943a', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Save style={{ width: '12px', height: '12px' }} /> Save Recipe
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{ backgroundColor: '#f7f3ee', color: '#718096', border: '1px solid #e2d9cc', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Manual Mix Calculator ────────────────────────────────────────────────────
function ManualMixCalculator({ recipes }: { recipes: Recipe[] }) {
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id || '')
  const [manualKg, setManualKg] = useState<number>(10)

  const recipe = recipes.find(r => r.id === selectedRecipeId)
  if (!recipe) return null

  const flourKg = manualKg / (recipe.totalPct / 100)
  const batches = Math.ceil(manualKg / MIXER_MAX_KG)
  const batchKg = manualKg / batches
  const flourPerBatch = batchKg / (recipe.totalPct / 100)

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: '#4a3728' }}>
        <div>
          <h3 className="font-display text-white text-base tracking-wide">Manual Mix Calculator</h3>
          <p className="text-white/70 text-xs font-mono">Enter a kg amount to calculate any recipe</p>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-4 mb-5">
          <div>
            <label className="text-xs font-mono text-bark-800/50 uppercase tracking-wider block mb-1">Recipe</label>
            <select
              value={selectedRecipeId}
              onChange={e => setSelectedRecipeId(e.target.value)}
              className="input py-1.5 text-sm"
            >
              {recipes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-mono text-bark-800/50 uppercase tracking-wider block mb-1">Total kg to mix</label>
            <input
              type="number"
              min="1"
              value={manualKg}
              onChange={e => setManualKg(parseFloat(e.target.value) || 0)}
              className="input py-1.5 text-sm w-28"
            />
          </div>
          {batches > 1 && (
            <div className="mt-5 px-3 py-1.5 rounded-lg text-sm font-bold" style={{ backgroundColor: recipe.color + '20', color: recipe.color }}>
              ×{batches} batches of {batchKg.toFixed(1)} kg each
            </div>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7f3ee' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc' }}>INGREDIENT</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc', width: '80px' }}>%</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc', width: '100px', backgroundColor: recipe.color + '20' }}>TOTAL kg</th>
              {batches > 1 && <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', borderBottom: '2px solid #e2d9cc', width: '100px', backgroundColor: '#fdf6ec' }}>PER BATCH</th>}
            </tr>
            <tr style={{ backgroundColor: '#e8f0fe' }}>
              <td style={{ padding: '6px 12px', fontStyle: 'italic', fontWeight: 'bold' }}>Total Flour</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', fontStyle: 'italic' }}>100%</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: recipe.color + '15' }}>{flourKg.toFixed(3)}</td>
              {batches > 1 && <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fdf6ec' }}>{flourPerBatch.toFixed(3)}</td>}
            </tr>
            <tr style={{ backgroundColor: '#f0f4f0' }}>
              <td style={{ padding: '6px 12px', fontStyle: 'italic', fontWeight: 'bold' }}>Total Dough</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', fontStyle: 'italic' }}>{recipe.totalPct}%</td>
              <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: recipe.color + '15' }}>{manualKg.toFixed(3)}</td>
              {batches > 1 && <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fdf6ec' }}>{batchKg.toFixed(3)}</td>}
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ing, idx) => {
              const kgTotal = flourKg * (ing.pct / 100)
              const kgPerBatch = flourPerBatch * (ing.pct / 100)
              return (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#faf8f5', borderBottom: '1px solid #f0ebe3' }}>
                  <td style={{ padding: '7px 12px' }}>
                    {ing.name}{ing.note && <span style={{ color: '#a0aec0', fontSize: '11px', marginLeft: '6px' }}>({ing.note})</span>}
                  </td>
                  <td style={{ textAlign: 'center', color: '#718096' }}>{ing.pct}%</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', backgroundColor: recipe.color + '08' }}>{kgTotal.toFixed(3)}</td>
                  {batches > 1 && <td style={{ textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fdf6ec' }}>{kgPerBatch.toFixed(3)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MixSheetPage() {
  const { products, loading: productsLoading } = useProducts()
  const [baseDate, setBaseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [todayOrders, setTodayOrders] = useState<Order[]>([])
  const [nextOrders, setNextOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [expandedToday, setExpandedToday] = useState<Set<string>>(new Set())
  const [expandedNext, setExpandedNext] = useState<Set<string>>(new Set())
  const [todayExtra, setTodayExtra] = useState<Record<string, number>>({})
  const [nextExtra, setNextExtra] = useState<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState<MixTab>('dough')
  const [recipes, setRecipes] = useState<Recipe[]>(DEFAULT_RECIPES)

  const nextDate = useMemo(() => format(addDays(parseISO(baseDate), 1), 'yyyy-MM-dd'), [baseDate])
  const todayDisplay = format(parseISO(baseDate), 'EEEE, MMMM d')
  const nextDisplay = format(addDays(parseISO(baseDate), 1), 'EEEE, MMMM d')

  useEffect(() => {
    setOrdersLoading(true)
    Promise.all([
      ordersService.getByDate(baseDate),
      ordersService.getByDate(nextDate),
    ]).then(([t, n]) => { setTodayOrders(t); setNextOrders(n); setOrdersLoading(false) })
  }, [baseDate, nextDate])

  const { weights: todayWeights, missing: todayMissing } = useMemo(() => computeWeights(todayOrders, products), [todayOrders, products])
  const { weights: nextWeights, missing: nextMissing } = useMemo(() => computeWeights(nextOrders, products), [nextOrders, products])

  const todayTotalGrams = Object.values(todayWeights).reduce((s, c) => s + c.grams, 0)
  const nextTotalGrams = Object.values(nextWeights).reduce((s, c) => s + c.grams, 0)

  const nextKg = useMemo(() => {
    const r: Partial<Record<DoughCategory, number>> = {}
    MIX_CATEGORIES.forEach(cat => {
      const grams = nextWeights[cat.id]?.grams || 0
      r[cat.id] = adjustedKg(grams, cat.id, nextExtra[cat.id] || 0)
    })
    return r
  }, [nextWeights, nextExtra])

  // Compute recipe kg by consolidating categories into dough types
  const recipeKg = useMemo(() => {
    const result: Record<string, number> = {}
    MIX_CATEGORIES.forEach(cat => {
      const recipeId = CATEGORY_TO_RECIPE[cat.id]
      if (!recipeId) return
      const kg = nextKg[cat.id] || 0
      result[recipeId] = (result[recipeId] || 0) + kg
    })
    return result
  }, [nextKg])

  const levainRaw = (nextKg.RYE||0)*0.065 + (nextKg.MULTIGRAIN||0)*0.065 + (nextKg.BRIOCHE||0)*0.035 + (nextKg.BAGUETTE_FOCACCIA||0)*0.082 + (nextKg.BOULE||0)*0.104 + (nextKg.SEMOLINA||0)*0.188 + 9
  const poolishRaw = (nextKg.POOLISH||0)*0.376 + 1
  const wwPoolishRaw = (nextKg.RYE||0)*0.258 + (nextKg.MULTIGRAIN||0)*0.258 + (nextKg.WHOLE_WHEAT||0)*0.208 + 1
  const levainKg = ceilTo10(roundUp(levainRaw, 0))
  const poolishKg = roundUp(poolishRaw, 0)
  const wwPoolishKg = roundUp(wwPoolishRaw, 0)

  const loading = ordersLoading || productsLoading
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="section-header">Mix Sheet</h1>
            <p className="text-bark-800/60 text-sm">Dough requirements calculated from placed orders × unit weight</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wheat-400 pointer-events-none" />
              <input type="date" value={baseDate} onChange={e => setBaseDate(e.target.value)} className="input pl-9 w-44" />
            </div>
            <button onClick={() => setBaseDate(format(new Date(), 'yyyy-MM-dd'))} className="btn-ghost flex items-center gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" /> Today
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b border-wheat-400/30">
          {(['dough', 'recipes'] as MixTab[]).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 500,
                borderBottom: activeTab === t ? '2px solid #c4943a' : '2px solid transparent',
                color: activeTab === t ? '#1a0f00' : '#7a6040',
                background: 'none',
                cursor: 'pointer',
                marginBottom: '-1px',
                textTransform: 'capitalize',
              }}
            >
              {t === 'dough' ? '⚖️ Dough' : '📖 Recipes'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-bark-800/40">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <>
            {activeTab === 'dough' && (
              <div className="space-y-6">
                <DoughSection
                  title="TODAY'S DOUGH" subtitle={todayDisplay}
                  orderCount={todayOrders.length} totalGrams={todayTotalGrams}
                  weights={todayWeights} missing={todayMissing}
                  expanded={expandedToday}
                  onToggle={id => setExpandedToday(prev => toggle(prev, id))}
                  headerColor="#6B5744"
                  extraKg={todayExtra}
                  onExtraChange={(cat, val) => setTodayExtra(prev => ({ ...prev, [cat]: val }))}
                />
                <DoughSection
                  title="NEXT DAY DOUGH" subtitle={nextDisplay}
                  orderCount={nextOrders.length} totalGrams={nextTotalGrams}
                  weights={nextWeights} missing={nextMissing}
                  expanded={expandedNext}
                  onToggle={id => setExpandedNext(prev => toggle(prev, id))}
                  headerColor="#4A6355"
                  extraKg={nextExtra}
                  onExtraChange={(cat, val) => setNextExtra(prev => ({ ...prev, [cat]: val }))}
                />
                <div className="card overflow-hidden">
                  <div className="px-5 py-3" style={{ backgroundColor: '#3D5A8A' }}>
                    <h2 className="font-display text-white text-lg tracking-wide">PRE-FERMENTS</h2>
                    <p className="text-white/70 text-xs font-mono">Calculated from Next Day adjusted kg</p>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="bg-cream-50 border-b border-wheat-400/20">
                        <th className="px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-wider text-bark-800/50 w-40"></th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-mono uppercase tracking-wider text-bark-800/50">LEVAIN</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-mono uppercase tracking-wider text-bark-800/50">STANDARD POOLISH</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-mono uppercase tracking-wider text-bark-800/50">WHOLE WHEAT POOLISH</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-wheat-400/10">
                        <td className="px-4 py-3 text-xs font-mono text-bark-800/50 uppercase">Weight (kg raw)</td>
                        <Cell value={parseFloat(levainRaw.toFixed(1))} unit="kg" />
                        <Cell value={parseFloat(poolishRaw.toFixed(1))} unit="kg" />
                        <Cell value={parseFloat(wwPoolishRaw.toFixed(1))} unit="kg" />
                      </tr>
                      <tr className="bg-cream-50">
                        <td className="px-4 py-3 text-xs font-mono text-bark-800/50 uppercase font-semibold">Adjusted (kg)</td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-display text-2xl font-bold text-bark-900">{levainKg}</span>
                          <span className="text-bark-800/40 text-xs ml-1">kg</span>
                          <div className="text-[10px] text-bark-800/40 font-mono">rounded to nearest 10</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-display text-2xl font-bold text-bark-900">{poolishKg}</span>
                          <span className="text-bark-800/40 text-xs ml-1">kg</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-display text-2xl font-bold text-bark-900">{wwPoolishKg}</span>
                          <span className="text-bark-800/40 text-xs ml-1">kg</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'recipes' && (
              <div className="space-y-6">
                <div className="p-3 rounded-lg bg-wheat-100 border border-wheat-300 text-sm text-bark-800/70">
                  📖 Recipes are calculated from <strong>Next Day</strong> adjusted kg. Click the pencil icon on any recipe to edit percentages.
                </div>
                {recipes.map(recipe => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    totalKg={recipeKg[recipe.id] || 0}
                    onUpdate={updated => setRecipes(prev => prev.map(r => r.id === updated.id ? updated : r))}
                  />
                ))}
                <ManualMixCalculator recipes={recipes} />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
