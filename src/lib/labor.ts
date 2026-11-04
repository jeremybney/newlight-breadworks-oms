// Labor Intelligence — standards, math and Gusto file reader.
// Pure functions only (no Firebase), so the Forecast and Daily Performance views
// always use exactly the same calculations.
import { addDays, format, getDay, parseISO } from 'date-fns'
import type { Customer, Order } from '@/types'

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
}

export function mergeStandards(saved: Partial<LaborStandards> | null | undefined): LaborStandards {
  const s = saved || {}
  return {
    ...DEFAULT_STANDARDS,
    ...s,
    shapeCoefficients: { ...DEFAULT_STANDARDS.shapeCoefficients, ...(s.shapeCoefficients || {}) },
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
  products: { id: string; name: string; isSchripps?: boolean }[],
  standards: LaborStandards,
  overrides: ShapeMap = {},
  extra: ExtraItem[] = [],
): ShapeResult {
  const byId = new Map(products.map(p => [p.id, p]))
  const units: Record<ShapeClass, number> = { bun: 0, hoagie: 0, ciabatta: 0, baguette: 0, batard: 0, pullman: 0, sicilian: 0, other: 0 }
  const otherNames = new Set<string>()
  orders.forEach(o => {
    if (o.status === 'cancelled') return
    ;(o.items || []).forEach(i => {
      if (i.quantity <= 0) return
      const p = byId.get(i.productId)
      if (p?.isSchripps) return // sourced from Schripps, not shaped here
      const name = p?.name || i.productName
      const cls = overrides[i.productId] || shapeClassOf(name)
      units[cls] += i.quantity
      if (cls === 'other') otherNames.add(name)
    })
  })
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

const EXTRA_RACK_CAPACITY: Record<ShapeClass, number | null> = {
  bun: 216, hoagie: 108, ciabatta: 108, baguette: 90, batard: null, pullman: 24, sicilian: 18, other: null,
}

export interface MixBakeResult {
  mixKg: number                 // planned dough kg from orders (unit weight x quantity)
  mixHours: number              // planned kg / standard kg per mix hour
  missingWeights: string[]      // products with no unit weight, so not in the kg total
  deckUnits: number
  deckHours: number
  rackUnits: number
  rackEquivalents: number       // racks needed
  rackHours: number
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
  let grams = 0, deckUnits = 0, rackUnits = 0, racks = 0, outside = 0
  const missing = new Set<string>()
  const unclassified = new Set<string>()
  orders.forEach(o => {
    if (o.status === 'cancelled') return
    ;(o.items || []).forEach(i => {
      if (i.quantity <= 0) return
      const p = byId.get(i.productId)
      const name = p?.name || i.productName
      if (isOutsideTeamProduct(p, name)) { outside += i.quantity; return }
      if (p?.unitWeight) grams += i.quantity * p.unitWeight
      else missing.add(name)
      if (isDeckProduct({ name, category: p?.category })) { deckUnits += i.quantity; return }
      const cap = rackCapacityOf(name)
      if (cap) { rackUnits += i.quantity; racks += i.quantity / cap } else unclassified.add(name)
    })
  })
  // Production with no invoice (Fini Sicilians, par-bake batards, slider rolls...)
  extra.forEach(x => {
    if (!(x.units > 0)) return
    if (x.cls === 'batard') { deckUnits += x.units; return }
    const cap = EXTRA_RACK_CAPACITY[x.cls]
    if (cap) { rackUnits += x.units; racks += x.units / cap } else unclassified.add(x.project || 'Extra production')
  })
  const mixKg = grams / 1000
  return {
    mixKg,
    mixHours: standards.mixKgPerHour > 0 ? mixKg / standards.mixKgPerHour : 0,
    missingWeights: Array.from(missing).sort(),
    deckUnits,
    deckHours: standards.deckUnitsPerHour > 0 ? deckUnits / standards.deckUnitsPerHour : 0,
    rackUnits,
    rackEquivalents: racks,
    rackHours: standards.rackRacksPerHour > 0 ? racks / standards.rackRacksPerHour : 0,
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
  notes?: string
  updatedAt?: string
}

// Same dough names David uses on his spreadsheet. counts:false = made by another team.
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

export function nameKey(name: string): string {
  return norm(name)
}

// ─── ROSTER / DAILY RECORD TYPES ──────────────────────────────────────────────
export type LaborDept = 'packaging' | 'production' | 'ignore'
export interface RosterEntry { name: string; dept: LaborDept }
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
  extra?: ExtraItem[]
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

// ─── "COPY KPI ROW" (matches the SOP's 55-column KPI sheet, tab separated) ────
export interface KpiRowInput {
  date: string                 // production date, YYYY-MM-DD
  revenue: number
  invoices: number
  totalHours: number | null    // null when no Gusto file has been uploaded
  packHours: number | null
  pack: PackResult
  shape: ShapeResult
  actualWorkcellHours: number | null
  notes: string
  grossMarginPct: number
  mixHours?: number | null         // from the mix log
  mixKg?: number | null            // actual kg if logged, else planned
  rackHours?: number | null
  deckHours?: number | null
  plannedRacks?: number | null
}

function usDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${m}/${d}/${y}`
}

export function buildKpiRow(x: KpiRowInput): string {
  const D = '-'
  const money = (n: number) => n.toFixed(2)
  const num = (n: number, dp = 2) => n.toFixed(dp)
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const haveHours = x.totalHours !== null && x.totalHours > 0
  const havePack = x.packHours !== null && x.packHours > 0
  const wc = x.actualWorkcellHours && x.actualWorkcellHours > 0 ? x.actualWorkcellHours : null
  const expWc = x.shape.workcellHours
  const mixOk = !!x.mixHours && x.mixHours > 0
  const kgOk = !!x.mixKg && x.mixKg > 0
  const rackOk = !!x.rackHours && x.rackHours > 0
  const racksOk = !!x.plannedRacks && x.plannedRacks > 0
  const deckOk = !!x.deckHours && x.deckHours > 0
  const cols: string[] = [
    usDate(x.date),                                                     // 1 Date
    usDate(weekStartMonday(x.date)),                                    // 2 Week Start (Mon)
    money(x.revenue),                                                   // 3 Revenue
    String(x.invoices),                                                 // 4 Invoices
    x.invoices ? money(x.revenue / x.invoices) : D,                     // 5 Avg Invoice
    haveHours ? num(x.totalHours as number) : D,                        // 6 Total Labor Hours
    D, D,                                                               // 7 Total Labor $, 8 Labor %
    money(x.revenue * (x.grossMarginPct / 100)),                        // 9 Gross Contribution
    D, D,                                                               // 10 Net $, 11 Net %
    haveHours ? money(x.revenue / (x.totalHours as number)) : D,        // 12 Aggregate CPLH
    haveHours && havePack && (x.totalHours as number) - (x.packHours as number) > 0
      ? money(x.revenue / ((x.totalHours as number) - (x.packHours as number))) : D, // 13 Production CPLH
    mixOk ? num(x.mixHours as number) : D,                              // 14 Mix Hours
    mixOk && kgOk ? num(x.mixKg as number, 0) : D,                      // 15 Total Mix kg
    mixOk && kgOk ? num((x.mixKg as number) / (x.mixHours as number), 1) : D, // 16 kg per Mix Hour
    mixOk ? money(x.revenue / (x.mixHours as number)) : D,              // 17 Revenue per Mix Hour
    D, D, D, D,                                                         // 18-21 shaping times / shapers
    num(expWc),                                                         // 22 Expected Workcell Hours
    num(x.shape.touchHours),                                            // 23 Expected Touch Hours
    wc !== null ? num(wc) : D,                                          // 24 Actual Workcell Hours
    wc !== null ? num(wc - expWc) : D,                                  // 25 Shape Friction Hours
    wc !== null ? pct(expWc / wc) : D,                                  // 26 Shape Efficiency
    wc !== null ? pct((wc - expWc) / wc) : D,                           // 27 Friction %
    D, D,                                                               // 28 Shaping Mode, 29 Shaping Notes
    D, D,                                                               // 30-31 bake start / end
    rackOk ? num(x.rackHours as number) : D,                            // 32 Bake Window (hrs)
    D,                                                                  // 33 Total Racks
    racksOk ? num(x.plannedRacks as number, 1) : D,                     // 34 Planned Rack Equivalents
    D, D,                                                               // 35 utilization, 36 rack kg
    rackOk && racksOk ? num((x.plannedRacks as number) / (x.rackHours as number), 2) : D, // 37 Racks per Hour
    D, D,                                                               // 38-39 kg per rack, rack kg/hr
    D, D,                                                               // 40-41 bake operator / delay
    D, D,                                                               // 42-43 deck start / end
    deckOk ? num(x.deckHours as number) : D,                            // 44 Deck Bake Window (hrs)
    D, D, D, D, D, D,                                                   // 45-50 deck loads .. kg per hour
    havePack ? num(x.packHours as number) : D,                          // 51 Pack Hours
    havePack && x.revenue > 0 ? num(((x.packHours as number) * 60) / x.revenue, 3) : D, // 52 Pack Density
    havePack ? pct(x.pack.expectedMinutes / ((x.packHours as number) * 60)) : D,        // 53 Pack Efficiency
    pct(x.pack.sdi),                                                    // 54 SDI
    (x.notes || D).replace(/[\t\r\n]+/g, ' '),                          // 55 Notes
  ]
  return cols.join('\t')
}
