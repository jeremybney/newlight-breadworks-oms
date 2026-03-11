'use client'
import { useState, useEffect, useMemo } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ordersService } from '@/lib/db'
import { useProducts } from '@/lib/useProducts'
import { DoughCategory, Order } from '@/types'
import { format, addDays, parseISO } from 'date-fns'
import { Calendar, Scale, ChevronRight, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react'

// ─── Dough category config ────────────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductLine { name: string; qty: number; unitWeight: number; totalGrams: number }
interface CategoryWeight { grams: number; products: ProductLine[] }
type WeightMap = Record<string, CategoryWeight>

// ─── Adjusted kg formulas from XLSX row 3 (today) and row 7 (next day) ────────
// Each category adds a buffer on top of ROUNDUP(grams/1000, 0)
const TODAY_BUFFER: Partial<Record<DoughCategory, number>> = {
  RYE: 0, MULTIGRAIN: 0, MILK_BREAD: 3, BRIOCHE: 5, POOLISH: 15,
  BAGUETTE_FOCACCIA: 2, BOULE: 100, SEMOLINA: 2,
  PRETZEL: 2, CHALLAH: 1, POTATO_MILK: 2, WHITE: 1, WHOLE_WHEAT: 1, COCO: 1,
}
const NEXT_BUFFER: Partial<Record<DoughCategory, number>> = {
  RYE: 1, MULTIGRAIN: 1, MILK_BREAD: 1, BRIOCHE: 4, POOLISH: 0,
  BAGUETTE_FOCACCIA: 4, BOULE: 0, SEMOLINA: 0,
  PRETZEL: 42, CHALLAH: 0, POTATO_MILK: 0, WHITE: 0, WHOLE_WHEAT: 0, COCO: 0,
}
// These categories are 0 when no orders (IF formula in XLSX for row 3)
const ZERO_WHEN_EMPTY = new Set<DoughCategory>(['PRETZEL','CHALLAH','POTATO_MILK','WHITE','WHOLE_WHEAT','COCO'])

function roundUp(n: number, decimals = 0) {
  const factor = Math.pow(10, decimals)
  return Math.ceil(n * factor) / factor
}

function ceilTo10(n: number) {
  return Math.ceil(n / 10) * 10
}

function adjustedKg(grams: number, cat: DoughCategory, buffers: Partial<Record<DoughCategory, number>>, isNext = false): number {
  if (grams === 0 && ZERO_WHEN_EMPTY.has(cat)) return 0
  const base = roundUp(grams / 1000, 0)
  const buffer = buffers[cat] ?? 0
  return base + buffer
}

// ─── Compute weights from orders ─────────────────────────────────────────────
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

// ─── Cell component ───────────────────────────────────────────────────────────
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

// ─── Section: Today's / Next Day Dough ───────────────────────────────────────
function DoughSection({ title, subtitle, orderCount, totalGrams, weights, missing, expanded, onToggle, headerColor }: {
  title: string; subtitle: string; orderCount: number; totalGrams: number
  weights: WeightMap; missing: string[]; expanded: Set<string>
  onToggle: (id: string) => void; headerColor: string
}) {
  const activeCats = MIX_CATEGORIES.filter(cat => (weights[cat.id]?.grams || 0) > 0)
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
      ) : activeCats.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-bark-800/40 italic">
          Orders exist but no unit weights set. Go to Products → Apply Unit Weights.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-cream-50 border-b border-wheat-400/20 text-[10px] font-mono uppercase tracking-wider text-bark-800/50">
            <div className="col-span-4">Dough Category</div>
            <div className="col-span-3 text-right">Grams</div>
            <div className="col-span-3 text-right">Kilograms</div>
            <div className="col-span-2 text-right">SKUs</div>
          </div>
          {MIX_CATEGORIES.map(cat => {
            const data = weights[cat.id]
            if (!data || data.grams === 0) return null
            const isOpen = expanded.has(cat.id)
            return (
              <div key={cat.id} className="border-b border-wheat-400/10 last:border-0">
                <button onClick={() => onToggle(cat.id)} className="w-full grid grid-cols-12 gap-2 px-5 py-3.5 hover:bg-cream-50 transition-colors text-left items-center">
                  <div className="col-span-4 flex items-center gap-2.5">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-bark-800/30 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-bark-800/30 flex-shrink-0" />}
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="font-display text-sm text-bark-900">{cat.label}</span>
                  </div>
                  <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-base">
                    {data.grams.toLocaleString()}<span className="text-bark-800/40 text-xs font-normal ml-0.5">g</span>
                  </div>
                  <div className="col-span-3 text-right font-mono text-bark-800/70">
                    {(data.grams / 1000).toFixed(3)}<span className="text-bark-800/40 text-xs ml-0.5">kg</span>
                  </div>
                  <div className="col-span-2 text-right text-xs font-mono text-bark-800/40">{data.products.length}</div>
                </button>
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
            <div className="col-span-4 font-display text-sm font-bold text-bark-900 uppercase tracking-wide flex items-center gap-2">
              <Scale className="w-4 h-4" style={{ color: headerColor }} /> Total Dough
            </div>
            <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-base">{totalGrams.toLocaleString()}<span className="text-bark-800/40 text-xs font-normal ml-0.5">g</span></div>
            <div className="col-span-3 text-right font-mono font-bold text-bark-900 text-base">{(totalGrams / 1000).toFixed(3)}<span className="text-bark-800/40 text-xs font-normal ml-0.5">kg</span></div>
            <div className="col-span-2" />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MixSheetPage() {
  const { products, loading: productsLoading } = useProducts()
  const [baseDate, setBaseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [todayOrders, setTodayOrders] = useState<Order[]>([])
  const [nextOrders, setNextOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [expandedToday, setExpandedToday] = useState<Set<string>>(new Set())
  const [expandedNext, setExpandedNext] = useState<Set<string>>(new Set())

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

  // Adjusted kg per category — using TODAY buffers for today, NEXT for next day
  const todayKg = useMemo(() => {
    const r: Partial<Record<DoughCategory, number>> = {}
    MIX_CATEGORIES.forEach(cat => {
      r[cat.id] = adjustedKg(todayWeights[cat.id]?.grams || 0, cat.id, TODAY_BUFFER)
    })
    return r
  }, [todayWeights])

  const nextKg = useMemo(() => {
    const r: Partial<Record<DoughCategory, number>> = {}
    MIX_CATEGORIES.forEach(cat => {
      r[cat.id] = adjustedKg(nextWeights[cat.id]?.grams || 0, cat.id, NEXT_BUFFER, true)
    })
    return r
  }, [nextWeights])

  // ── Pre-Ferments (uses Next Day adjusted kg per XLSX B10/C10/D10) ──────────
  // B10: =(rye*0.065)+(multi*0.065)+(brioche*0.035)+(bag*0.082)+(boule*0.104)+(sem*0.188)+9
  // C10: =poolish*0.376+1
  // D10: =(rye*0.258)+(multi*0.258)+(ww*0.208)+1
  const levainRaw = (nextKg.RYE||0)*0.065 + (nextKg.MULTIGRAIN||0)*0.065 + (nextKg.BRIOCHE||0)*0.035 + (nextKg.BAGUETTE_FOCACCIA||0)*0.082 + (nextKg.BOULE||0)*0.104 + (nextKg.SEMOLINA||0)*0.188 + 9
  const poolishRaw = (nextKg.POOLISH||0)*0.376 + 1
  const wwPoolishRaw = (nextKg.RYE||0)*0.258 + (nextKg.MULTIGRAIN||0)*0.258 + (nextKg.WHOLE_WHEAT||0)*0.208 + 1
  // B11: CEILING(ROUNDUP(B10,0), 10)  C11: ROUNDUP(C10,0)  D11: ROUNDUP(D10,0)
  const levainKg = ceilTo10(roundUp(levainRaw, 0))
  const poolishKg = roundUp(poolishRaw, 0)
  const wwPoolishKg = roundUp(wwPoolishRaw, 0)

  // ── Bin Breakdown (uses Today adjusted kg per XLSX B14:I18) ────────────────
  // Columns: RYE, MULTI, MILK BREAD, BRIOCHE, POOLISH, BAG/FOCACCIA, BOULE, SEMOLINA
  // Row labels (from guide): bins, lexans/buns/pullmans, ...
  const rye = todayKg.RYE || 0
  const multi = todayKg.MULTIGRAIN || 0
  const milk = todayKg.MILK_BREAD || 0
  const brioche = todayKg.BRIOCHE || 0
  const poolish = todayKg.POOLISH || 0
  const bag = todayKg.BAGUETTE_FOCACCIA || 0
  const boule = todayKg.BOULE || 0
  const sem = todayKg.SEMOLINA || 0

  // B14: IF(rye<=10, 1, 0)          | C14: IF(multi<=10, 1, 0) | D14: IF(milk<=10, 1, 0)
  // H14: ROUNDUP(boule/10, 0)       | I14: ROUNDUP(sem/10, 0)
  const binRow14 = {
    rye:    rye <= 10 && rye > 0 ? 1 : 0,
    multi:  multi <= 10 && multi > 0 ? 1 : 0,
    milk:   milk <= 10 && milk > 0 ? 1 : 0,
    brioche: null as null | number,  // E14 = brioche - E16 (E16 needs product-level data)
    boule:  boule > 0 ? roundUp(boule / 10, 0) : 0,
    sem:    sem > 0 ? roundUp(sem / 10, 0) : 0,
  }
  // D15: IF(milk>10, ROUNDUP(milk/40,0), 0)
  // B16: IF(rye>10, ROUNDUP(rye/40,0), 0)   | C16: IF(multi>10, ROUNDUP(multi/40,0), 0)
  // D16: milk - D17  (D17 has #REF so we approximate: pullmans row = D15 since that's the pullmans calc)
  const binRow15 = { milk: milk > 10 ? roundUp(milk / 40, 0) : 0 }
  const binRow16 = {
    rye:   rye > 10 ? roundUp(rye / 40, 0) : 0,
    multi: multi > 10 ? roundUp(multi / 40, 0) : 0,
    milk:  Math.max(0, milk - binRow15.milk), // buns = total - pullmans
  }

  // POOLISH sub-bins: F17 = poolish - (baguettes*4.6) - (small_ciab*3.6) - (ciabatta*2.5)
  // Since we don't have sub-product breakdown here, we show total poolish kg only
  // BAG sub-bins: G17 = bag - (bag_baguettes*4.6) - (demi*3) - (rolls*0.065)

  const loading = ordersLoading || productsLoading
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n }

  const hasAnyOrders = todayOrders.length > 0 || nextOrders.length > 0
  const hasAnyWeights = todayTotalGrams > 0 || nextTotalGrams > 0

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
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

        {loading ? (
          <div className="flex items-center justify-center py-20 text-bark-800/40">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <div className="space-y-6">

            {/* ── TODAY'S DOUGH ─────────────────────────────────────────── */}
            <DoughSection
              title="TODAY'S DOUGH" subtitle={todayDisplay}
              orderCount={todayOrders.length} totalGrams={todayTotalGrams}
              weights={todayWeights} missing={todayMissing}
              expanded={expandedToday}
              onToggle={id => setExpandedToday(prev => toggle(prev, id))}
              headerColor="#6B5744"
            />

            {/* ── NEXT DAY DOUGH ────────────────────────────────────────── */}
            <DoughSection
              title="NEXT DAY DOUGH" subtitle={nextDisplay}
              orderCount={nextOrders.length} totalGrams={nextTotalGrams}
              weights={nextWeights} missing={nextMissing}
              expanded={expandedNext}
              onToggle={id => setExpandedNext(prev => toggle(prev, id))}
              headerColor="#4A6355"
            />

            {/* ── PRE-FERMENTS ──────────────────────────────────────────── */}
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

            {/* ── BIN BREAKDOWN ─────────────────────────────────────────── */}
            {hasAnyWeights && (
              <div className="card overflow-hidden">
                <div className="px-5 py-3" style={{ backgroundColor: '#5A4A6B' }}>
                  <h2 className="font-display text-white text-lg tracking-wide">BIN BREAKDOWN</h2>
                  <p className="text-white/70 text-xs font-mono">Container counts from Today's adjusted kg</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="bg-cream-50 border-b border-wheat-400/20">
                        <th className="px-3 py-2.5 text-left text-[10px] font-mono uppercase tracking-wider text-bark-800/50 w-28">Container</th>
                        {['RYE','MULTI','MILK BREAD','BRIOCHE','POOLISH','BAG / FOCA','BOULE','SEMOLINA'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-center text-[10px] font-mono uppercase tracking-wider text-bark-800/50">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Row 1: bins / brioche / baguettes */}
                      <tr className="border-b border-wheat-400/10">
                        <td className="px-3 py-2 text-xs font-mono text-bark-800/50">bins / baguettes</td>
                        <Cell value={binRow14.rye} />
                        <Cell value={binRow14.multi} />
                        <Cell value={binRow14.milk} />
                        <td className="px-3 py-2 text-center text-xs font-mono text-bark-800/25">—</td>
                        <Cell value={poolish > 0 ? parseFloat((poolish * 0.376 / 20).toFixed(1)) : 0} />
                        <Cell value={bag > 0 ? parseFloat((bag / 20).toFixed(1)) : 0} />
                        <Cell value={binRow14.boule} />
                        <Cell value={binRow14.sem} />
                      </tr>
                      {/* Row 2: lexans / small ciabatta / demi */}
                      <tr className="border-b border-wheat-400/10 bg-cream-50/50">
                        <td className="px-3 py-2 text-xs font-mono text-bark-800/50">lexans / sm. ciab.</td>
                        <Cell value={binRow16.rye} />
                        <Cell value={binRow16.multi} />
                        <td className="px-3 py-2 text-center text-xs font-mono text-bark-800/25">—</td>
                        <td className="px-3 py-2 text-center text-xs font-mono text-bark-800/25">—</td>
                        <Cell value={poolish > 0 ? parseFloat((poolish / 48).toFixed(1)) : 0} />
                        <Cell value={bag > 0 ? parseFloat((bag / 20).toFixed(1)) : 0} />
                        <td className="px-3 py-2 text-center" />
                        <td className="px-3 py-2 text-center" />
                      </tr>
                      {/* Row 3: buns / pullmans / ciabatta / rolls */}
                      <tr className="border-b border-wheat-400/10">
                        <td className="px-3 py-2 text-xs font-mono text-bark-800/50">buns / ciabatta</td>
                        <td className="px-3 py-2 text-center" />
                        <td className="px-3 py-2 text-center" />
                        <Cell value={binRow16.milk} />
                        <td className="px-3 py-2 text-center text-xs font-mono text-bark-800/25">—</td>
                        <Cell value={poolish > 0 ? parseFloat((poolish / 20).toFixed(1)) : 0} />
                        <Cell value={bag > 0 ? parseFloat((bag * 0.5).toFixed(1)) : 0} />
                        <td className="px-3 py-2 text-center" />
                        <td className="px-3 py-2 text-center" />
                      </tr>
                      {/* Row 4: pullmans / large ciabatta / foca+pullmans */}
                      <tr className="border-b border-wheat-400/10 bg-cream-50/50">
                        <td className="px-3 py-2 text-xs font-mono text-bark-800/50">pullmans / lg. ciab.</td>
                        <td className="px-3 py-2 text-center" />
                        <td className="px-3 py-2 text-center" />
                        <Cell value={binRow15.milk} />
                        <td className="px-3 py-2 text-center text-xs font-mono text-bark-800/25">—</td>
                        <Cell value={poolish > 0 ? parseFloat((poolish / 20).toFixed(1)) : 0} />
                        <Cell value={bag > 0 ? parseFloat((bag * 0.5).toFixed(1)) : 0} />
                        <td className="px-3 py-2 text-center" />
                        <td className="px-3 py-2 text-center" />
                      </tr>
                      {/* Row 5: demi baguettes (poolish only) */}
                      <tr>
                        <td className="px-3 py-2 text-xs font-mono text-bark-800/50">demi baguettes</td>
                        <td className="px-3 py-2 text-center" /><td className="px-3 py-2 text-center" />
                        <td className="px-3 py-2 text-center" /><td className="px-3 py-2 text-center" />
                        <Cell value={poolish > 0 ? parseFloat((poolish / 20).toFixed(1)) : 0} />
                        <td className="px-3 py-2 text-center" /><td className="px-3 py-2 text-center" /><td className="px-3 py-2 text-center" />
                      </tr>
                    </tbody>
                    {/* Adjusted kg footer */}
                    <tfoot>
                      <tr className="border-t-2 border-wheat-400/30 bg-cream-100">
                        <td className="px-3 py-2.5 text-xs font-mono text-bark-800/60 font-semibold uppercase">Adj. kg</td>
                        {([rye, multi, milk, brioche, poolish, bag, boule, sem] as number[]).map((v, i) => (
                          <td key={i} className="px-3 py-2.5 text-center font-mono font-bold text-bark-900 text-sm">
                            {v > 0 ? v : <span className="text-bark-800/25">—</span>}
                            {v > 0 && <span className="text-bark-800/40 text-xs font-normal ml-0.5">kg</span>}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── GUIDE ────────────────────────────────────────────────── */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 bg-bark-900/80">
                <h2 className="font-display text-white text-lg tracking-wide">GUIDE</h2>
                <p className="text-white/70 text-xs font-mono">Container types by dough category</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="bg-cream-50 border-b border-wheat-400/20">
                      {['RYE','MULTI','MILK BREAD','BRIOCHE','POOLISH','BAG / FOCACCIA','BOULE','SEMOLINA'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-center text-[10px] font-mono uppercase tracking-wider text-bark-800/50">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['bins',         'bins',    'bins',         'brioche',   'baguettes',     'baguettes',       '',  ''],
                      ['',             '',        'lexans',       '',          'small ciabatta', 'demi',            '',  ''],
                      ['lexans',       'lexans',  'buns',         'pullmans',  'ciabatta',       'rolls',           '',  ''],
                      ['',             '',        'pullmans',     '',          'large ciabatta', 'foca, pullmans',  '',  ''],
                      ['',             '',        '',             '',          'demi baguettes', '',                '',  ''],
                    ].map((row, ri) => (
                      <tr key={ri} className={`border-b border-wheat-400/10 last:border-0 ${ri % 2 === 1 ? 'bg-cream-50/40' : ''}`}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-center text-xs font-mono text-bark-800/70">
                            {cell || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>
    </AppShell>
  )
}
