'use client'
import { useState, useEffect, useMemo } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService } from '@/lib/db'
import { useProducts } from '@/lib/useProducts'
import { DoughCategory, Order } from '@/types'
import { format, addDays, parseISO } from 'date-fns'
import { Calendar, Scale, ChevronRight, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react'

const MIX_CATEGORIES: { id: DoughCategory; label: string; color: string }[] = [
  { id: 'RYE',               label: 'RYE',                 color: '#A0522D' },
  { id: 'MULTIGRAIN',        label: 'MULTIGRAIN',          color: '#7A8B55' },
  { id: 'MILK_BREAD',        label: 'MILK BREAD',          color: '#D4A574' },
  { id: 'BRIOCHE',           label: 'BRIOCHE',             color: '#E8C547' },
  { id: 'POOLISH',           label: 'POOLISH',             color: '#A8C5A0' },
  { id: 'BAGUETTE_FOCACCIA', label: 'BAGUETTE / FOCACCIA', color: '#6B8FA3' },
  { id: 'BOULE',             label: 'BOULE',               color: '#8B6355' },
  { id: 'SEMOLINA',          label: 'SEMOLINA',            color: '#C4A882' },
  { id: 'PRETZEL',           label: 'PRETZEL',             color: '#9B8EA8' },
  { id: 'CHALLAH',           label: 'CHALLAH',             color: '#E8D5A3' },
  { id: 'POTATO_MILK',       label: 'POTATO MILK',         color: '#C4765A' },
  { id: 'WHITE',             label: 'WHITE',               color: '#8B7355' },
  { id: 'WHOLE_WHEAT',       label: 'WHOLE WHEAT',         color: '#7FA88B' },
  { id: 'COCO',              label: 'COCO',                color: '#4A3728' },
]

interface ProductLine { name: string; qty: number; unitWeight: number; totalGrams: number }
interface CategoryWeight { grams: number; products: ProductLine[] }
type WeightMap = Record<string, CategoryWeight>

function computeWeights(
  orders: Order[],
  products: { id: string; name: string; category: DoughCategory; unitWeight?: number }[]
): { weights: WeightMap; orderedWithoutWeight: string[] } {
  // Sum qty per product across all orders
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
  const orderedWithoutWeight: string[] = []

  for (const [productId, qty] of Object.entries(qtyByProduct)) {
    const product = products.find(p => p.id === productId)
    if (!product) continue

    if (!product.unitWeight) {
      // Product was ordered but has no unit weight — track it
      orderedWithoutWeight.push(nameByProduct[productId] || productId)
      continue
    }

    const cat = product.category
    if (!weights[cat]) weights[cat] = { grams: 0, products: [] }
    const totalGrams = qty * product.unitWeight
    weights[cat].grams += totalGrams
    weights[cat].products.push({
      name: product.name,
      qty,
      unitWeight: product.unitWeight,
      totalGrams,
    })
  }

  return { weights, orderedWithoutWeight }
}

function Section({
  title, subtitle, orderCount, totalGrams, weights,
  orderedWithoutWeight, expanded, onToggle, headerColor,
}: {
  title: string; subtitle: string; orderCount: number; totalGrams: number
  weights: WeightMap; orderedWithoutWeight: string[]
  expanded: Set<string>; onToggle: (id: string) => void; headerColor: string
}) {
  const activeCats = MIX_CATEGORIES.filter(cat => (weights[cat.id]?.grams || 0) > 0)

  return (
    <div className="card overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: headerColor }}>
        <div>
          <h2 className="font-display text-white text-lg tracking-wide">{title}</h2>
          <p className="text-white/70 text-xs font-mono">
            {subtitle} · {orderCount} order{orderCount !== 1 ? 's' : ''}
          </p>
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

      {/* Warning: ordered products missing unit weight */}
      {orderedWithoutWeight.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs text-amber-800">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Missing unit weights:</strong> {orderedWithoutWeight.join(', ')}.
            These ordered items are excluded until weights are set in Products.
          </span>
        </div>
      )}

      {orderCount === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-bark-800/40 italic">
          No orders placed for this date.
        </div>
      ) : activeCats.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-bark-800/40 italic">
          Orders exist but no products have unit weights set yet.
          Go to <strong>Products</strong> → <strong>Apply Unit Weights</strong>.
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-cream-50 border-b border-wheat-400/20 text-[10px] font-mono uppercase tracking-wider text-bark-800/50">
            <div className="col-span-4">Dough Category</div>
            <div className="col-span-3 text-right">Grams</div>
            <div className="col-span-3 text-right">Kilograms</div>
            <div className="col-span-2 text-right">SKUs</div>
          </div>

          {/* One row per active dough category */}
          {MIX_CATEGORIES.map(cat => {
            const data = weights[cat.id]
            if (!data || data.grams === 0) return null
            const isOpen = expanded.has(cat.id)
            return (
              <div key={cat.id} className="border-b border-wheat-400/10 last:border-0">
                <button
                  onClick={() => onToggle(cat.id)}
                  className="w-full grid grid-cols-12 gap-2 px-5 py-3.5 hover:bg-cream-50 transition-colors text-left items-center"
                >
                  <div className="col-span-4 flex items-center gap-2.5">
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5 text-bark-800/30 flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-bark-800/30 flex-shrink-0" />}
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="font-display text-sm text-bark-900">{cat.label}</span>
                  </div>
                  <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-base">
                    {data.grams.toLocaleString()}
                    <span className="text-bark-800/40 text-xs font-normal ml-0.5">g</span>
                  </div>
                  <div className="col-span-3 text-right font-mono text-bark-800/70">
                    {(data.grams / 1000).toFixed(3)}
                    <span className="text-bark-800/40 text-xs ml-0.5">kg</span>
                  </div>
                  <div className="col-span-2 text-right text-xs font-mono text-bark-800/40">
                    {data.products.length}
                  </div>
                </button>

                {/* Expanded product breakdown */}
                {isOpen && (
                  <div className="bg-cream-50 border-t border-wheat-400/10">
                    <div className="grid grid-cols-12 gap-2 px-10 py-1.5 text-[10px] font-mono uppercase tracking-wider text-bark-800/40 border-b border-wheat-400/10">
                      <div className="col-span-5">Product</div>
                      <div className="col-span-2 text-right">Qty Ordered</div>
                      <div className="col-span-2 text-right">g / Unit</div>
                      <div className="col-span-3 text-right">Total Grams</div>
                    </div>
                    {data.products
                      .sort((a, b) => b.totalGrams - a.totalGrams)
                      .map((prod, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 px-10 py-2.5 border-b border-wheat-400/10 last:border-0 hover:bg-cream-100/50">
                          <div className="col-span-5 text-sm text-bark-900">{prod.name}</div>
                          <div className="col-span-2 text-right font-mono text-bark-800/70 text-sm font-semibold">{prod.qty}</div>
                          <div className="col-span-2 text-right font-mono text-bark-800/40 text-sm">× {prod.unitWeight}g</div>
                          <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-sm">
                            {prod.totalGrams.toLocaleString()}g
                          </div>
                        </div>
                      ))}
                    {/* Category subtotal */}
                    <div className="grid grid-cols-12 gap-2 px-10 py-2 bg-cream-100 border-t border-wheat-400/20">
                      <div className="col-span-9 text-xs font-mono text-bark-800/50 font-semibold uppercase">{cat.label} Total</div>
                      <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-sm">
                        {data.grams.toLocaleString()}g
                        <span className="text-bark-800/40 font-normal ml-1 text-xs">/ {(data.grams / 1000).toFixed(3)}kg</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Grand total row */}
          <div className="grid grid-cols-12 gap-2 px-5 py-4 border-t-2 border-wheat-400/30" style={{ backgroundColor: headerColor + '15' }}>
            <div className="col-span-4 font-display text-sm font-bold text-bark-900 uppercase tracking-wide flex items-center gap-2">
              <Scale className="w-4 h-4" style={{ color: headerColor }} />
              Total Dough
            </div>
            <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-base">
              {totalGrams.toLocaleString()}<span className="text-bark-800/40 text-xs font-normal ml-0.5">g</span>
            </div>
            <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-base">
              {(totalGrams / 1000).toFixed(3)}<span className="text-bark-800/40 text-xs font-normal ml-0.5">kg</span>
            </div>
            <div className="col-span-2" />
          </div>
        </>
      )}
    </div>
  )
}

export default function MixSheetPage() {
  const { products, loading: productsLoading } = useProducts()
  const [baseDate, setBaseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [todayOrders, setTodayOrders] = useState<Order[]>([])
  const [nextOrders, setNextOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [expandedToday, setExpandedToday] = useState<Set<string>>(new Set())
  const [expandedNext, setExpandedNext] = useState<Set<string>>(new Set())

  const nextDate = useMemo(() => format(addDays(parseISO(baseDate), 1), 'yyyy-MM-dd'), [baseDate])

  useEffect(() => {
    setOrdersLoading(true)
    Promise.all([
      ordersService.getByDate(baseDate),
      ordersService.getByDate(nextDate),
    ]).then(([t, n]) => {
      setTodayOrders(t)
      setNextOrders(n)
      setOrdersLoading(false)
    })
  }, [baseDate, nextDate])

  const { weights: todayWeights, orderedWithoutWeight: todayMissing } =
    useMemo(() => computeWeights(todayOrders, products), [todayOrders, products])
  const { weights: nextWeights, orderedWithoutWeight: nextMissing } =
    useMemo(() => computeWeights(nextOrders, products), [nextOrders, products])

  const todayTotalGrams = Object.values(todayWeights).reduce((s, c) => s + c.grams, 0)
  const nextTotalGrams  = Object.values(nextWeights).reduce((s, c) => s + c.grams, 0)

  const todayDisplay = format(parseISO(baseDate), 'EEEE, MMMM d')
  const nextDisplay  = format(addDays(parseISO(baseDate), 1), 'EEEE, MMMM d')

  const loading = ordersLoading || productsLoading

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="section-header">Mix Sheet</h1>
            <p className="text-bark-800/60 text-sm">
              Dough requirements calculated from placed orders × unit weight
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wheat-400 pointer-events-none" />
              <input
                type="date"
                value={baseDate}
                onChange={e => setBaseDate(e.target.value)}
                className="input pl-9 w-44"
              />
            </div>
            <button
              onClick={() => setBaseDate(format(new Date(), 'yyyy-MM-dd'))}
              className="btn-ghost flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Today
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-bark-800/40">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <div className="space-y-6">
            <Section
              title="TODAY'S DOUGH"
              subtitle={todayDisplay}
              orderCount={todayOrders.length}
              totalGrams={todayTotalGrams}
              weights={todayWeights}
              orderedWithoutWeight={todayMissing}
              expanded={expandedToday}
              onToggle={id => setExpandedToday(prev => toggle(prev, id))}
              headerColor="#6B5744"
            />
            <Section
              title="NEXT DAY DOUGH"
              subtitle={nextDisplay}
              orderCount={nextOrders.length}
              totalGrams={nextTotalGrams}
              weights={nextWeights}
              orderedWithoutWeight={nextMissing}
              expanded={expandedNext}
              onToggle={id => setExpandedNext(prev => toggle(prev, id))}
              headerColor="#4A6355"
            />
          </div>
        )}
      </div>
    </AppShell>
  )
}
