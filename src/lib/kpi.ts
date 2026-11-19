// KPI engine: pure functions (no Firebase) shared by the Labor page and the KPI Dashboard.
//
// Definitions (agreed with Stephen):
//   Net contribution = gross contribution - labor $
//   CPLH             = net contribution / total labor hours
//   Production CPLH  = net contribution / (total labor hours - pack hours)
//   Daily view:  gross contribution = revenue x gross margin % (assumption, 67.5%)
//   Weekly view: gross contribution = revenue - distribution - ingredients - packaging (actuals)
import { addDays, format, parseISO } from 'date-fns'
import type { Customer, Order, Product } from '@/types'
import {
  LaborDay, LaborStandards, MixLogDay, Roster, ShapeMap, ExtraItem,
  autoExtrasFromMixLog, computeMixBake, computePack, computeRevenue, computeShape,
  deliveryDatesFor, efficiencyPct, isExcludedCustomer, laborDollars, mixLogHours, mixLogKg, sourActualOf,
} from './labor'
import { INGREDIENT_ROWS, WeekInput, computeKilos } from './ingredients'

const r2 = (n: number) => Math.round(n * 100) / 100

// ─── DISTRIBUTORS ─────────────────────────────────────────────────────────────
export type Distro = 'ALLNP' | 'FS' | 'MRS' | 'OTHER'

export function distroOf(c: Pick<Customer, 'distributor'> | undefined): Distro {
  const d = (c?.distributor || '').trim().toUpperCase()
  if (d === 'ALLNP') return 'ALLNP'
  if (d === 'FS') return 'FS'
  if (d === 'MRS') return 'MRS'
  return 'OTHER' // delivered by us / farmers markets: no distributor fee
}

export interface DistroSettings {
  routePct: Record<string, number>   // ALLNP charge % per route (e.g. B2: 15)
  defaultRoutePct: number            // used for an ALLNP route that is not listed
  allnpFuelPct: number               // ALLNP fuel surcharge, % of ALLNP revenue
  fsPct: number                      // Featherstone, % of invoiced amount
  mrsPct: number                     // MRS, % of invoiced amount
  packagingPct: number               // packaging, % of revenue
  chargebacks: Record<string, number> // week start (Monday) -> ALLNP chargebacks $
}

// Route percentages from the week of 11/09/2026 on the NL-RouteRevenue sheet.
export const DEFAULT_DISTRO: DistroSettings = {
  routePct: { B1: 15, B2: 15, BU2: 15, B6: 16, B9: 20, CT: 16, LI: 18, MID: 17, ND1: 17, NJT: 20, NU1: 15, SB4: 15, ZAB: 17 },
  defaultRoutePct: 17,
  allnpFuelPct: 1,
  fsPct: 25,
  mrsPct: 25,
  packagingPct: 2.5,
  chargebacks: {},
}

export function mergeDistro(saved: Partial<DistroSettings> | null | undefined): DistroSettings {
  const s = saved || {}
  return {
    ...DEFAULT_DISTRO,
    ...s,
    routePct: { ...DEFAULT_DISTRO.routePct, ...(s.routePct || {}) },
    chargebacks: { ...(s.chargebacks || {}) },
  }
}

export const routeKey = (route: string | undefined) => (route || '').trim().toUpperCase()

export interface RevenueSplit {
  revenue: number
  invoices: number
  byDistro: Record<Distro, number>
  byRoute: Record<string, number> // ALLNP routes only
  zeroPriced: { customer: string; product: string }[] // order lines with a quantity but no price
}

export function revenueSplit(orders: Order[], customers: Customer[], standards: LaborStandards): RevenueSplit {
  const byId = new Map(customers.map(c => [c.id, c]))
  const out: RevenueSplit = { revenue: 0, invoices: 0, byDistro: { ALLNP: 0, FS: 0, MRS: 0, OTHER: 0 }, byRoute: {}, zeroPriced: [] }
  const seenZero = new Set<string>()
  orders.forEach(o => {
    if (o.status === 'cancelled') return
    if (isExcludedCustomer(o.customerName, standards)) return
    const items = (o.items || []).filter(i => i.quantity > 0)
    if (!items.length) return
    const amt = items.reduce((s, i) => s + i.quantity * (i.unitPrice || 0), 0)
    // A line with units but no price means revenue is understated. Sample orders are meant to be free.
    if (!/sample/i.test(o.customerName)) {
      items.forEach(i => {
        if (i.unitPrice > 0) return
        const k = `${o.customerName}|${i.productName}`
        if (!seenZero.has(k)) { seenZero.add(k); out.zeroPriced.push({ customer: o.customerName, product: i.productName }) }
      })
    }
    const c = byId.get(o.customerId)
    const d = distroOf(c)
    out.invoices += 1
    out.revenue += amt
    out.byDistro[d] += amt
    if (d === 'ALLNP') {
      const rk = routeKey(c?.route) || '(no route)'
      out.byRoute[rk] = (out.byRoute[rk] || 0) + amt
    }
  })
  return out
}

// ─── DAY SNAPSHOT (saved on laborDays/{date}.kpi) ────────────────────────────
export interface DaySnapshot {
  revenue: number                 // OMS revenue, or the override when one is typed
  invoices: number
  revByDistro: Record<Distro, number>
  revByRoute: Record<string, number>
  totalHours: number
  packHours: number
  prodHours: number
  laborDollars: number
  laborPack: number
  laborProd: number
  expPack: number
  expShape: number
  expMix: number
  expBake: number
  effPct: number | null           // overall efficiency over the departments that have actuals
  mixKg: number
  sourActual: number | null
  extraRevenue: number            // challah and Sicilians counted from David's page (already inside revenue)
  zeroPriced: string[]            // "Customer: product" for order lines with no price
  savedAt?: string
}

export interface DayKpi {
  pack: ReturnType<typeof computePack>
  shape: ReturnType<typeof computeShape>
  rev: ReturnType<typeof computeRevenue>
  split: RevenueSplit
  mixBake: ReturnType<typeof computeMixBake>
  extras: ExtraItem[]
  autoExtras: ExtraItem[]
  extraRevenue: number            // revenue from items that are not on invoices (challah, Sicilians)
  snapshot: DaySnapshot | null    // null until the Gusto hours are uploaded
}

export interface DayInputs {
  orders: Order[]
  customers: Customer[]
  products: Product[]
  standards: LaborStandards
  shapeMap: ShapeMap
  roster: Roster
  day: LaborDay | null
  mixLog: MixLogDay | null
}

export function computeDayKpi(x: DayInputs): DayKpi {
  const manual = x.day?.extra || []
  const autoExtras = autoExtrasFromMixLog(x.mixLog, manual)
  const extras = [...manual, ...autoExtras]
  const sourActual = sourActualOf(x.mixLog)
  const pack = computePack(x.orders, x.customers, x.standards)
  const shape = computeShape(x.orders, x.products, x.standards, x.shapeMap, extras, sourActual)
  const rev = computeRevenue(x.orders, x.standards)
  const split = revenueSplit(x.orders, x.customers, x.standards)
  const mixBake = computeMixBake(x.orders, x.products, x.standards, extras)
  const sh = x.mixLog?.shaped || {}
  const extraRevenue = r2(
    (Number(sh.challah_6ft) || 0) * x.standards.challah6Price +
    (Number(sh.challah_3ft) || 0) * x.standards.challah3Price +
    (Number(sh.sicilian) || 0) * x.standards.sicilianPrice,
  )

  let snapshot: DaySnapshot | null = null
  const day = x.day
  if (day?.uploadedAt) {
    const totalHours = day.totalHours ?? 0
    const packHours = day.packHours ?? 0
    const prodHours = day.productionHours ?? 0
    const labor = laborDollars(day.people, x.roster, x.standards.defaultHourlyRate)
    const override = day.revenueOverride && day.revenueOverride > 0 ? day.revenueOverride : null

    const kgLogged = mixLogKg(x.mixLog)
    const mixKg = kgLogged > 0 ? kgLogged : mixBake.mixKg
    const mixActual = mixLogHours(x.mixLog) > 0 ? mixLogHours(x.mixLog) : null
    const mixExpected = x.standards.mixKgPerHour > 0 ? mixKg / x.standards.mixKgPerHour : 0
    const wc = day.actualWorkcellHours && day.actualWorkcellHours > 0 ? day.actualWorkcellHours : null
    const rack = day.actualRackHours && day.actualRackHours > 0 ? day.actualRackHours : null
    const deck = day.actualDeckHours && day.actualDeckHours > 0 ? day.actualDeckHours : null
    const bakeActual = rack !== null || deck !== null ? (rack ?? 0) + (deck ?? 0) : null
    const bakeExpected = mixBake.rackHours + mixBake.deckHours
    const scope = [
      { e: pack.expectedHours, a: packHours > 0 ? packHours : null },
      { e: shape.workcellHours, a: wc },
      { e: mixExpected, a: mixActual },
      { e: bakeExpected, a: bakeActual },
    ].filter(s => s.a !== null)
    const eff = scope.length
      ? efficiencyPct(scope.reduce((s, c) => s + c.e, 0), scope.reduce((s, c) => s + (c.a as number), 0))
      : null

    snapshot = {
      revenue: r2(override ?? rev.revenue + extraRevenue),
      invoices: rev.invoices,
      revByDistro: {
        ALLNP: r2(split.byDistro.ALLNP), FS: r2(split.byDistro.FS), MRS: r2(split.byDistro.MRS), OTHER: r2(split.byDistro.OTHER + extraRevenue),
      },
      revByRoute: Object.fromEntries(Object.entries(split.byRoute).map(([k, v]) => [k, r2(v)])),
      totalHours: r2(totalHours),
      packHours: r2(packHours),
      prodHours: r2(prodHours),
      laborDollars: r2(labor.total),
      laborPack: r2(labor.pack),
      laborProd: r2(labor.production),
      expPack: r2(pack.expectedHours),
      expShape: r2(shape.workcellHours),
      expMix: r2(mixExpected),
      expBake: r2(bakeExpected),
      effPct: eff === null ? null : r2(eff),
      mixKg: r2(mixKg),
      sourActual,
      extraRevenue,
      zeroPriced: split.zeroPriced.slice(0, 12).map(z => `${z.customer}: ${z.product}`),
    }
  }
  return { pack, shape, rev, split, mixBake, extras, autoExtras, extraRevenue, snapshot }
}

/** True when two snapshots hold the same numbers (savedAt ignored). */
export function sameSnapshot(a: DaySnapshot | null | undefined, b: DaySnapshot | null | undefined): boolean {
  if (!a || !b) return false
  const strip = (s: DaySnapshot) => JSON.stringify({ ...s, savedAt: undefined })
  return strip(a) === strip(b)
}

// ─── DAILY NUMBERS (assumption-based) ─────────────────────────────────────────
export interface DailyNumbers {
  revenue: number
  grossContribution: number
  laborDollars: number
  netContribution: number
  laborPct: number | null
  netPct: number | null
  cplh: number | null
  prodCplh: number | null
}

export function dailyNumbers(s: DaySnapshot, standards: LaborStandards): DailyNumbers {
  const gross = s.revenue * (standards.grossMarginPct / 100)
  const net = gross - s.laborDollars
  const prodDenom = s.totalHours - s.packHours
  return {
    revenue: s.revenue,
    grossContribution: gross,
    laborDollars: s.laborDollars,
    netContribution: net,
    laborPct: s.revenue > 0 ? (s.laborDollars / s.revenue) * 100 : null,
    netPct: s.revenue > 0 ? (net / s.revenue) * 100 : null,
    cplh: s.totalHours > 0 ? net / s.totalHours : null,
    prodCplh: prodDenom > 0 ? net / prodDenom : null,
  }
}

// ─── INGREDIENT COST ──────────────────────────────────────────────────────────
// Marked-up price per kg (the "Marked $/KG" column of the INGR_COST tab). Edit on the dashboard Settings.
export const DEFAULT_PRICES: Record<string, number> = {
  ap: 0.856, hg: 1.065, ww: 1.042, rye: 1.723, semolina: 1.607, sugar: 1.935, salt: 0.631,
  eggs: 3.244, milk: 2.256, malt: 5.893, redyeast: 12.435, goldyeast: 12.188, butter: 9.589,
  margarine: 3.074, canola: 2.295, honey: 6.45, carraway: 5.536, seedmix: 4.516,
  freshyeast: 4.446, oliveoil: 11.964, oilblend: 2.771, kingmidas: 1.036, spelt: 3.152,
}

export function mergePrices(saved: Record<string, number> | null | undefined): Record<string, number> {
  return { ...DEFAULT_PRICES, ...(saved || {}) }
}

/** Tuesday on or after the date (Schripps weeks end on Tuesday). */
export function schrippsWeekEndingFor(date: string): string {
  const d = parseISO(date)
  const fwd = (2 - d.getDay() + 7) % 7
  return format(addDays(d, fwd), 'yyyy-MM-dd')
}

export function weekDatesMon(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd'))
}

/** The Schripps week-ending dates a Monday-Sunday week touches (two of them). */
export function schrippsWeeksFor(weekStart: string): string[] {
  return Array.from(new Set(weekDatesMon(weekStart).map(schrippsWeekEndingFor)))
}

export interface IngredientCostRow { key: string; label: string; qty: number; price: number; cost: number; source: 'mix' | 'count' }
export interface IngredientCost {
  total: number
  rows: IngredientCostRow[]
  daysWithMixLog: number
  missingWeeks: string[]      // Schripps weeks with no typed counts yet (their count rows are left out)
}

/**
 * Cost of ingredients for the 7 production days of a Monday-Sunday week.
 *  - dough-based rows (sugar, salt, malt, honey, carraway, seed mix, spelt): calculated from the Mix Log kilos
 *  - typed rows (flours, eggs, milk, yeast, butter, oils ...): the Schripps week's typed amount spread evenly over its 7 days
 * Supplies (pan spray, boxes, ties ...) are not priced here; packaging is a % of revenue instead.
 */
export function weeklyIngredientCost(
  weekStart: string,
  logs: (MixLogDay | null)[],
  weeks: Record<string, WeekInput | null>,
  prices: Record<string, number>,
  onlyDates?: string[],   // count just these production days (a week that is not finished yet)
): IngredientCost {
  const all = weekDatesMon(weekStart)
  const dates = onlyDates ? all.filter(d => onlyDates.includes(d)) : all
  const kilo = computeKilos(logs.filter((_, i) => dates.includes(all[i])))
  const rows: IngredientCostRow[] = []
  const missing = new Set<string>()
  INGREDIENT_ROWS.forEach(row => {
    const price = prices[row.key]
    if (!price) return
    if (row.kind === 'kilo') {
      const qty = kilo.kilos[row.key] || 0
      if (qty > 0) rows.push({ key: row.key, label: row.label, qty, price, cost: qty * price, source: 'mix' })
    } else if (row.kind === 'count') {
      let qty = 0
      dates.forEach(d => {
        const we = schrippsWeekEndingFor(d)
        const w = weeks[we]
        if (!w) { missing.add(we); return }
        const v = w.counts?.[row.key]
        if (typeof v === 'number') qty += v / 7
      })
      if (qty > 0) rows.push({ key: row.key, label: row.label, qty, price, cost: qty * price, source: 'count' })
    }
  })
  return {
    total: rows.reduce((s, r) => s + r.cost, 0),
    rows,
    daysWithMixLog: kilo.daysWithLog,
    missingWeeks: Array.from(missing).sort(),
  }
}

// ─── WEEKLY ROLL-UP (actuals) ─────────────────────────────────────────────────
export interface DistroCost {
  allnpCharges: number
  allnpFuel: number
  chargebacks: number
  allnp: number
  fs: number
  mrs: number
  total: number
  routes: { route: string; revenue: number; pct: number; charge: number }[]
}

export function weeklyDistribution(snaps: DaySnapshot[], weekStart: string, s: DistroSettings): DistroCost {
  const byRoute: Record<string, number> = {}
  let allnpRev = 0, fsRev = 0, mrsRev = 0
  snaps.forEach(d => {
    allnpRev += d.revByDistro.ALLNP
    fsRev += d.revByDistro.FS
    mrsRev += d.revByDistro.MRS
    Object.entries(d.revByRoute).forEach(([k, v]) => { byRoute[k] = (byRoute[k] || 0) + v })
  })
  const routes = Object.entries(byRoute)
    .map(([route, revenue]) => {
      const pct = s.routePct[route] ?? s.defaultRoutePct
      return { route, revenue, pct, charge: revenue * pct / 100 }
    })
    .sort((a, b) => b.revenue - a.revenue)
  const allnpCharges = routes.reduce((t, r) => t + r.charge, 0)
  const allnpFuel = allnpRev * s.allnpFuelPct / 100
  const chargebacks = s.chargebacks[weekStart] || 0
  const allnp = allnpCharges + allnpFuel - chargebacks
  const fs = fsRev * s.fsPct / 100
  const mrs = mrsRev * s.mrsPct / 100
  return { allnpCharges, allnpFuel, chargebacks, allnp, fs, mrs, total: allnp + fs + mrs, routes }
}

export interface WeekRollup {
  weekStart: string
  daysWithData: number
  revenue: number
  invoices: number
  avgInvoice: number | null
  totalHours: number
  packHours: number
  laborDollars: number
  laborPct: number | null
  distro: DistroCost
  distroPct: number | null
  ingredients: number
  ingredientsPct: number | null
  packaging: number
  grossContribution: number
  netContribution: number
  netPct: number | null
  cplh: number | null
  prodCplh: number | null
  avgEff: number | null
  mixKg: number
}

export function weekRollup(
  weekStart: string,
  snaps: DaySnapshot[],
  ingredients: number,
  settings: DistroSettings,
): WeekRollup {
  const sum = (f: (s: DaySnapshot) => number) => snaps.reduce((t, s) => t + f(s), 0)
  const revenue = sum(s => s.revenue)
  const invoices = sum(s => s.invoices)
  const totalHours = sum(s => s.totalHours)
  const packHours = sum(s => s.packHours)
  const labor = sum(s => s.laborDollars)
  const distro = weeklyDistribution(snaps, weekStart, settings)
  const packaging = revenue * settings.packagingPct / 100
  const gross = revenue - distro.total - ingredients - packaging
  const net = gross - labor
  const effs = snaps.filter(s => s.effPct !== null)
  const prodDenom = totalHours - packHours
  const pct = (n: number) => (revenue > 0 ? (n / revenue) * 100 : null)
  return {
    weekStart,
    daysWithData: snaps.length,
    revenue, invoices,
    avgInvoice: invoices > 0 ? revenue / invoices : null,
    totalHours, packHours,
    laborDollars: labor,
    laborPct: pct(labor),
    distro,
    distroPct: pct(distro.total),
    ingredients,
    ingredientsPct: pct(ingredients),
    packaging,
    grossContribution: gross,
    netContribution: net,
    netPct: pct(net),
    cplh: totalHours > 0 ? net / totalHours : null,
    prodCplh: prodDenom > 0 ? net / prodDenom : null,
    avgEff: effs.length ? effs.reduce((t, s) => t + (s.effPct as number), 0) / effs.length : null,
    mixKg: sum(s => s.mixKg),
  }
}

// ─── TARGETS ──────────────────────────────────────────────────────────────────
export type Status = 'good' | 'ok' | 'poor' | 'none'

export function higherIsBetter(v: number | null, green: number, amber: number): Status {
  if (v === null || !Number.isFinite(v)) return 'none'
  return v >= green ? 'good' : v >= amber ? 'ok' : 'poor'
}
export function lowerIsBetter(v: number | null, green: number, amber: number): Status {
  if (v === null || !Number.isFinite(v)) return 'none'
  return v <= green ? 'good' : v <= amber ? 'ok' : 'poor'
}

export interface KpiStatuses { cplh: Status; prodCplh: Status; laborPct: Status; netPct: Status; avgInvoice: Status }

export function statusesFor(
  v: { cplh: number | null; prodCplh: number | null; laborPct: number | null; netPct: number | null; avgInvoice?: number | null },
  s: LaborStandards,
): KpiStatuses {
  return {
    cplh: higherIsBetter(v.cplh, s.cplhGreen, s.cplhAmber),
    prodCplh: higherIsBetter(v.prodCplh, s.prodCplhGreen, s.prodCplhAmber),
    laborPct: lowerIsBetter(v.laborPct, s.laborPctGreen, s.laborPctAmber),
    netPct: higherIsBetter(v.netPct, s.netPctGreen, s.netPctAmber),
    avgInvoice: higherIsBetter(v.avgInvoice ?? null, s.avgInvoiceGreen, s.avgInvoiceAmber),
  }
}
