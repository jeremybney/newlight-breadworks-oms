// Run with: npx tsx tests/ingredients/run.ts
import {
  INGREDIENT_ROWS, KILO_FRACTIONS, SEED_SPLIT_KEYS, buildColumnC, columnCText, computeKilos,
  latestWeekEnding, shiftWeek, weekDates,
} from '../../src/lib/ingredients'
import { MIX_DOUGHS } from '../../src/lib/labor'

let pass = 0, fail = 0
function ok(c: boolean, msg: string) { if (c) pass++; else { fail++; console.log('  FAIL', msg) } }
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9

console.log('Rows')
ok(INGREDIENT_ROWS.length === 36, '36 rows like the Schripps tab')
ok(INGREDIENT_ROWS[0].label === 'AP Flour' && INGREDIENT_ROWS[35].label === 'Finishing Seed Mix', 'first and last row')
ok(new Set(INGREDIENT_ROWS.map(r => r.key)).size === INGREDIENT_ROWS.length, 'row keys are unique')
ok(INGREDIENT_ROWS.filter(r => r.kind === 'split').map(r => r.key).join() === SEED_SPLIT_KEYS.join(), 'split rows are the four seeds')
const doughIds = new Set(MIX_DOUGHS.map(d => d.id))
ok(Object.values(KILO_FRACTIONS).every(f => Object.keys(f).every(d => doughIds.has(d))), 'every fraction uses a real Mix Log dough id')

console.log('Weeks')
ok(weekDates('2026-11-10').join() === '2026-11-04,2026-11-05,2026-11-06,2026-11-07,2026-11-08,2026-11-09,2026-11-10', 'week ending 11/10 covers 11/4 to 11/10')
ok(latestWeekEnding('2026-11-17') === '2026-11-17', 'a Tuesday is its own week ending')
ok(latestWeekEnding('2026-11-16') === '2026-11-10', 'Monday 11/16 -> Tuesday 11/10')
ok(latestWeekEnding('2026-11-11') === '2026-11-10', 'Wednesday 11/11 -> Tuesday 11/10')
ok(shiftWeek('2026-11-10', 1) === '2026-11-17' && shiftWeek('2026-11-10', -1) === '2026-11-03', 'shift by a week')

console.log('Kilo calculation')
const logs = [
  { date: '2026-11-04', people: [], doughs: { brioche: 100, milk: 200 } },
  { date: '2026-11-05', people: [], doughs: { multigrain: 50, rye: 10, jetblue: 40 } },
  null,
]
const k = computeKilos(logs as any)
ok(close(k.kilos.sugar, 100 * 0.08 + 200 * 0.078), 'sugar = brioche 8% + milk bread 7.8%')
ok(close(k.kilos.honey, 100 * 0.043 + 50 * 0.058 + 10 * 0.058), 'honey across three doughs')
ok(close(k.kilos.seedmix, 50 * 0.166), 'seed mix from multigrain')
ok(close(k.kilos.carraway, 10 * 0.012), 'caraway from rye')
ok(close(k.totalKg, 400) && k.daysWithLog === 2, 'total kg and days with a log')
ok(close(k.unmappedKg.jetblue, 40), 'JetBlue kg is flagged as having no fractions')
ok(computeKilos([]).totalKg === 0 && computeKilos([null]).kilos.sugar === 0, 'no logs -> zeros')
ok(close(computeKilos([{ date: 'x', people: [], doughs: { brioche: -5, nope: 9 } } as any]).kilos.sugar, 0), 'negative and unknown doughs ignored')

console.log('Column C')
const rows = buildColumnC({ counts: { ap: 60, hg: 83 }, fixed: { panspray: 30 }, kiloOverrides: { salt: 1.5 } }, k)
const by = Object.fromEntries(rows.map(r => [r.key, r]))
ok(by.ap.value === 60 && !by.ap.missing, 'typed count used')
ok(by.ww.value === 0 && by.ww.missing === true, 'untyped count is 0 and flagged missing')
ok(by.panspray.value === 30 && by.breadties.value === 3000, 'fixed: typed value, else default')
ok(by.salt.value === 1.5 && by.salt.overridden === true && by.salt.calculated !== undefined, 'kilo override wins and remembers the calculated value')
ok(close(by.sugar.value, Math.round((100 * 0.08 + 200 * 0.078) * 1000) / 1000), 'sugar rounded to 3 decimals')
ok(close(by.sesame.value * 4, by.seedmix.value) && by.sesame.value === by.sunflower.value, 'four seeds split the seed mix equally')
const ov = buildColumnC({ counts: {}, fixed: {}, kiloOverrides: { seedmix: 12.948 } }, k)
ok(ov.find(r => r.key === 'pumpkin')!.value === 3.237, 'seed split follows a typed seed mix (12.948 -> 3.237, as on the 11/10 sheet)')
const txt = columnCText(rows)
ok(txt.split('\n').length === 36, 'copy text has one line per row')
ok(txt.split('\n')[0] === '60' && txt.split('\n')[1] === '83', 'copy text order matches the sheet')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
