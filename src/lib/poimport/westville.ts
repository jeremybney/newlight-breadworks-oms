// Westville PDF purchase-order parser. Works on text items (string + x/y position), so it
// is testable without a browser. src/lib/poimport/pdfText.ts produces the items in the browser.
import { Issue, ParsedWestville, WestvilleLine } from './types'

export interface PdfTextItem { str: string; x: number; y: number; page: number }

const NUM = /^-?\d[\d,]*\.\d{2}$/
const toNum = (s: string) => Number(s.replace(/,/g, ''))
const cents = (n: number) => Math.round(n * 100)

// "11/4/2026" -> "2026-11-04" (US order: month/day/year)
export function usDateToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const mm = Number(m[1]), dd = Number(m[2]), yy = Number(m[3])
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const dt = new Date(Date.UTC(yy, mm - 1, dd))
  if (dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null
  return dt.toISOString().slice(0, 10)
}

interface Line { page: number; y: number; items: PdfTextItem[]; text: string }

function toLines(items: PdfTextItem[]): Line[] {
  const sorted = items.filter(i => i.str.trim() !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const it of sorted) {
    const last = lines[lines.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= 2.5) last.items.push(it)
    else lines.push({ page: it.page, y: it.y, items: [it], text: '' })
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x)
    l.text = l.items.map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim()
  }
  return lines
}

// True when the extracted text looks like a Westville purchase order.
export function looksLikeWestvillePo(items: PdfTextItem[]): boolean {
  const t = items.map(i => i.str).join(' ')
  return /Purchase Order\s*:/i.test(t) && /Vendor Description/i.test(t)
}

export function parseWestvillePo(items: PdfTextItem[], fileName: string): ParsedWestville {
  const problems: Issue[] = []
  const add = (severity: Issue['severity'], code: string, message: string) => problems.push({ severity, code, message })
  const lines = toLines(items)
  const out: ParsedWestville = {
    kind: 'westville', fileName, poNumber: null, location: null, accountNumber: null, sendToAddress: null,
    orderDate: null, deliveryDate: null, headerAmount: null, statedTotal: null, lines: [], problems,
  }

  // ── Header fields ──
  const headerIdx = lines.findIndex(l => /Vendor Description/i.test(l.text))
  const head = headerIdx >= 0 ? lines.slice(0, headerIdx) : lines
  for (const l of head) {
    let m = l.text.match(/^Purchase Order\s*:\s*(?:PO\s*-?\s*)?(\S+)/i)
    if (m) out.poNumber = m[1]
    m = l.text.match(/^Location\s*:\s*(.+)$/i)
    if (m) out.location = m[1].trim()
    // Order/Delivery Date share a row with other text, so look at the item positions
    const od = l.items.findIndex(i => /^Order Date$/i.test(i.str.trim()))
    if (od >= 0 && l.items[od + 1]) out.orderDate = usDateToIso(l.items[od + 1].str)
    const dd = l.items.findIndex(i => /^Delivery Date$/i.test(i.str.trim()))
    if (dd >= 0 && l.items[dd + 1]) out.deliveryDate = usDateToIso(l.items[dd + 1].str)
  }
  // Account number: the line right under "Account Number"
  const acctIdx = head.findIndex(l => /^Account Number$/i.test(l.text))
  if (acctIdx >= 0 && head[acctIdx + 1]) {
    const m = head[acctIdx + 1].text.match(/^(\d+)/)
    if (m) out.accountNumber = m[1]
  }
  // Send To block: street line right after the location name
  const sendIdx = head.findIndex(l => /^Send To$/i.test(l.text))
  if (sendIdx >= 0 && head[sendIdx + 2]) out.sendToAddress = head[sendIdx + 2].text.replace(/\s*Amount$/i, '').trim()
  // Header amount: a $ value in the header block
  for (const l of head) {
    const it = l.items.find(i => /^\$\s*[\d,]+\.\d{2}$/.test(i.str.trim()))
    if (it) out.headerAmount = toNum(it.str.replace('$', '').trim())
  }

  if (!out.poNumber) add('blocking', 'no-po', 'Could not find the PO number.')
  if (!out.location) add('blocking', 'no-location', 'Could not find the Location.')
  if (!out.orderDate) add('warning', 'no-order-date', 'Could not read the Order Date.')
  if (!out.deliveryDate) add('blocking', 'no-delivery-date', 'Could not read the Delivery Date.')

  if (headerIdx < 0) {
    add('blocking', 'no-table', 'Could not find the item table (no "Vendor Description" header).')
    return out
  }

  // ── Column positions from the header row ──
  const hdr = lines[headerIdx]
  const xOf = (re: RegExp) => hdr.items.find(i => re.test(i.str.trim()))?.x
  const xItem = xOf(/^Item$/i), xPack = xOf(/^Pack Size$/i), xVD = xOf(/^Vendor Description$/i)
  const xVN = xOf(/^Vendor$/i), xQty = xOf(/^Qty$/i)
  if ([xItem, xPack, xVD, xVN, xQty].some(v => v === undefined)) {
    add('blocking', 'columns', 'Could not locate all table columns (Item, Pack Size, Vendor Description, Vendor, Qty).')
    return out
  }
  const bounds = [xItem!, xPack!, xVD!, xVN!, xQty! - 15]
  const colOf = (x: number) => {
    let c = 0
    for (let i = 0; i < bounds.length; i++) if (x >= bounds[i] - 3) c = i
    return c
  }

  // ── Rows: a row starts at the line holding Qty, Each and Total numbers ──
  type Raw = { cells: string[]; qty: number; each: number; total: number }
  const rows: Raw[] = []
  let cur: Raw | null = null
  for (let li = headerIdx + 1; li < lines.length; li++) {
    const l = lines[li]
    // "Total  74.80" closes the table
    const totalTok = l.items.find(i => /^Total$/i.test(i.str.trim()))
    if (totalTok && l.items.length <= 3) {
      const num = l.items.find(i => NUM.test(i.str.trim()))
      if (num) out.statedTotal = toNum(num.str.trim())
      break
    }
    const nums = l.items.filter(i => i.x >= xQty! - 15 && NUM.test(i.str.trim()))
    if (nums.length >= 3) {
      const [q, e, t] = nums.slice(-3).map(i => toNum(i.str.trim()))
      cur = { cells: ['', '', '', '', ''], qty: q, each: e, total: t }
      rows.push(cur)
    }
    if (!cur) continue
    for (const it of l.items) {
      if (it.x >= xQty! - 15) continue // numeric columns
      const c = colOf(it.x)
      cur.cells[c] = (cur.cells[c] ? cur.cells[c] + ' ' : '') + it.str.trim()
    }
  }
  if (out.statedTotal === null) add('blocking', 'no-total', 'Could not find the PO total under the item table.')

  rows.forEach((r, i) => {
    const line: WestvilleLine = {
      index: i, item: r.cells[0], packSize: r.cells[1], vendorDescription: r.cells[2], vendorNumber: r.cells[3],
      quantity: r.qty, each: r.each, total: r.total,
    }
    out.lines.push(line)
  })
  if (!out.lines.length) add('blocking', 'no-lines', 'No item lines found on the PO.')

  // ── Reconciliation (exact, in cents) ──
  out.lines.forEach(l => {
    if (cents(l.quantity * l.each) !== cents(l.total)) {
      add('blocking', 'line-total', `Line "${l.vendorDescription || l.item}": ${l.quantity} x ${l.each.toFixed(2)} = ${(cents(l.quantity * l.each) / 100).toFixed(2)}, but the PO says ${l.total.toFixed(2)}.`)
    }
  })
  const sum = out.lines.reduce((s, l) => s + cents(l.total), 0)
  if (out.statedTotal !== null && sum !== cents(out.statedTotal)) {
    add('blocking', 'sum-mismatch', `Lines add up to ${(sum / 100).toFixed(2)} but the PO total is ${out.statedTotal.toFixed(2)}.`)
  }
  if (out.statedTotal !== null && out.headerAmount !== null && cents(out.statedTotal) !== cents(out.headerAmount)) {
    add('blocking', 'header-mismatch', `Header amount ${out.headerAmount.toFixed(2)} does not match the table total ${out.statedTotal.toFixed(2)}.`)
  }
  if (out.headerAmount === null) add('warning', 'no-header-amount', 'Could not read the Amount in the PO header.')
  return out
}
