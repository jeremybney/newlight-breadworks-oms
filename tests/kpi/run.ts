// Run with: npx tsx tests/kpi/run.ts
import type { Customer, Order } from '../../src/types'
import {
  DEFAULT_DISTRO, DEFAULT_PRICES, DaySnapshot, computeDayKpi, dailyNumbers, distroOf, higherIsBetter, lowerIsBetter,
  mergeDistro, revenueSplit, schrippsWeekEndingFor, schrippsWeeksFor, weekRollup, weeklyDistribution, weeklyIngredientCost,
} from '../../src/lib/kpi'
import {
  DEFAULT_STANDARDS, LaborDay, MixLogDay, autoExtrasFromMixLog, computeMixBake, computeShape, laborDollars, sourActualOf,
} from '../../src/lib/labor'

let pass = 0, fail = 0
function ok(c: boolean, msg: string) { if (c) pass++; else { fail++; console.log('  FAIL', msg) } }
const near = (a: number, b: number, e = 0.005) => Math.abs(a - b) <= e

const S = DEFAULT_STANDARDS
const mk = (id: string, distributor: string, route: string): Customer => ({ id, name: id, distributor, route } as unknown as Customer)
const order = (customerId: string, items: [string, number, number][], extra: Partial<Order> = {}): Order => ({
  id: customerId + Math.random(), customerId, customerName: customerId, status: 'confirmed',
  items: items.map(([productId, quantity, unitPrice]) => ({ productId, productName: productId, category: 'BOULE', quantity, unitPrice, slicing: '' })),
  ...extra,
} as unknown as Order)

console.log('Distributors')
ok(distroOf(mk('a', 'ALLNP', 'B2')) === 'ALLNP' && distroOf(mk('a', 'fs', '')) === 'FS' && distroOf(mk('a', 'MRS', '')) === 'MRS', 'known distributors')
ok(distroOf(mk('a', '', '')) === 'OTHER' && distroOf(undefined) === 'OTHER', 'blank distributor is no fee')

console.log('Revenue split')
const customers = [mk('c1', 'ALLNP', 'b2'), mk('c2', 'ALLNP', 'LI'), mk('c3', 'FS', 'R31'), mk('c4', 'MRS', 'MRS ROUTE 21'), mk('c5', '', ''), mk('fini', 'ALLNP', 'B2')]
const orders = [
  order('c1', [['p', 10, 10]]),                       // 100 on B2 (lower-case route still B2)
  order('c2', [['p', 5, 10]]),                        // 50 on LI
  order('c3', [['p', 4, 25]]),                        // 100 FS
  order('c4', [['p', 2, 50]]),                        // 100 MRS
  order('c5', [['p', 1, 40]]),                        // 40 other
  order('c1', [['p', 99, 99]], { status: 'cancelled' }), // ignored
  order('fini', [['p', 1, 1000]], { customerName: 'Fini Pizza' }), // excluded customer
]
const sp = revenueSplit(orders, customers, S)
ok(near(sp.revenue, 390) && sp.invoices === 5, 'revenue 390 over 5 invoices (cancelled and excluded left out)')
ok(sp.byDistro.ALLNP === 150 && sp.byDistro.FS === 100 && sp.byDistro.MRS === 100 && sp.byDistro.OTHER === 40, 'split by distributor')
ok(sp.byRoute.B2 === 100 && sp.byRoute.LI === 50, 'routes upper-cased')

console.log('Labor dollars')
const roster = { 'jefferson': { name: 'Jefferson', dept: 'production' as const, rate: 18 }, 'ana': { name: 'Ana', dept: 'packaging' as const } }
const ld = laborDollars([
  { name: 'Jefferson', hours: 8, dept: 'production' },
  { name: 'Ana', hours: 6, dept: 'packaging' },
  { name: 'Off', hours: 9, dept: 'ignore' },
], roster, 15.5)
ok(near(ld.total, 8 * 18 + 6 * 15.5) && ld.production === 144 && ld.pack === 93, 'own rate, default rate, ignored people skipped')
ok(laborDollars(undefined, {}, 15.5).total === 0, 'no people -> 0')

console.log('Daily numbers')
const snap = (o: Partial<DaySnapshot> = {}): DaySnapshot => ({
  revenue: 2000, invoices: 10, revByDistro: { ALLNP: 1000, FS: 400, MRS: 100, OTHER: 500 }, revByRoute: { B2: 600, LI: 400 },
  totalHours: 40, packHours: 10, prodHours: 30, laborDollars: 640, laborPack: 160, laborProd: 480,
  expPack: 8, expShape: 10, expMix: 5, expBake: 6, effPct: 90, mixKg: 900, sourActual: null, extraRevenue: 0, zeroPriced: [], ...o,
})
const dn = dailyNumbers(snap(), S)
ok(near(dn.grossContribution, 1350), 'gross = 67.5% of 2000')
ok(near(dn.netContribution, 710), 'net = 1350 - 640')
ok(near(dn.cplh!, 710 / 40) && near(dn.prodCplh!, 710 / 30), 'CPLH = net / hours; production CPLH = net / (hours - pack hours)')
ok(near(dn.laborPct!, 32) && near(dn.netPct!, 35.5), 'labor % and net %')
ok(dailyNumbers(snap({ revenue: 0, totalHours: 0 }), S).cplh === null, 'no hours -> no CPLH')

console.log('ALLNP distribution (week of 11/09/2026 from the NL-RouteRevenue sheet)')
const routes: Record<string, [number, number]> = {
  B1: [1579.94, 15], B2: [8494.3, 15], BU2: [2627.8, 15], B6: [1260.71, 16], B9: [821.97, 20], CT: [1174.57, 16],
  LI: [813.58, 18], MID: [550.4, 17], ND1: [831.44, 17], NJT: [1215.5, 20], NU1: [3232.84, 15], SB4: [804, 15], ZAB: [2096.44, 17],
}
const revByRoute = Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, v[0]]))
const total = Object.values(revByRoute).reduce((a, b) => a + b, 0)
ok(near(total, 25503.49, 0.02), 'route revenue totals $25,503.49')
const wk = weeklyDistribution([snap({ revByDistro: { ALLNP: total, FS: 0, MRS: 0, OTHER: 0 }, revByRoute })], '2026-11-09', DEFAULT_DISTRO)
ok(near(wk.allnpCharges, 4045.72, 0.02), `route charges $4,045.72 (got ${wk.allnpCharges.toFixed(2)})`)
ok(near(wk.allnpFuel, 255.03, 0.02), '1% fuel surcharge $255.03')
ok(near(wk.allnp, 4300.76, 0.03), `total owed $4,300.76 (got ${wk.allnp.toFixed(2)})`)
const wk2 = weeklyDistribution([snap({ revByDistro: { ALLNP: total, FS: 0, MRS: 0, OTHER: 0 }, revByRoute })], '2026-11-09',
  mergeDistro({ chargebacks: { '2026-11-09': 100 } }))
ok(near(wk2.allnp, 4200.76, 0.03), 'chargebacks are subtracted')
const wk3 = weeklyDistribution([snap({ revByDistro: { ALLNP: 100, FS: 200, MRS: 400, OTHER: 0 }, revByRoute: { NEWROUTE: 100 } })], '2026-11-09', DEFAULT_DISTRO)
ok(near(wk3.routes[0].charge, 17) && near(wk3.fs, 50) && near(wk3.mrs, 100), 'unlisted route uses the default %, FS and MRS are 25%')

console.log('Ingredient cost')
ok(schrippsWeekEndingFor('2026-11-09') === '2026-11-10' && schrippsWeekEndingFor('2026-11-10') === '2026-11-10', 'Mon and Tue belong to the week ending Tuesday')
ok(schrippsWeekEndingFor('2026-11-11') === '2026-11-17' && schrippsWeekEndingFor('2026-11-15') === '2026-11-17', 'Wed to Sun belong to the next Tuesday')
ok(schrippsWeeksFor('2026-11-09').join() === '2026-11-10,2026-11-17', 'a Monday week touches two Schripps weeks')
const logs: (MixLogDay | null)[] = [{ date: '2026-11-09', people: [], doughs: { brioche: 100 } }, null, null, null, null, null, null]
const wkA = { counts: { ap: 700 }, fixed: {}, kiloOverrides: {} }
const wkB = { counts: { ap: 1400 }, fixed: {}, kiloOverrides: {} }
const ic = weeklyIngredientCost('2026-11-09', logs, { '2026-11-10': wkA, '2026-11-17': wkB }, DEFAULT_PRICES)
const ap = ic.rows.find(r => r.key === 'ap')!
ok(near(ap.qty, 2 * 100 + 5 * 200, 1e-6), 'AP flour = 2 days of 700/7 + 5 days of 1400/7 = 1200 kg')
ok(near(ap.cost, 1200 * 0.856, 1e-6), 'AP cost uses the marked price')
const sugar = ic.rows.find(r => r.key === 'sugar')!
ok(near(sugar.qty, 8) && near(sugar.cost, 8 * 1.935, 1e-6), 'sugar from the mix log: 100 kg brioche x 8%')
ok(ic.missingWeeks.length === 0, 'no missing weeks')
const icMissing = weeklyIngredientCost('2026-11-09', logs, { '2026-11-10': wkA, '2026-11-17': null }, DEFAULT_PRICES)
ok(icMissing.missingWeeks.join() === '2026-11-17', 'a Schripps week with nothing typed is reported')
const icPartial = weeklyIngredientCost('2026-11-09', logs, { '2026-11-10': wkA, '2026-11-17': wkB }, DEFAULT_PRICES, ['2026-11-09', '2026-11-10'])
ok(near(icPartial.rows.find(r => r.key === 'ap')!.qty, 200, 1e-6), 'a partial week only counts the days that are in')

console.log('Weekly roll-up')
const days = [snap(), snap({ revenue: 3000, laborDollars: 800, totalHours: 50, packHours: 12, effPct: 100 })]
const ru = weekRollup('2026-11-09', days, 500, DEFAULT_DISTRO)
ok(ru.revenue === 5000 && ru.invoices === 20 && near(ru.avgInvoice!, 250), 'revenue, invoices, average invoice')
ok(near(ru.packaging, 125), 'packaging 2.5%')
const expDistro = ru.distro.total
ok(near(ru.grossContribution, 5000 - expDistro - 500 - 125), 'gross = revenue - distribution - ingredients - packaging')
ok(near(ru.netContribution, ru.grossContribution - 1440), 'net = gross - labor')
ok(near(ru.cplh!, ru.netContribution / 90) && near(ru.prodCplh!, ru.netContribution / (90 - 22)), 'weekly CPLH and production CPLH')
ok(near(ru.avgEff!, 95), 'average efficiency')

console.log('Targets')
ok(higherIsBetter(50, 45, 35) === 'good' && higherIsBetter(40, 45, 35) === 'ok' && higherIsBetter(30, 45, 35) === 'poor' && higherIsBetter(null, 45, 35) === 'none', 'higher is better')
ok(lowerIsBetter(17, 18, 20) === 'good' && lowerIsBetter(19, 18, 20) === 'ok' && lowerIsBetter(25, 18, 20) === 'poor', 'lower is better')

console.log("David's actual pieces")
const log: MixLogDay = { date: '2026-11-09', people: [], doughs: {}, shaped: { sour_boule: 60, sour_large_batard: 200, sour_4in_boule: 40, sicilian: 30, challah_3ft: 12, parbake_large_batard: 24, jetblue_sliders: 100 } }
ok(sourActualOf(log) === 300 && sourActualOf({ ...log, shaped: {} }) === null && sourActualOf(null) === null, 'sour total, null when nothing logged')
const auto = autoExtrasFromMixLog(log, [])
ok(auto.length === 4, 'sicilian, 3-foot challah, par-bake, JetBlue (6-foot challah only when entered) -> 4 items: ' + auto.map(a => a.project).join('|'))
ok(autoExtrasFromMixLog(log, [{ id: 'm', project: 'Fini Sicilians', cls: 'sicilian', units: 10 }]).every(a => !/sicilian/i.test(a.project)), 'a hand-typed Sicilian entry wins')
ok(autoExtrasFromMixLog(null, []).length === 0, 'no log -> no extras')

const prods = [
  { id: 'sd', name: 'Large Sourdough Boule (Original)', category: 'BOULE' },
  { id: 'lb', name: 'Large Batard', category: 'BOULE' },
  { id: 'b8', name: '8" Boule', category: 'BOULE' },
  { id: 'mg', name: 'Multigrain Batard', category: 'MULTIGRAIN' },
]
const shapeOrders = [order('c1', [['sd', 100, 5], ['lb', 50, 5], ['b8', 10, 5], ['mg', 20, 5]])]
const planned = computeShape(shapeOrders, prods, S, {}, [], null)
const actual = computeShape(shapeOrders, prods, S, {}, [], 120)
ok(planned.rows.find(r => r.cls === 'batard')!.units === 180, 'no log -> all ordered units count (180)')
ok(actual.rows.find(r => r.cls === 'batard')!.units === 10 + 20 + 120, 'actual sour replaces ordered sourdough, 8" boule and multigrain stay (150)')
ok(actual.sourOrdered === 150 && actual.sourActual === 120, 'reports ordered vs actual')

console.log('Whole day')
const dayRec: LaborDay = {
  date: '2026-11-09', uploadedAt: 'x', totalHours: 14, packHours: 6, productionHours: 8,
  people: [{ name: 'Jefferson', hours: 8, dept: 'production' }, { name: 'Ana', hours: 6, dept: 'packaging' }],
}
const dk = computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: dayRec, mixLog: null })
ok(!!dk.snapshot && near(dk.snapshot!.laborDollars, 237) && dk.snapshot!.revenue === 390, 'snapshot carries revenue and labor $')
ok(computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: null, mixLog: null }).snapshot === null, 'no Gusto hours -> no snapshot')
const withOverride = computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: { ...dayRec, revenueOverride: 5000 }, mixLog: null })
ok(withOverride.snapshot!.revenue === 5000, 'revenue override is used')

console.log('Items sold without an order (challah, Sicilians)')
const sold: MixLogDay = { date: '2026-11-14', people: [], doughs: {}, shaped: { challah_6ft: 2, challah_3ft: 4, sicilian: 100 } }
const dkSold = computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: dayRec, mixLog: sold })
ok(near(dkSold.extraRevenue, 2 * 250 + 4 * 95 + 100 * 3.56), 'extra revenue = 500 + 380 + 356 = 1236')
ok(near(dkSold.snapshot!.revenue, 390 + 1236), 'added to the day revenue')
ok(near(dkSold.snapshot!.revByDistro.OTHER, 40 + 1236) && dkSold.snapshot!.invoices === 5, 'no distributor fee, invoice count unchanged')
ok(computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: dayRec, mixLog: null }).extraRevenue === 0, 'no David entry -> no extra revenue')
ok(computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: { ...dayRec, revenueOverride: 5000 }, mixLog: sold }).snapshot!.revenue === 5000, 'override still wins')

console.log('Order lines with no price')
const zeroOrders = [
  order('c1', [['p', 80, 0]], { customerName: 'Toastieland' }),
  order('c2', [['p', 5, 10]], { customerName: 'Priced' }),
  order('c3', [['p', 3, 0]], { customerName: 'Michelle - Sample' }),
  order('c4', [['p', 3, 0]], { customerName: 'Gone', status: 'cancelled' }),
]
const zr = revenueSplit(zeroOrders, customers, S)
ok(zr.zeroPriced.length === 1 && zr.zeroPriced[0].customer === 'Toastieland', 'flags Toastieland; sample and cancelled orders are ignored')
ok(revenueSplit(orders, customers, S).zeroPriced.length === 0, 'fully priced orders raise nothing')
const zs = computeDayKpi({ orders: zeroOrders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: dayRec, mixLog: null })
ok(zs.snapshot!.zeroPriced.join() === 'Toastieland: p', 'snapshot carries the warning')

console.log('Farmers market')
const mkt = mk('wm', '', '')
const mktCust = [...customers, mkt]
const mktOrder = order('wm', [['p', 20, 0]], { customerName: 'Westhampton Market' })
const dkMkt = computeDayKpi({ orders: [...orders, mktOrder], customers: mktCust, products: prods as any, standards: S, shapeMap: {}, roster, day: dayRec, mixLog: null })
ok(dkMkt.farmersMarket.on && dkMkt.farmersMarket.auto, 'a Westhampton Market order makes it a market day automatically')
ok(near(dkMkt.extraRevenue, 600) && near(dkMkt.snapshot!.revenue, 390 + 600), 'adds $600 revenue')
ok(dkMkt.invoices === 6 && dkMkt.snapshot!.zeroPriced.length === 0, 'the market order is the invoice (no extra), and its $0 prices raise no warning')
const dkNo = computeDayKpi({ orders: [...orders, mktOrder], customers: mktCust, products: prods as any, standards: S, shapeMap: {}, roster, day: { ...dayRec, farmersMarket: false }, mixLog: null })
ok(!dkNo.farmersMarket.on && dkNo.extraRevenue === 0, 'a day can say no market')
const dkYes = computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: { ...dayRec, farmersMarket: true }, mixLog: null })
const dkBase = computeDayKpi({ orders, customers, products: prods as any, standards: S, shapeMap: {}, roster, day: dayRec, mixLog: null })
ok(dkYes.extraRevenue === 600 && dkYes.invoices === dkBase.invoices + 1, 'a manual market day adds $600 and one invoice')
ok(near(dkYes.pack.expectedHours - dkBase.pack.expectedHours, 18 / 60), 'the extra invoice adds 18 pack minutes')
ok(dkYes.snapshot!.revByDistro.OTHER === dkBase.snapshot!.revByDistro.OTHER + 600, 'no distributor fee on market revenue')

console.log('Sicilians: labor only from David')
const sicProds = [...prods, { id: 'sic', name: 'Sicilian', category: 'OTHER', unitWeight: 400 }]
const sicOrders = [order('c1', [['sic', 60, 0], ['lb', 10, 5]], { customerName: 'Fini Patio Bar' })]
const sicShape = computeShape(sicOrders, sicProds, S, {}, [], null)
ok(sicShape.rows.find(r => r.cls === 'sicilian')!.units === 0, 'Sicilian order lines add no shaping hours')
const sicDavid = computeShape(sicOrders, sicProds, S, {}, autoExtrasFromMixLog({ date: 'd', people: [], doughs: {}, shaped: { sicilian: 90 } }, []), null)
ok(sicDavid.extraRows.some(r => r.cls === 'sicilian' && r.units === 90), "David's 90 Sicilians are the shaping labor")
const mbWith = computeMixBake(sicOrders, sicProds, S, [])
const mbWithout = computeMixBake([order('c1', [['lb', 10, 5]], { customerName: 'Fini Patio Bar' })], sicProds, S, [])
ok(mbWith.rackUnits === mbWithout.rackUnits && near(mbWith.mixKg, mbWithout.mixKg, 1e-9), 'Sicilian order lines add no bake or mix time either')
const mbDavid = computeMixBake(sicOrders, sicProds, S, autoExtrasFromMixLog({ date: 'd', people: [], doughs: {}, shaped: { sicilian: 90 } }, []))
ok(mbDavid.rackUnits === mbWith.rackUnits + 90, "David's count adds the bake time (rack)")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
