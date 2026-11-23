// Labor Intelligence — standards, math and Gusto file reader.
// Pure functions only (no Firebase), so the Forecast and Daily Performance views
// always use exactly the same calculations.
import { addDays, format, getDay, parseISO } from 'date-fns'
import type { Customer, Order } from '@/types'
import type { DaySnapshot } from './kpi'
import { planOven, type Family, type OvenPlan, type PlanItem } from './oven'

// ─── STANDARDS ────────────────────────────────────────────────────────────────
export type ShapeClass = 'bun' | 'hoagie' | 'ciabatta' | 'baguette' | 'batard' | 'pullman' | 'sicilian' | 'other'

export const SHAPE_CLASS_LABELS: Record<ShapeClass, string> = {
  bun: 'Buns / Rolls',
  hoagie: 'Hoagies',
  ciabatta: 'Ciabatta',
  baguette: 'Baguettes',
  batard: 'Batards & Boules',
  pullman: 'Pullman / Loaf',
  sicilian: 'Sicilian',
  other: 'Other (not defined)',
}

export interface LaborStandards {
  invoiceMin: number              // minutes of packing per invoice
  freshDirectExtraMin: number     // extra minutes per FreshDirect invoice
  thickSliceMin: number           // minutes per thick-sliced unit (45 s)
  regularSliceMin: number         // minutes per regular-sliced unit (20 s)
  bunSliceMin: number             // minutes per bun-sliced unit (4 s)
  workcellFactor: number          // touch hours -> workcell hours
  shapeCoefficients: Record<ShapeClass, number> // hours per unit
  excludedCustomers: string[]     // customers left out of invoices and revenue
  effGreen: number                // efficiency % at or above = green
  effAmber: number                // efficiency % at or above = amber, below = red
  shiftHours: number              // used for "suggested people"
  grossMarginPct: number          // 100 - COGS %
  mixKgPerHour: number            // dough kg one mix hour should produce
  rackRacksPerHour: number        // racks the rack oven should clear per oven hour
  deckUnitsPerHour: number        // loaves the deck oven should clear per oven hour
  defaultHourlyRate: number       // $/hour for anyone on the roster with no rate of their own
  // Dashboard targets (starting values, edit on the Standards tab)
  cplhGreen: number               // CPLH ($ net contribution per labor hour) at or above = green
  cplhAmber: number
  prodCplhGreen: number           // production CPLH (excludes pack hours)
  prodCplhAmber: number
  laborPctGreen: number           // labor % of revenue at or below = green
  laborPctAmber: number           // at or below = amber, above = red
  netPctGreen: number             // net contribution % at or above = green
  netPctAmber: number
  avgInvoiceGreen: number
  avgInvoiceAmber: number
  challah6Price: number           // $ each, sold without an order (counted from David's page)
  challah3Price: number
  sicilianPrice: number
  farmersMarketRevenue: number    // direct sales on a market day, not invoiced (Westhampton Beach FM)
  marketCustomers: string[]       // an order from one of these means it was a market day
  zeroPriceOk: string[]           // customers whose $0 order lines are expected (no warning)
  ovenTurnaroundMin: number       // load + unload minutes added to every rack
  eggWashMinPerRack: number       // handling minutes per rack (measure with David; 0 until then)
  seedMinPerRack: number
  depanMinPerRack: number
  groupMinutes: Record<string, number>   // overrides of the bake guide times, by oven group id
  ovenCsvUrls: string[]           // published-to-web CSV links of the crew's oven log tabs
}

// Defaults come from the Robinson Foods Daily KPI Analysis SOP.
export const DEFAULT_STANDARDS: LaborStandards = {
  invoiceMin: 18,
  freshDirectExtraMin: 18,
  thickSliceMin: 0.75,
  regularSliceMin: 0.333,
  bunSliceMin: 0.067,
  workcellFactor: 2.11,
  shapeCoefficients: {
    bun: 0.0022,
    hoagie: 0.0033,
    ciabatta: 0.0042,
    baguette: 0.005,
    batard: 0.0069,
    pullman: 0.0056,
    sicilian: 0.0111,
    other: 0.0056,
  },
  excludedCustomers: ['fini pizza', 'ben e. keith', 'ben e keith'],
  effGreen: 100,
  effAmber: 85,
  shiftHours: 8,
  grossMarginPct: 67.5,
  // Starting points taken from the 2026 KPI sheet and production logs. Edit on the Standards tab.
  mixKgPerHour: 350,
  rackRacksPerHour: 3,
  deckUnitsPerHour: 65,
  defaultHourlyRate: 15.5,
  cplhGreen: 45,
  cplhAmber: 35,
  prodCplhGreen: 60,
  prodCplhAmber: 45,
  laborPctGreen: 18,
  laborPctAmber: 20,
  netPctGreen: 48,
  netPctAmber: 42,
  avgInvoiceGreen: 180,
  avgInvoiceAmber: 130,
  challah6Price: 250,
  challah3Price: 95,
  sicilianPrice: 3.56,
  farmersMarketRevenue: 600,
  marketCustomers: ['westhampton market'],
  zeroPriceOk: ['sample', 'westhampton market', 'fini', 'kelly - challah'],
  ovenTurnaroundMin: 6,
  eggWashMinPerRack: 0,
  seedMinPerRack: 0,
  depanMinPerRack: 0,
  groupMinutes: {},
  ovenCsvUrls: [
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVQ_gQgRkkBHHTcwBiNjm_DTnDRYuAvLEgwrB6L410owJv7W9T-C5qfmb0dxzsT-T96Giju8XiTtOj/pub?gid=1697399393&single=true&output=csv',
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVQ_gQgRkkBHHTcwBiNjm_DTnDRYuAvLEgwrB6L410owJv7W9T-C5qfmb0dxzsT-T96Giju8XiTtOj/pub?gid=2139126121&single=true&output=csv',
  ],
}

export function mergeStandards(saved: Partial<LaborStandards> | null | undefined): LaborStandards {
  const s = saved || {}
  return {
    ...DEFAULT_STANDARDS,
    ...s,
    shapeCoefficients: { ...DEFAULT_STANDARDS.shapeCoefficients, ...(s.shapeCoefficients || {}) },
    groupMinutes: { ...(s.groupMinutes || {}) },
    ovenCsvUrls: Array.isArray(s.ovenCsvUrls) && s.ovenCsvUrls.length ? s.ovenCsvUrls : DEFAULT_STANDARDS.ovenCsvUrls,
  }
}

// ─── DATES ────────────────────────────────────────────────────────────────────
// Hours belong to the production date. Revenue and orders belong to the delivery
// date, which is the next day (Saturday production covers Sunday AND Monday).
export function deliveryDatesFor(productionDate: string): string[] {
  const d = parseISO(productionDate)
  const first = format(addDays(d, 1), 'yyyy-MM-dd')
  if (getDay(d) === 6) return [first, format(addDays(d, 2), 'yyyy-MM-dd')]
  return [first]
}

export function weekStartMonday(isoDate: string): string {
  const d = parseISO(isoDate)
  const dow = getDay(d) // 0 Sun .. 6 Sat
  const back = dow === 0 ? 6 : dow - 1
  return format(addDays(d, -back), 'yyyy-MM-dd')
}

// ─── CLASSIFIERS ──────────────────────────────────────────────────────────────
export function shapeClassOf(productName: string): ShapeClass {
  const n = (productName || '').toLowerCase()
  if (/sicilian|scilian/.test(n)) return 'sicilian'
  if (/ciabatta/.test(n)) return 'ciabatta'
  if (/baguette/.test(n)) return 'baguette'
  if (/hoagie|hero/.test(n)) return 'hoagie'
  if (/batard|boule/.test(n)) return 'batard'
  if (/pullman|loaf|sandwich/.test(n)) return 'pullman'
  if (/\b(bun|buns|roll|rolls|slider|sliders|twist)\b/.test(n)) return 'bun'
  return 'other'
}

export function isBunProduct(productName: string): boolean {
  return /\b(bun|buns|roll|rolls|slider|sliders)\b/i.test(productName || '')
}

type SliceBucket = 'thick' | 'regular' | 'bun' | null

export function sliceBucketOf(slicing: string, productName: string): SliceBucket {
  const s = (slicing || '').trim()
  const name = productName || ''
  // Products that are already pre-sliced by name, e.g. "Large Batard (TH Sliced)"
  const forced: SliceBucket =
    /thick sliced|th sliced/i.test(name) ? 'thick' : /\bsliced\b/i.test(name) ? 'regular' : null
  let bucket: SliceBucket = null
  if (s === 'TH Sliced' || s === '1" Sliced') bucket = 'thick'
  else if (s === 'Sliced') bucket = 'regular'
  else if (s === 'No Slice') return null
  bucket = bucket || forced
  if (bucket === 'regular' && isBunProduct(name)) return 'bun'
  return bucket
}

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchesAny(haystacks: string[], needles: string[]): boolean {
  const hs = haystacks.map(norm)
  return needles.map(norm).filter(Boolean).some(nd => hs.some(h => h.includes(nd)))
}

/** True when the name contains any of the listed words (case and punctuation ignored). */
export function isNameIn(name: string, list: string[]): boolean {
  return matchesAny([name], list || [])
}

export function isExcludedCustomer(customerName: string, standards: LaborStandards): boolean {
  return matchesAny([customerName], standards.excludedCustomers)
}

// FreshDirect is simply the client named "FreshDirect".
export function isFreshDirect(customerName: string, customer: Customer | undefined): boolean {
  return matchesAny([customerName, customer?.name || ''], ['freshdirect', 'fresh direct'])
}

// ─── REVENUE ──────────────────────────────────────────────────────────────────
export interface RevenueResult { revenue: number; invoices: number; avgInvoice: number }

export function computeRevenue(orders: Order[], standards: LaborStandards): RevenueResult {
  let revenue = 0
  let invoices = 0
  orders.forEach(o => {
    if (o.status === 'cancelled') return
    if (isExcludedCustomer(o.customerName, standards)) return
    const items = (o.items || []).filter(i => i.quantity > 0)
    if (!items.length) return
    invoices += 1
    revenue += items.reduce((s, i) => s + i.quantity * (i.unitPrice || 0), 0)
  })
  return { revenue, invoices, avgInvoice: invoices ? revenue / invoices : 0 }
}

// ─── PACKING ──────────────────────────────────────────────────────────────────
export interface PackResult {
  invoices: number
  freshDirectInvoices: number
  thickUnits: number
  regularUnits: number
  bunUnits: number
  invoiceMinutes: number
  freshDirectMinutes: number
  thickMinutes: number
  regularMinutes: number
  bunMinutes: number
  sliceMinutes: number
  expectedMinutes: number
  expectedHours: number
  sdi: number // slice-dominance index = slice minutes / expected pack minutes
}

export function computePack(orders: Order[], customers: Customer[], standards: LaborStandards): PackResult {
  const byId = new Map(customers.map(c => [c.id, c]))
  let invoices = 0, fd = 0, thick = 0, regular = 0, bun = 0
  orders.forEach(o => {
    if (o.status === 'cancelled') return
    if (isExcludedCustomer(o.customerName, standards)) return
    const items = (o.items || []).filter(i => i.quantity > 0)
    if (!items.length) return
    invoices += 1
    if (isFreshDirect(o.customerName, byId.get(o.customerId))) fd += 1
    items.forEach(i => {
      const b = sliceBucketOf(i.slicing, i.productName)
      if (b === 'thick') thick += i.quantity
      else if (b === 'regular') regular += i.quantity
      else if (b === 'bun') bun += i.quantity
    })
  })
  const invoiceMinutes = invoices * standards.invoiceMin
  const freshDirectMinutes = fd * standards.freshDirectExtraMin
  const thickMinutes = thick * standards.thickSliceMin
  const regularMinutes = regular * standards.regularSliceMin
  const bunMinutes = bun * standards.bunSliceMin
  const sliceMinutes = thickMinutes + regularMinutes + bunMinutes
  const expectedMinutes = invoiceMinutes + freshDirectMinutes + sliceMinutes
  return {
    invoices, freshDirectInvoices: fd,
    thickUnits: thick, regularUnits: regular, bunUnits: bun,
    invoiceMinutes, freshDirectMinutes, thickMinutes, regularMinutes, bunMinutes,
    sliceMinutes, expectedMinutes,
    expectedHours: expectedMinutes / 60,
    sdi: expectedMinutes ? sliceMinutes / expectedMinutes : 0,
  }
}

// ─── SHAPING ──────────────────────────────────────────────────────────────────
// Sourdough products that David counts on the Mix Log ("What was made"): boules, batards, large batard, 4" boule.
export function isSourdoughShaped(p: { name?: string; category?: string } | undefined, fallbackName = ''): boolean {
  const name = p?.name || fallbackName || ''
  return (!p || p.category === 'BOULE') && /sourdough|large batard|4"\s*boule/i.test(name)
}

// Sicilians are made ahead and held in the fridge, so their labor comes only from David's count,
// never from the day's orders.
export function isSicilianName(name: string): boolean {
  return /sicilian|scilian/i.test(name || '')
}

export const SHAPE_CLASSES: ShapeClass[] = ['bun', 'hoagie', 'ciabatta', 'baguette', 'batard', 'pullman', 'sicilian', 'other']

// Production that has no invoice (so it is not an order), entered per day.
export interface ExtraItem { id: string; project: string; cls: ShapeClass; units: number }
export const EXTRA_PRESETS: { project: string; cls: ShapeClass }[] = [
  { project: 'Fini Sicilians', cls: 'sicilian' },
  { project: 'Ben E. Keith par-bake batards', cls: 'batard' },
  { project: 'JetBlue slider rolls', cls: 'bun' },
]

// productId -> the shape type you chose for it (overrides the automatic guess)
export type ShapeMap = Record<string, ShapeClass>

export interface ShapeClassRow { cls: ShapeClass; label: string; units: number; coefficient: number; hours: number }
export interface ExtraRow { id: string; project: string; cls: ShapeClass; label: string; units: number; hours: number }
export interface ShapeResult {
  sourOrdered: number          // sourdough units on the orders that were replaced by David's actual count (0 if none)
  sourActual: number | null    // David's actual sourdough pieces, when he logged any
  rows: ShapeClassRow[]        // from orders only
  extraRows: ExtraRow[]        // non-invoiced production
  orderUnits: number
  extraUnits: number
  totalUnits: number           // orders + extra
  orderTouchHours: number
  extraTouchHours: number
  touchHours: number           // total
  orderWorkcellHours: number
  extraWorkcellHours: number
  workcellHours: number        // total (this is the expected shaping figure)
  otherProducts: string[]      // products that fell into "Other" so you can review them
}

export function computeShape(
  orders: Order[],
  products: { id: string; name: string; category?: string; isSchripps?: boolean }[],
  standards: LaborStandards,
  overrides: ShapeMap = {},
  extra: ExtraItem[] = [],
  sourActual: number | null = null,
): ShapeResult {
  const byId = new Map(products.map(p => [p.id, p]))
  let sourOrdered = 0
  const units: Record<ShapeClass, number> = { bun: 0, hoagie: 0, ciabatta: 0, baguette: 0, batard: 0, pullman: 0, sicilian: 0, other: 0 }
  const otherNames = new Set<string>()
  orders.forEach(o => {
    if (o.status === 'cancelled') return
    ;(o.items || []).forEach(i => {
      if (i.quantity <= 0) return
      const p = byId.get(i.productId)
      if (p?.isSchripps) return // sourced from Schripps, not shaped here
      const name = p?.name || i.productName
      // David's actual sourdough count replaces the ordered sourdough units
      if (sourActual !== null && isSourdoughShaped(p, name)) { sourOrdered += i.quantity; return }
      const cls = overrides[i.productId] || shapeClassOf(name)
      if (cls === 'sicilian') return // labor comes from David's count (see isSicilianName)
      units[cls] += i.quantity
      if (cls === 'other') otherNames.add(name)
    })
  })
  if (sourActual !== null) units.batard += sourActual
  const rows: ShapeClassRow[] = SHAPE_CLASSES.map(cls => {
    const coefficient = standards.shapeCoefficients[cls]
    return { cls, label: SHAPE_CLASS_LABELS[cls], units: units[cls], coefficient, hours: units[cls] * coefficient }
  })
  const extraRows: ExtraRow[] = extra
    .filter(x => x.units > 0)
    .map(x => ({
      id: x.id, project: x.project, cls: x.cls, label: SHAPE_CLASS_LABELS[x.cls], units: x.units,
      hours: x.units * standards.shapeCoefficients[x.cls],
    }))
  const orderTouch = rows.reduce((s, r) => s + r.hours, 0)
  const extraTouch = extraRows.reduce((s, r) => s + r.hours, 0)
  const orderUnits = rows.reduce((s, r) => s + r.units, 0)
  const extraUnits = extraRows.reduce((s, r) => s + r.units, 0)
  const f = standards.workcellFactor
  return {
    sourOrdered, sourActual,
    rows, extraRows,
    orderUnits, extraUnits, totalUnits: orderUnits + extraUnits,
    orderTouchHours: orderTouch, extraTouchHours: extraTouch, touchHours: orderTouch + extraTouch,
    orderWorkcellHours: orderTouch * f, extraWorkcellHours: extraTouch * f, workcellHours: (orderTouch + extraTouch) * f,
    otherProducts: Array.from(otherNames).sort(),
  }
}

// ─── MIXING & BAKING ──────────────────────────────────────────────────────────
// Pretzels and anything from Schripps are made by a different team, so they never
// count toward our labor.
export function isOutsideTeamProduct(p: { name?: string; category?: string; isSchripps?: boolean } | undefined, fallbackName = ''): boolean {
  const name = (p?.name || fallbackName || '').toLowerCase()
  return !!p?.isSchripps || p?.category === 'SCHRIPPS' || p?.category === 'PRETZEL' || /pretzel|schripps/.test(name)
}

// Same rules as the Bake Sheet: these are baked in the deck oven. Everything else is rack oven.
export function isDeckProduct(p: { name: string; category?: string }): boolean {
  const n = (p.name || '').toLowerCase()
  if (p.category === 'BOULE') return true
  if (p.category === 'MULTIGRAIN' && /batard/.test(n)) return true
  if (p.category === 'SEMOLINA' && (/batard/.test(n) || n.trim() === 'semolina')) return true
  if (/24\s*("|in|inch)?\s*italian\s+baguette/.test(n)) return true
  if (/ciabatta/.test(n) && /\blarge\b/.test(n)) return true
  return false
}

// Max units per rack (from the Rack Benchmarks tab of your KPI sheet). null = not defined.
export function rackCapacityOf(productName: string): number | null {
  const n = (productName || '').toLowerCase()
  if (/parker/.test(n)) return 768
  if (/sicilian|scilian/.test(n)) return 18
  if (/focaccia/.test(n)) return 18
  if (/ciabatta/.test(n)) return 108
  if (/hoagie|hero/.test(n)) return 108
  if (/baguette/.test(n)) return /24/.test(n) ? 90 : 180
  if (/pullman|loaf|sandwich/.test(n)) return /small|peque/.test(n) ? 48 : 24
  if (/\b(bun|buns|roll|rolls|slider|sliders)\b/.test(n)) return 216
  return null
}

// Extra production (no invoice) -> oven group and units per rack.
const EXTRA_RACK_GROUP: Record<ShapeClass, { group: string; cap: number; family?: Family } | null> = {
  bun: { group: 'bun_360', cap: 216, family: 'brioche' }, hoagie: { group: 'bun_440', cap: 108 }, ciabatta: { group: 'bun_440', cap: 108 },
  baguette: { group: 'baguette_440', cap: 90 }, batard: null, pullman: { group: 'pullman_l_360', cap: 24, family: 'milk' },
  sicilian: { group: 'sicilian_440', cap: 18 }, other: null,
}

export interface MixBakeResult {
  mixKg: number                 // planned dough kg from orders (unit weight x quantity)
  mixHours: number              // planned kg / standard kg per mix hour
  missingWeights: string[]      // products with no unit weight, so not in the kg total
  deckUnits: number
  deckHours: number
  rackUnits: number
  rackEquivalents: number       // racks needed (rounded up within each bake group)
  rackHours: number             // oven time: racks x (bake time + turnaround), summed over groups
  ovenPlan: OvenPlan
  handlingHours: number         // egg wash, seeding and depanning (0 until minutes per rack are set)
  unclassified: string[]        // rack products with no rack capacity, left out of rack hours
  outsideUnits: number          // pretzel / Schripps units, left out of everything
}

export function computeMixBake(
  orders: Order[],
  products: { id: string; name: string; category?: string; unitWeight?: number; isSchripps?: boolean }[],
  standards: LaborStandards,
  extra: ExtraItem[] = [],
): MixBakeResult {
  const byId = new Map(products.map(p => [p.id, p]))
  let grams = 0, deckUnits = 0, outside = 0
  const rackItems: PlanItem[] = []
  const missing = new Set<string>()
  const unclassified = new Set<string>()
  orders.forEach(o => {
    if (o.status === 'cancelled') return
    ;(o.items || []).forEach(i => {
      if (i.quantity <= 0) return
      const p = byId.get(i.productId)
      const name = p?.name || i.productName
      if (isOutsideTeamProduct(p, name)) { outside += i.quantity; return }
      if (isSicilianName(name)) return // labor comes from David's count (see isSicilianName)
      if (p?.unitWeight) grams += i.quantity * p.unitWeight
      else missing.add(name)
      if (isDeckProduct({ name, category: p?.category })) { deckUnits += i.quantity; return }
      rackItems.push({ name, category: p?.category, units: i.quantity })
    })
  })
  // Production with no invoice (Fini Sicilians, par-bake batards, slider rolls...)
  extra.forEach(x => {
    if (!(x.units > 0)) return
    if (x.cls === 'batard') { deckUnits += x.units; return }
    const g = EXTRA_RACK_GROUP[x.cls]
    if (g) rackItems.push({ name: x.project || 'Extra production', units: x.units, group: g.group, cap: g.cap, family: g.family })
    else unclassified.add(x.project || 'Extra production')
  })
  const plan = planOven(rackItems, standards)
  plan.unclassified.forEach(u => unclassified.add(u))
  const mixKg = grams / 1000
  return {
    mixKg,
    mixHours: standards.mixKgPerHour > 0 ? mixKg / standards.mixKgPerHour : 0,
    missingWeights: Array.from(missing).sort(),
    deckUnits,
    deckHours: standards.deckUnitsPerHour > 0 ? deckUnits / standards.deckUnitsPerHour : 0,
    rackUnits: plan.units,
    rackEquivalents: plan.racks,
    rackHours: plan.ovenMinutes / 60,
    ovenPlan: plan,
    handlingHours: plan.handling.minutes / 60,
    unclassified: Array.from(unclassified).sort(),
    outsideUnits: outside,
  }
}

// ─── DAILY MIX LOG (David logs this on the Production page) ───────────────────
export interface MixPerson { id: string; name: string; start: string; end: string } // "HH:mm"
export interface MixLogDay {
  date: string                         // production date
  people: MixPerson[]
  doughs: Record<string, number>       // dough id -> kg mixed
  shaped?: Record<string, number>      // SHAPED_ITEMS id -> pieces actually made that day
  notes?: string
  updatedAt?: string
}

// Same dough names David uses on his spreadsheet. counts:false = made by another team.
// What David records as actually made, in pieces (units), besides kilos mixed.
export const SHAPED_ITEMS: { id: string; label: string; group: 'sour' | 'other' }[] = [
  { id: 'sour_boule', label: 'Sourdough Boule', group: 'sour' },
  { id: 'sour_large_batard', label: 'Large Batard', group: 'sour' },
  { id: 'sour_seeded_boule', label: 'Seeded Boule', group: 'sour' },
  { id: 'sour_4in_boule', label: '4" Boule', group: 'sour' },
  { id: 'sour_batard', label: 'Sourdough Batard', group: 'sour' },
  { id: 'sicilian', label: 'Sicilian (units)', group: 'other' },
  { id: 'challah_3ft', label: "3' Challah", group: 'other' },
  { id: 'challah_6ft', label: "6' Challah", group: 'other' },
  { id: 'parbake_large_batard', label: 'Par-bake Large Batard', group: 'other' },
  { id: 'jetblue_sliders', label: 'JetBlue Slider Rolls', group: 'other' },
]

// Pieces of sourdough David actually shaped (null when he logged none, so the orders are used instead).
export function sourActualOf(log: MixLogDay | null | undefined): number | null {
  if (!log?.shaped) return null
  const total = SHAPED_ITEMS.filter(i => i.group === 'sour').reduce((s, i) => s + (Number(log.shaped?.[i.id]) || 0), 0)
  return total > 0 ? total : null
}

// David's non-invoiced pieces become "extra production" automatically. Anything typed by hand for the same
// project on the Labor page wins, so nothing is counted twice.
export function autoExtrasFromMixLog(log: MixLogDay | null | undefined, manual: ExtraItem[]): ExtraItem[] {
  const sh = log?.shaped || {}
  const have = (re: RegExp) => manual.some(x => re.test(x.project) && x.units > 0)
  const out: ExtraItem[] = []
  const add = (id: string, project: string, cls: ShapeClass, units: number, skip: boolean) => {
    if (units > 0 && !skip) out.push({ id: `auto-${id}`, project, cls, units })
  }
  add('sicilian', "Sicilians (David's count)", 'sicilian', Number(sh.sicilian) || 0, have(/sicilian/i))
  add('challah3', "3' Challah", 'other', Number(sh.challah_3ft) || 0, have(/challah/i))
  add('challah6', "6' Challah", 'other', Number(sh.challah_6ft) || 0, have(/challah/i))
  add('parbake', 'Par-bake large batard', 'batard', Number(sh.parbake_large_batard) || 0, have(/par.?bake/i))
  add('jetblue', 'JetBlue slider rolls', 'bun', Number(sh.jetblue_sliders) || 0, have(/jetblue/i))
  return out
}

export const MIX_DOUGHS: { id: string; label: string; counts: boolean }[] = [
  { id: 'sourdough', label: 'Sourdough Boule', counts: true },
  { id: 'baguette', label: 'Baguette', counts: true },
  { id: 'semolina', label: 'Semolina', counts: true },
  { id: 'italian', label: 'Italian', counts: true },
  { id: 'brioche', label: 'Brioche', counts: true },
  { id: 'multigrain', label: 'Multigrain', counts: true },
  { id: 'rye', label: 'Rye', counts: true },
  { id: 'milk', label: 'Milk Bread', counts: true },
  { id: 'poolish', label: 'Poolish', counts: true },
  { id: 'sicilian', label: 'Sicilian', counts: true },
  { id: 'nypizza', label: 'NY Pizza', counts: true },
  { id: 'challah', label: 'Challah', counts: true },
  { id: 'white', label: 'White Bread', counts: true },
  { id: 'wholewheat', label: 'Whole Wheat', counts: true },
  { id: 'jetblue', label: 'JetBlue', counts: true },
]

function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

// Hours between start and end. An end earlier than the start means the shift ran past midnight.
export function personHours(p: { start: string; end: string }): number {
  const a = toMinutes(p.start), b = toMinutes(p.end)
  if (a === null || b === null) return 0
  const diff = b >= a ? b - a : b + 1440 - a
  return diff / 60
}

export function mixLogHours(log: MixLogDay | null | undefined): number {
  return (log?.people || []).reduce((s, p) => s + personHours(p), 0)
}

export function mixLogKg(log: MixLogDay | null | undefined): number {
  if (!log) return 0
  return MIX_DOUGHS.filter(d => d.counts).reduce((s, d) => s + (Number(log.doughs?.[d.id]) || 0), 0)
}

// ─── EFFICIENCY ───────────────────────────────────────────────────────────────
// Efficiency = expected / actual. 100% is exactly on standard, above is better.
export function efficiencyPct(expected: number, actual: number): number | null {
  if (!(actual > 0) || !(expected >= 0)) return null
  return (expected / actual) * 100
}

export type EffStatus = 'good' | 'ok' | 'poor' | 'none'
export function efficiencyStatus(pct: number | null, standards: LaborStandards): EffStatus {
  if (pct === null) return 'none'
  if (pct >= standards.effGreen) return 'good'
  if (pct >= standards.effAmber) return 'ok'
  return 'poor'
}

// ─── GUSTO "TIME TRACKING HOURS" FILE ─────────────────────────────────────────
export interface GustoPerson { name: string; title: string; totalHours: number; overtimeHours: number }
export interface GustoParsed { date: string; people: GustoPerson[] }

function cellText(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v instanceof Date) return format(v, 'yyyy-MM-dd')
    if ('result' in v) return cellText((v as any).result)
    if ('text' in v) return cellText((v as any).text)
    if ('richText' in v) return (v as any).richText.map((r: any) => r.text).join('')
    return ''
  }
  return String(v).trim()
}

function toNumber(v: any): number {
  const t = cellText(v)
  if (!t || t === '-') return 0
  const n = parseFloat(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function usDateToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// rows = every row of the first sheet, each an array of cell values.
export function parseGustoHours(rows: any[][]): GustoParsed {
  let date: string | null = null
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const first = cellText(rows[i][0]).toLowerCase()
    if (first === 'date range') {
      const range = cellText(rows[i][1])
      const parts = range.split('-').map(s => s.trim())
      // "10/28/2026-10/28/2026"
      const start = usDateToIso(parts[0] || '')
      const end = usDateToIso(parts[1] || '')
      if (!start || !end) throw new Error(`Could not read the date range ("${range}").`)
      if (start !== end) throw new Error(`This file covers ${start} to ${end}. Please export one day at a time.`)
      date = start
    }
    if (first === 'name' && rows[i].some(c => cellText(c).toLowerCase() === 'total hours')) {
      headerIdx = i
      break
    }
  }
  if (!date) throw new Error('This does not look like a Gusto time-tracking hours file (no date range found).')
  if (headerIdx < 0) throw new Error('Could not find the Name / Total hours table in this file.')

  const header = rows[headerIdx].map(c => cellText(c).toLowerCase())
  const iName = header.indexOf('name')
  const iTitle = header.indexOf('title')
  const iTotal = header.indexOf('total hours')
  const iOT = header.indexOf('overtime')
  const people: GustoPerson[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const name = cellText(rows[i][iName])
    if (!name) break // blank row ends the summary table
    people.push({
      name,
      title: iTitle >= 0 ? cellText(rows[i][iTitle]) : '',
      totalHours: toNumber(rows[i][iTotal]),
      overtimeHours: iOT >= 0 ? toNumber(rows[i][iOT]) : 0,
    })
  }
  if (!people.length) throw new Error('No employees were found in the summary table.')
  return { date, people }
}

// Minimal CSV reader (quoted fields, commas and line breaks inside quotes) so Gusto's CSV export
// can go through the same parser as the .xlsx export. Returns every row as an array of strings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export function nameKey(name: string): string {
  return norm(name)
}

// ─── ROSTER / DAILY RECORD TYPES ──────────────────────────────────────────────
export type LaborDept = 'packaging' | 'production' | 'ignore'
export interface RosterEntry { name: string; dept: LaborDept; rate?: number | null } // rate = $/hour
export type Roster = Record<string, RosterEntry> // key = nameKey(name)

export interface LaborDay {
  date: string // production date
  uploadedAt?: string
  people?: { name: string; hours: number; dept: LaborDept }[]
  totalHours?: number
  packHours?: number
  productionHours?: number
  overtimeHours?: number
  actualWorkcellHours?: number | null
  actualRackHours?: number | null   // rack oven running time, typed from the oven log
  actualDeckHours?: number | null   // deck oven running time, typed from the oven log
  revenueOverride?: number | null
  farmersMarket?: boolean | null    // null/missing = automatic (a market order exists that day)
  extra?: ExtraItem[]
  kpi?: DaySnapshot                 // saved summary of the day's KPI numbers (feeds the KPI Dashboard)
  notes?: { general?: string; packaging?: string; production?: string }
}

export function splitHours(
  people: GustoPerson[],
  roster: Roster,
): { totalHours: number; packHours: number; productionHours: number; overtimeHours: number; unknown: GustoPerson[]; rows: { name: string; hours: number; dept: LaborDept }[] } {
  let pack = 0, prod = 0, ot = 0
  const unknown: GustoPerson[] = []
  const rows: { name: string; hours: number; dept: LaborDept }[] = []
  people.forEach(p => {
    const entry = roster[nameKey(p.name)]
    if (!entry) { unknown.push(p); return }
    rows.push({ name: p.name, hours: p.totalHours, dept: entry.dept })
    if (entry.dept === 'packaging') pack += p.totalHours
    else if (entry.dept === 'production') prod += p.totalHours
    ot += p.overtimeHours
  })
  return { totalHours: pack + prod, packHours: pack, productionHours: prod, overtimeHours: ot, unknown, rows }
}

// ─── LABOR DOLLARS ────────────────────────────────────────────────────────────
// Pay for one day: hours x each person's own rate (or the default rate). People left out are not counted.
export function laborDollars(
  people: { name: string; hours: number; dept: LaborDept }[] | undefined,
  roster: Roster,
  defaultRate: number,
): { total: number; pack: number; production: number } {
  let pack = 0, production = 0
  ;(people || []).forEach(p => {
    if (p.dept === 'ignore') return
    const r = roster[nameKey(p.name)]?.rate
    const rate = typeof r === 'number' && r > 0 ? r : defaultRate
    if (p.dept === 'packaging') pack += p.hours * rate
    else production += p.hours * rate
  })
  return { total: pack + production, pack, production }
}
