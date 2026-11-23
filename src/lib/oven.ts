// Rack oven model: what can share a rack, how long each kind of rack bakes, and how to read the crew's oven log.
// Bake times and temperatures come from the Newlight Baking Guide (BAKE-REF-001).
// Pure functions only: no network or database calls (the API route fetches the published sheet).

// ─── BAKE GROUPS ─────────────────────────────────────────────────────────────
// Items in the same group can share a rack (same temperature and time). Racks are rounded up per group.
export interface OvenGroup { id: string; label: string; tempF: number; minutes: number }

export const OVEN_GROUPS: OvenGroup[] = [
  { id: 'pullman_l_360', label: 'Pullman large (milk, brioche, multigrain)', tempF: 360, minutes: 50 },
  { id: 'pullman_s_360', label: 'Pullman small (milk, brioche, multigrain)', tempF: 360, minutes: 30 },
  { id: 'pullman_l_440', label: 'Pullman large (sourdough)', tempF: 440, minutes: 30 },
  { id: 'bun_360', label: 'Buns, rolls, sliders (brioche, milk)', tempF: 360, minutes: 15 },
  { id: 'bun_440', label: 'Buns, rolls, hoagies, ciabatta (Italian, semolina, sourdough)', tempF: 440, minutes: 15 },
  { id: 'baguette_440', label: 'Baguettes (Italian, sourdough)', tempF: 440, minutes: 15 },
  { id: 'focaccia_440', label: 'Focaccia', tempF: 440, minutes: 15 },
  { id: 'sicilian_440', label: 'Sicilian', tempF: 440, minutes: 15 },
]
export const groupById = (id: string): OvenGroup | undefined => OVEN_GROUPS.find(g => g.id === id)

// At 360F the dough family matters: milk, brioche and multigrain are baked on separate racks.
// A plan row / logged bucket is "group" or "group|family".
export type Family = '' | 'milk' | 'brioche' | 'multigrain'
const FAMILY_GROUPS = ['pullman_l_360', 'pullman_s_360', 'bun_360']
export const keyOf = (group: string, family: Family | string = ''): string => (family && FAMILY_GROUPS.includes(group) ? `${group}|${family}` : group)
export const groupOfKey = (key: string): string => key.split('|')[0]
export const groupLabel = (key: string): string => {
  const [id, fam] = key.split('|')
  const g = groupById(id)
  return g ? (fam ? `${g.label.replace(/ \(.*\)$/, '')} (${fam})` : g.label) : 'Not recognized'
}
export function familyOf(name: string, category?: string): Family {
  const n = (name || '').toLowerCase()
  if (/multi/.test(n)) return 'multigrain'
  if (/brio|parker|hot ?dog|oeuf/.test(n)) return 'brioche'
  if (/milk/.test(n)) return 'milk'
  if (category === 'BRIOCHE') return 'brioche'
  if (category === 'MULTIGRAIN') return 'multigrain'
  return 'milk'
}
const isPullmanGroup = (id: string) => id.startsWith('pullman_')

export interface OvenSettings {
  ovenTurnaroundMin: number       // load + unload minutes added to every rack
  eggWashMinPerRack: number
  seedMinPerRack: number
  depanMinPerRack: number
  groupMinutes: Record<string, number>   // overrides of the bake guide, by group id
}

export const minutesOf = (g: OvenGroup, s?: Partial<OvenSettings> | null): number => {
  const v = s?.groupMinutes?.[g.id]
  return typeof v === 'number' && v > 0 ? v : g.minutes
}

// ─── CLASSIFYING A PRODUCT ───────────────────────────────────────────────────
const COOL_CATEGORIES = ['BRIOCHE', 'MILK_BREAD', 'MULTIGRAIN', 'CHALLAH']   // bake at 360F; everything else 440F

export interface RackClass { group: string; cap: number; family: Family }

/** Which group a rack product bakes in, and how many fit on a rack. null = not defined (left out and listed). */
export function classifyRack(name: string, category?: string): RackClass | null {
  const n = (name || '').toLowerCase()
  if (/sicilian|scilian/.test(n)) return { group: 'sicilian_440', cap: 18, family: '' }
  if (/focaccia|fougasse/.test(n)) return { group: 'focaccia_440', cap: 18, family: '' }
  if (/croissant|pretzel/.test(n) || (/challah/.test(n) && !/parker|roll|bun/.test(n))) return null

  const known = !!category
  const cool = known
    ? COOL_CATEGORIES.includes(category as string)
    : /milk|brioche|parker|pullman|hot ?dog|oeuf/.test(n) ||
      (/(^|\s)roll(s)?$|burger bun|(^|\s)bun(s)?(\s|$)/.test(n) && !/semolina|ital|sour|kaiser|ciab|hoagie/.test(n))

  // Loaves in a pan
  const loafWords = /pullman|loaf|sandwich|\((large|retail)\)|bread/.test(n) && !/slider|roll|bun|boule|batard/.test(n)
  if (/pullman/.test(n) || (known && cool && loafWords)) {
    if (/sourdough/.test(n)) return { group: 'pullman_l_440', cap: 24, family: '' }
    const fam = familyOf(n, category)
    if (/retail|small|mini|peque/.test(n)) return { group: 'pullman_s_360', cap: 48, family: fam }
    return { group: 'pullman_l_360', cap: 24, family: fam }
  }
  if (/baguette/.test(n)) return { group: 'baguette_440', cap: /24/.test(n) ? 90 : 180, family: '' }
  if (/ciabatta/.test(n)) return { group: 'bun_440', cap: 108, family: '' }
  if (/hoagie|hero/.test(n)) return { group: 'bun_440', cap: 108, family: '' }
  if (/parker/.test(n)) return { group: 'bun_360', cap: 768, family: 'brioche' }
  if (/\b(bun|buns|roll|rolls|slider|sliders|twist|kaiser)\b/.test(n) || /hot ?dog/.test(n)) {
    return cool ? { group: 'bun_360', cap: 216, family: familyOf(n, category) } : { group: 'bun_440', cap: 216, family: '' }
  }
  return null
}

/** Egg wash: every bun and slider in brioche and milk (hot dog buns included). Seeds: the seeded ones. */
export function handlingFlags(name: string, category?: string): { eggWash: boolean; seed: boolean } {
  const n = (name || '').toLowerCase()
  const cool = category === 'BRIOCHE' || category === 'MILK_BREAD'
  const bunLike = /\b(bun|buns|slider|sliders)\b/.test(n) || /hot ?dog/.test(n)
  const eggWash = cool && bunLike
  return { eggWash, seed: eggWash && /seeded|sesame|everything/.test(n) }
}

// ─── PLAN (from orders) ──────────────────────────────────────────────────────
export interface PlanItem { name: string; category?: string; units: number; group?: string; cap?: number; family?: Family }
export interface OvenPlanRow {
  id: string; label: string; tempF: number; minutes: number
  units: number; rackFraction: number; racks: number; ovenMinutes: number
}
export interface OvenPlan {
  rows: OvenPlanRow[]
  units: number
  racks: number
  ovenMinutes: number
  handling: { eggWashRacks: number; seedRacks: number; depanRacks: number; minutes: number }
  unclassified: string[]
}

const roundUp = (x: number) => Math.ceil(x - 1e-9)

export function planOven(items: PlanItem[], s: Partial<OvenSettings> | null = null): OvenPlan {
  const frac: Record<string, number> = {}
  const units: Record<string, number> = {}
  const unclassified = new Set<string>()
  let egg = 0, seed = 0
  items.forEach(it => {
    if (!(it.units > 0)) return
    const c: RackClass | null = it.group && it.cap ? { group: it.group, cap: it.cap, family: it.family || '' } : classifyRack(it.name, it.category)
    if (!c) { unclassified.add(it.name || 'Extra production'); return }
    const k = keyOf(c.group, c.family)
    frac[k] = (frac[k] || 0) + it.units / c.cap
    units[k] = (units[k] || 0) + it.units
    const f = handlingFlags(it.name, it.category)
    if (f.eggWash) egg += it.units / c.cap
    if (f.seed) seed += it.units / c.cap
  })
  const turn = Math.max(0, Number(s?.ovenTurnaroundMin) || 0)
  const keys = Object.keys(frac).sort((a, b) => OVEN_GROUPS.findIndex(g => g.id === groupOfKey(a)) - OVEN_GROUPS.findIndex(g => g.id === groupOfKey(b)) || a.localeCompare(b))
  const rows: OvenPlanRow[] = keys.map(k => {
    const g = groupById(groupOfKey(k)) as OvenGroup
    const racks = roundUp(frac[k])
    const minutes = minutesOf(g, s)
    return { id: k, label: groupLabel(k), tempF: g.tempF, minutes, units: units[k], rackFraction: frac[k], racks, ovenMinutes: racks * (minutes + turn) }
  })
  const racks = rows.reduce((t, r) => t + r.racks, 0)
  const depanRacks = rows.filter(r => isPullmanGroup(groupOfKey(r.id))).reduce((t, r) => t + r.racks, 0)
  const eggWashRacks = roundUp(egg), seedRacks = roundUp(seed)
  const handlingMin =
    eggWashRacks * (Number(s?.eggWashMinPerRack) || 0) +
    seedRacks * (Number(s?.seedMinPerRack) || 0) +
    depanRacks * (Number(s?.depanMinPerRack) || 0)
  return {
    rows,
    units: Object.values(units).reduce((t, v) => t + v, 0),
    racks,
    ovenMinutes: rows.reduce((t, r) => t + r.ovenMinutes, 0),
    handling: { eggWashRacks, seedRacks, depanRacks, minutes: handlingMin },
    unclassified: Array.from(unclassified).sort(),
  }
}

// ─── READING THE CREW'S OVEN LOG ─────────────────────────────────────────────
export interface LoadPiece { group: string; family: Family; units: number }
export interface OvenLoad {
  kind: 'rack' | 'deck'
  date: string                 // YYYY-MM-DD
  start: string                // HH:mm
  end: string
  minutes: number              // oven time for this load
  product: string              // as selected on the form
  group: string | null         // rack loads: the group of the selected product
  units: number                // total units across the pieces (deck: the units cell)
  pieces: LoadPiece[]          // rack loads: units by group (a combined load can have several)
  raw: string                  // the units cell as typed
  review: string | null        // why a person should look at this load
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f.trim() !== '')) rows.push(row)
  return rows
}

export function isoDateOf(s: string): string | null {
  const t = (s || '').trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return null
}

/** "7:55:00 AM", "13:05" or "1:05 PM" -> minutes after midnight. */
export function minutesOfDay(s: string): number | null {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/)
  if (!m) return null
  let h = Number(m[1]); const min = Number(m[2])
  if (m[3]) { const pm = m[3].toLowerCase() === 'pm'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12 }
  if (h > 24 || min > 59) return null
  return h * 60 + min
}
const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

interface Sel { group: string; family: Family }

function wordSel(word: string, sel: Sel | null): Sel | null {
  const w = word.toLowerCase()
  const fam: Family | null = /multi|rye/.test(w) ? 'multigrain' : /brio|brion/.test(w) ? 'brioche' : /milk/.test(w) ? 'milk' : null
  if (sel && isPullmanGroup(sel.group)) {
    if (/sour/.test(w)) return { group: 'pullman_l_440', family: '' }
    return { group: sel.group, family: fam || sel.family }
  }
  if (/baguette/.test(w)) return { group: 'baguette_440', family: '' }
  if (/semolina|ital|\bita\b|hoagie|ciab|sour|kaiser|twist/.test(w)) return { group: 'bun_440', family: '' }
  if (/milk|brioche|burger|bun|roll|parker|dog|slider/.test(w)) {
    const base: Family = fam || (/parker|dog/.test(w) ? 'brioche' : sel && sel.group === 'bun_360' ? sel.family : 'milk')
    return { group: 'bun_360', family: base }
  }
  return sel
}

/** The units cell is sometimes typed by hand ("60 burger semolina 24 Ita"). Read each "number + words" piece. */
export function parseUnitsCell(raw: string, selected: Sel | null): { pieces: LoadPiece[]; review: string | null } {
  const t = (raw || '').trim()
  if (!t) return { pieces: [], review: 'No units entered' }
  if (/^\d+(\.\d+)?$/.test(t)) {
    return selected
      ? { pieces: [{ group: selected.group, family: selected.family, units: Number(t) }], review: null }
      : { pieces: [], review: 'Product not recognized' }
  }
  const pieces: LoadPiece[] = []
  let unresolved = false
  const re = /(\d+(?:\.\d+)?)\s*([^\d,;+&]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const g = wordSel(m[2].trim(), selected)
    if (!g) { unresolved = true; continue }
    pieces.push({ group: g.group, family: g.family, units: Number(m[1]) })
  }
  if (!pieces.length || unresolved) return { pieces, review: `Could not read "${t}"` }
  return { pieces, review: null }
}

type Cols = { kind: 'rack' | 'deck'; date: number; start: number; end: number; units: number; product: number; bake: number }

function findCols(header: string[]): Cols | null {
  const h = header.map(x => x.trim().toLowerCase())
  const idx = (re: RegExp) => h.findIndex(x => re.test(x))
  const date = idx(/^fecha/), units = idx(/^unidades/), product = idx(/^producto/), bake = idx(/^bake min/)
  const rackStart = idx(/inicio/), deckStart = idx(/entrada/)
  const rackEnd = idx(/hora de fin|^fin/), deckEnd = idx(/salid/)
  if (date < 0 || units < 0 || product < 0) return null
  if (rackStart >= 0 && rackEnd >= 0) return { kind: 'rack', date, start: rackStart, end: rackEnd, units, product, bake }
  if (deckStart >= 0 && deckEnd >= 0) return { kind: 'deck', date, start: deckStart, end: deckEnd, units, product, bake }
  return null
}

/** Reads one published tab. Which tab it is (rack or deck) is decided by its column headings. */
export function parseOvenCsv(text: string): { kind: 'rack' | 'deck'; loads: OvenLoad[] } | null {
  const rows = parseCsvRows(text)
  if (!rows.length) return null
  const cols = findCols(rows[0])
  if (!cols) return null
  const loads: OvenLoad[] = []
  rows.slice(1).forEach(r => {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
    const date = isoDateOf(get(cols.date))
    const product = get(cols.product)
    if (!date || !product) return
    const s = minutesOfDay(get(cols.start)), e = minutesOfDay(get(cols.end))
    let minutes = 0
    let timeProblem: string | null = null
    if (s !== null && e !== null) {
      let d = e - s
      if (d <= 0) d += 720                       // "7:45 AM to 12:30" entered as 0:30
      if (d > 0 && d <= 300) minutes = d
    }
    if (!minutes) {
      const b = Number(get(cols.bake))
      if (b > 0 && b <= 300) minutes = b
      else timeProblem = 'Start or end time could not be read'
    }
    const raw = get(cols.units)
    const base: Omit<OvenLoad, 'group' | 'units' | 'pieces' | 'review'> = {
      kind: cols.kind, date, start: s === null ? '' : hhmm(s), end: e === null ? '' : hhmm(e), minutes, product, raw,
    }
    if (cols.kind === 'deck') {
      const u = Number(raw)
      loads.push({ ...base, group: null, units: Number.isFinite(u) ? u : 0, pieces: [], review: timeProblem || (Number.isFinite(u) && raw !== '' ? null : `Units "${raw}" not a number`) })
      return
    }
    const cls = classifyRack(product, undefined)
    const sel = cls ? { group: cls.group, family: cls.family } : null
    const parsed = parseUnitsCell(raw, sel)
    loads.push({
      ...base, group: sel ? sel.group : null, units: parsed.pieces.reduce((t, p) => t + p.units, 0), pieces: parsed.pieces,
      review: timeProblem || parsed.review || (sel ? null : `Product "${product}" not recognized`),
    })
  })
  return { kind: cols.kind, loads }
}

// ─── ONE DAY OF LOADS ────────────────────────────────────────────────────────
export interface OvenDay {
  rackLoads: OvenLoad[]
  deckLoads: OvenLoad[]
  rackMinutes: number            // all rack loads (the plan also counts David's Sicilians)
  deckMinutes: number
  byGroup: Record<string, { loads: number; minutes: number; units: number }>
  review: OvenLoad[]
}

export function summarizeOvenDay(loads: OvenLoad[]): OvenDay {
  const rackLoads = loads.filter(l => l.kind === 'rack')
  const deckLoads = loads.filter(l => l.kind === 'deck')
  const byGroup: OvenDay['byGroup'] = {}
  rackLoads.forEach(l => {
    // A combined load's minutes are shared between its pieces by units.
    const total = l.pieces.reduce((t, p) => t + p.units, 0)
    const parts = l.pieces.length && total > 0
      ? l.pieces.map(p => ({ key: keyOf(p.group, p.family), share: p.units / total, units: p.units }))
      : [{ key: l.group ? keyOf(l.group, '') : 'unknown', share: 1, units: l.units }]
    parts.forEach(p => {
      const e = (byGroup[p.key] = byGroup[p.key] || { loads: 0, minutes: 0, units: 0 })
      e.loads += p.share; e.minutes += l.minutes * p.share; e.units += p.units
    })
  })
  return {
    rackLoads, deckLoads,
    rackMinutes: rackLoads.reduce((t, l) => t + l.minutes, 0),
    deckMinutes: deckLoads.reduce((t, l) => t + l.minutes, 0),
    byGroup,
    review: loads.filter(l => l.review),
  }
}

/** A combined load whose pieces bake at different temperatures should be looked at. */
export function mixedTemperature(l: OvenLoad): boolean {
  const temps = new Set(l.pieces.map(p => groupById(p.group)?.tempF).filter(Boolean))
  return temps.size > 1
}
