// Maman CSV parser and delivery-date rule. Pure functions, no Firebase.
import { Issue, MamanRow, ParsedMaman } from './types'
import { MAMAN_DELIVERY_OFFSET_DAYS } from './mappings'

// Small CSV reader: quoted fields, doubled quotes, CRLF, BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f.trim() !== '')) rows.push(row)
  return rows
}

const REQUIRED = ['account number', 'order date', 'item code', 'description', 'packaging', 'quantity']

// True when the text looks like a Maman order CSV (used for automatic format detection).
export function looksLikeMamanCsv(text: string): boolean {
  const first = parseCsv(text)[0]
  if (!first) return false
  const h = first.map(x => x.trim().toLowerCase())
  return REQUIRED.every(r => h.includes(r))
}

export function parseMamanCsv(text: string, fileName: string): ParsedMaman {
  const problems: Issue[] = []
  const all = parseCsv(text)
  const header = (all[0] || []).map(x => x.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const missing = REQUIRED.filter(r => col(r) < 0)
  const out: ParsedMaman = {
    kind: 'maman', fileName, accountAddress: '', csvOrderDate: '', rows: [], problems,
  }
  if (missing.length) {
    problems.push({ severity: 'blocking', code: 'csv-columns', message: `CSV is missing column(s): ${missing.join(', ')}.` })
    return out
  }

  const addresses = new Set<string>()
  const orderDates = new Set<string>()
  all.slice(1).forEach((r, i) => {
    const get = (name: string) => (r[col(name)] ?? '').trim()
    const rawQuantity = get('quantity')
    const n = rawQuantity === '' ? 0 : Number(rawQuantity)
    const row: MamanRow = {
      index: i,
      code: get('item code'),
      description: get('description'),
      packaging: get('packaging'),
      rawQuantity,
      quantity: Number.isFinite(n) ? n : null,
    }
    out.rows.push(row)
    if (get('account number')) addresses.add(get('account number'))
    if (get('order date')) orderDates.add(get('order date'))
  })

  const addrList = Array.from(addresses)
  out.accountAddress = addrList[0] || ''
  out.csvOrderDate = Array.from(orderDates)[0] || ''
  if (addrList.length > 1) {
    problems.push({ severity: 'blocking', code: 'multi-location', message: `The file lists more than one location (${addrList.join(' | ')}). Split it into one file per location.` })
  }
  if (!addrList.length) problems.push({ severity: 'blocking', code: 'no-address', message: 'No Account Number (address) found in the CSV.' })
  if (orderDates.size > 1) problems.push({ severity: 'warning', code: 'multi-order-date', message: 'The CSV has more than one Order Date.' })
  if (!out.rows.length) problems.push({ severity: 'blocking', code: 'no-rows', message: 'The CSV has no data rows.' })
  return out
}

// ─── Dates (all plain YYYY-MM-DD strings, no time zones involved) ────────────
const isoToUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
export const utcToIso = (dt: Date) => dt.toISOString().slice(0, 10)
export const isValidIso = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && utcToIso(isoToUtc(s)) === s
export const weekdayName = (iso: string) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][isoToUtc(iso).getUTCDay()]

// receivedDate = the New York calendar date the email arrived.
export function mamanDeliveryDate(receivedDate: string): string {
  const dt = isoToUtc(receivedDate)
  dt.setUTCDate(dt.getUTCDate() + MAMAN_DELIVERY_OFFSET_DAYS[dt.getUTCDay()])
  return utcToIso(dt)
}
