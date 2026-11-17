// Weekly ingredient usage for the Schripps usage sheet.
// Schripps owns that sheet and NLB fills in column C only ("KG / cases"); everything else on their sheet is
// calculated by them. This module works out the column C number for every row, in the sheet's row order.
//
// Three kinds of rows:
//   count   - typed in by an admin from the weekly inventory book ("Used amount")
//   kilo    - calculated: kg mixed of each dough (Mix Log) x that dough's share of the ingredient (DOUGH_ING)
//   split   - the seed-mix kilos split equally into four seeds
//   fixed   - same every week unless edited (pan spray, bread ties, finishing seeds ...)
import { addDays, format, parseISO } from 'date-fns'
import { MIX_DOUGHS, MixLogDay } from './labor'

export type RowKind = 'count' | 'kilo' | 'split' | 'fixed'

export interface IngredientRow {
  key: string
  label: string           // as written on the Schripps sheet (column A)
  kind: RowKind
  book?: string           // name in the inventory book, for count rows
  fixedDefault?: number   // fixed rows: starting value
}

// Exact row order of the Schripps weekly tab (week ending 11/10/2026).
export const INGREDIENT_ROWS: IngredientRow[] = [
  { key: 'ap', label: 'AP Flour', kind: 'count', book: 'Minnesota Flour' },
  { key: 'hg', label: 'HG Flour', kind: 'count', book: 'Hummer Flour' },
  { key: 'ww', label: 'Whole Wheat Flour', kind: 'count', book: 'Whole Wheat Fine' },
  { key: 'rye', label: 'Rye Flour', kind: 'count' },
  { key: 'semolina', label: 'Semolina', kind: 'count', book: 'Semolina' },
  { key: 'sugar', label: 'Sugar', kind: 'kilo' },
  { key: 'salt', label: 'Salt', kind: 'kilo' },
  { key: 'eggs', label: 'Liquid Eggs', kind: 'count', book: 'Eggs' },
  { key: 'milk', label: 'Milk', kind: 'count', book: 'Milk' },
  { key: 'malt', label: 'Malt Powder', kind: 'kilo' },
  { key: 'redyeast', label: 'Saf Red Yeast', kind: 'count', book: 'Red Yeast' },
  { key: 'goldyeast', label: 'Saf Gold Yeast', kind: 'count', book: 'Gold Yeast' },
  { key: 'butter', label: 'Butter', kind: 'count', book: 'Butter' },
  { key: 'margarine', label: 'Margarine', kind: 'count', book: 'Margarine' },
  { key: 'canola', label: 'Canola Oil', kind: 'count', book: 'Canola Oil' },
  { key: 'honey', label: 'Honey', kind: 'kilo' },
  { key: 'carraway', label: 'Carraway', kind: 'kilo' },
  { key: 'seedmix', label: 'Seed Mix', kind: 'kilo' },
  { key: 'sesame', label: 'Sesame', kind: 'split' },
  { key: 'pumpkin', label: 'Pumpkin', kind: 'split' },
  { key: 'flax', label: 'Flax', kind: 'split' },
  { key: 'sunflower', label: 'Sunflower', kind: 'split' },
  { key: 'freshyeast', label: 'Fresh Yeast', kind: 'count', book: 'Fresh Yeast' },
  { key: 'oliveoil', label: 'Olive Oil', kind: 'count' },
  { key: 'oilblend', label: 'Oil Blend', kind: 'count', book: 'Blended Oil' },
  { key: 'kingmidas', label: 'King Midas Special', kind: 'count', book: 'Special King Midas' },
  { key: 'spelt', label: 'Spelt', kind: 'kilo' },
  { key: 'cornmeal', label: 'Corn Meal', kind: 'count', book: 'Corn Meal' },
  { key: 'panspray', label: 'Pan Spray Oil', kind: 'fixed', fixedDefault: 25 },
  { key: 'boxes', label: 'Boxes', kind: 'fixed', fixedDefault: 0 },
  { key: 'breadties', label: 'Bread Ties', kind: 'fixed', fixedDefault: 3000 },
  { key: 'boxtape', label: 'Box Tape', kind: 'fixed', fixedDefault: 1000 },
  { key: 'bag8x4x15', label: '8x4x15 Bag', kind: 'fixed', fixedDefault: 0 },
  { key: 'finsesame', label: 'Finishing Sesame', kind: 'fixed', fixedDefault: 30 },
  { key: 'finpoppy', label: 'Finishing Poppy', kind: 'fixed', fixedDefault: 9 },
  { key: 'finseedmix', label: 'Finishing Seed Mix', kind: 'fixed', fixedDefault: 12 },
]

export const SEED_SPLIT_KEYS = ['sesame', 'pumpkin', 'flax', 'sunflower']

// Share of each dough's weight that is this ingredient (the DOUGH_ING tab of the 2026 usage workbook).
// Dough ids are the Mix Log dough ids.
export const KILO_FRACTIONS: Record<string, Record<string, number>> = {
  sugar: { brioche: 0.08, milk: 0.078 },
  salt: { sourdough: 0.012, baguette: 0.012, semolina: 0.014, italian: 0.01, brioche: 0.01, multigrain: 0.012, rye: 0.012, milk: 0.011, sicilian: 0.016, nypizza: 0.017 },
  malt: { italian: 0.008, sicilian: 0.012, nypizza: 0.013 },
  honey: { brioche: 0.043, multigrain: 0.058, rye: 0.058 },
  carraway: { rye: 0.012 },
  seedmix: { multigrain: 0.166 },
  spelt: { sicilian: 0.013 }, // the workbook also had 0.28 for "Yeast Water Poolish", which is not a Mix Log dough
}

// Doughs in the Mix Log that the DOUGH_ING table has no column for (their kilos use no tracked ingredient).
export const DOUGHS_WITHOUT_FRACTIONS = ['jetblue']

// ── Weeks ─────────────────────────────────────────────────────────────────────
// A week ends on a Tuesday (the Schripps tab is named by that date) and covers the 7 production days ending then.
export function weekDates(weekEnding: string): string[] {
  const end = parseISO(weekEnding)
  return Array.from({ length: 7 }, (_, i) => format(addDays(end, i - 6), 'yyyy-MM-dd'))
}

/** Most recent Tuesday on or before `today` (yyyy-MM-dd). */
export function latestWeekEnding(today: string): string {
  const d = parseISO(today)
  const back = (d.getDay() - 2 + 7) % 7 // getDay: Tuesday = 2
  return format(addDays(d, -back), 'yyyy-MM-dd')
}

export function shiftWeek(weekEnding: string, weeks: number): string {
  return format(addDays(parseISO(weekEnding), weeks * 7), 'yyyy-MM-dd')
}

// ── Calculation ───────────────────────────────────────────────────────────────
export interface KiloResult {
  kilos: Record<string, number>   // key -> kg (kilo rows, including seedmix)
  totalKg: number                 // kg of counted doughs in the week
  daysWithLog: number
  unmappedKg: Record<string, number> // dough id -> kg mixed that has no ingredient fractions
}

export function computeKilos(logs: (MixLogDay | null | undefined)[]): KiloResult {
  const counted = new Set(MIX_DOUGHS.filter(d => d.counts).map(d => d.id))
  const kilos: Record<string, number> = {}
  Object.keys(KILO_FRACTIONS).forEach(k => { kilos[k] = 0 })
  const unmappedKg: Record<string, number> = {}
  let totalKg = 0
  let daysWithLog = 0
  for (const log of logs) {
    if (!log) continue
    let any = false
    for (const [dough, raw] of Object.entries(log.doughs || {})) {
      const kg = Number(raw) || 0
      if (kg <= 0 || !counted.has(dough)) continue
      any = true
      totalKg += kg
      for (const [ing, fr] of Object.entries(KILO_FRACTIONS)) {
        if (fr[dough]) kilos[ing] += kg * fr[dough]
      }
      if (DOUGHS_WITHOUT_FRACTIONS.includes(dough)) unmappedKg[dough] = (unmappedKg[dough] || 0) + kg
    }
    if (any) daysWithLog++
  }
  return { kilos, totalKg, daysWithLog, unmappedKg }
}

export interface WeekInput {
  counts: Record<string, number | null>      // count rows
  fixed: Record<string, number | null>       // fixed rows
  kiloOverrides: Record<string, number | null> // typed over a calculated kilo row
}

export interface ColumnCRow {
  key: string
  label: string
  kind: RowKind
  value: number
  calculated?: number   // kilo rows: what the Mix Log calculated
  overridden?: boolean
  missing?: boolean     // count row with nothing typed yet
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

export function buildColumnC(input: WeekInput, kilo: KiloResult): ColumnCRow[] {
  const seedMixKg = pickKilo('seedmix', input, kilo)
  return INGREDIENT_ROWS.map(row => {
    if (row.kind === 'count') {
      const v = input.counts[row.key]
      return { key: row.key, label: row.label, kind: row.kind, value: v == null ? 0 : v, missing: v == null }
    }
    if (row.kind === 'fixed') {
      const v = input.fixed[row.key]
      return { key: row.key, label: row.label, kind: row.kind, value: v == null ? (row.fixedDefault ?? 0) : v }
    }
    if (row.kind === 'split') {
      return { key: row.key, label: row.label, kind: row.kind, value: r3(seedMixKg / SEED_SPLIT_KEYS.length) }
    }
    const calc = r3(kilo.kilos[row.key] || 0)
    const o = input.kiloOverrides[row.key]
    return { key: row.key, label: row.label, kind: row.kind, value: o == null ? calc : o, calculated: calc, overridden: o != null }
  })
}

function pickKilo(key: string, input: WeekInput, kilo: KiloResult): number {
  const o = input.kiloOverrides[key]
  return o != null ? o : r3(kilo.kilos[key] || 0)
}

/** One value per line, in the Schripps row order, ready to paste into column C. */
export function columnCText(rows: ColumnCRow[]): string {
  return rows.map(r => String(r.value)).join('\n')
}
