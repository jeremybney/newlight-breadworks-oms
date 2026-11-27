// FreshDirect PDF purchase-order parser. FreshDirect POs are printed from SAP: a header block, then one
// two-line entry per item:
//   0010 400651418 3 CS 42.00 126.00
//   NEWLIGHT SEEDED SOURDOUGH 28OZ 12CS 11/27/2026 36.000 EA PER 1 CS
// Works on positioned text items (see pdfText.ts), so it is testable without a browser.
import { FreshDirectLine, Issue, ParsedFreshDirect } from './types'
import { PdfTextItem, toLines, usDateToIso } from './westville'

const toNum = (s: string) => Number(s.replace(/,/g, ''))
const cents = (n: number) => Math.round(n * 100)
const MONEY = '([\\d,]+\\.\\d{2})'

const ITEM_ROW = new RegExp(`^(\\d{4})\\s+(\\S+)\\s+(\\d+(?:\\.\\d+)?)\\s+([A-Z]{2})\\s+${MONEY}\\s+${MONEY}$`)
const DESC_ROW = /^(.*?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([\d,]+(?:\.\d+)?)\s+([A-Z]{2})\s+PER\s+(\d+)\s+([A-Z]{2})$/i

export function looksLikeFreshDirectPo(items: PdfTextItem[]): boolean {
  const t = items.map(i => i.str).join(' ')
  return /FRESH\s*DIRECT/i.test(t) && /Purchase Order/i.test(t) && /PO Number/i.test(t) && /Net Amount/i.test(t)
}

export function parseFreshDirectPo(items: PdfTextItem[], fileName: string): ParsedFreshDirect {
  const problems: Issue[] = []
  const add = (severity: Issue['severity'], code: string, message: string) => problems.push({ severity, code, message })
  const out: ParsedFreshDirect = {
    kind: 'freshdirect', fileName, poNumber: null, poDate: null, location: null, sendToAddress: null,
    deliveryDate: null, lines: [], statedTotal: null, freight: null, grandTotal: null, statedCases: null, problems,
  }
  const lines = toLines(items)

  // ── Header: values sit right after their label on the same text row ──
  const after = (label: RegExp, shape: RegExp): string | null => {
    for (const l of lines) {
      const i = l.items.findIndex(it => label.test(it.str.trim()))
      if (i >= 0) for (const next of l.items.slice(i + 1)) if (shape.test(next.str.trim())) return next.str.trim()
    }
    return null
  }
  out.poNumber = after(/^PO Number$/i, /^\d{4,}$/)
  const d = after(/^Date:?$/i, /^\d{1,2}\/\d{1,2}\/\d{4}$/)
  out.poDate = d ? usDateToIso(d) : null

  // Ship To block: the left-hand column lines right under "Ship To:" (the right column holds other text)
  const shipItem = items.find(i => /^Ship To:?$/i.test(i.str.trim()))
  if (shipItem) {
    const left = items.filter(i => i.page === shipItem.page && i.x < 300 && i.y < shipItem.y - 2)
      .sort((a, b) => b.y - a.y || a.x - b.x)
    const rows: string[] = []
    let lastY: number | null = null
    for (const it of left) {
      if (lastY !== null && Math.abs(it.y - lastY) <= 2.5) rows[rows.length - 1] += ' ' + it.str.trim()
      else rows.push(it.str.trim())
      lastY = it.y
      if (rows.length > 2) break
    }
    out.location = rows[0] || null
    out.sendToAddress = rows[1] || null
  }

  // ── Item rows ──
  let cur: { itemNo: string; code: string; cases: number; um: string; price: number; amount: number } | null = null
  const dates: (string | null)[] = []
  for (const l of lines) {
    const row = l.text.match(ITEM_ROW)
    if (row) {
      cur = { itemNo: row[1], code: row[2], cases: toNum(row[3]), um: row[4], price: toNum(row[5]), amount: toNum(row[6]) }
      continue
    }
    if (cur) {
      const desc = l.text.match(DESC_ROW)
      if (desc) {
        const eaTotal = toNum(desc[3]), per = Number(desc[5])
        const perCase = cur.cases > 0 && per > 0 && cur.um === 'CS' && desc[6].toUpperCase() === 'CS' && desc[4].toUpperCase() === 'EA' ? eaTotal / (cur.cases * per) : null
        const line: FreshDirectLine = {
          index: out.lines.length, itemNo: cur.itemNo, code: cur.code, description: desc[1].replace(/\s+/g, ' ').trim(),
          cases: cur.cases, casePrice: cur.price, amount: cur.amount, eachPerCase: perCase,
          deliveryDate: usDateToIso(desc[2]),
        }
        out.lines.push(line); dates.push(line.deliveryDate)
        if (cur.um !== 'CS') add('blocking', 'unit-not-cases', `Line ${cur.itemNo} (${cur.code}) is ordered in "${cur.um}", not cases. This importer only reads case quantities.`)
        cur = null
      }
    }
  }

  // ── Totals ──
  for (const l of lines) {
    let m = l.text.match(new RegExp(`Total Amount\\s+${MONEY}`, 'i'))
    if (m) out.statedTotal = toNum(m[1])
    m = l.text.match(new RegExp(`Freight\\s*&\\s*Oth\\w*\\s+${MONEY}`, 'i'))
    if (m) out.freight = toNum(m[1])
    m = l.text.match(new RegExp(`Grand Total\\s+${MONEY}`, 'i'))
    if (m) out.grandTotal = toNum(m[1])
    m = l.text.match(/^(\d+)\s+CS\b/)
    if (m && /Freight/i.test(l.text)) out.statedCases = Number(m[1])
  }

  // ── Delivery date: printed on every line; they must agree ──
  const distinct = Array.from(new Set(dates.filter(Boolean) as string[]))
  if (distinct.length === 1 && !dates.includes(null)) out.deliveryDate = distinct[0]
  else if (distinct.length > 1) add('blocking', 'delivery-dates-differ', `The lines have different delivery dates (${distinct.join(', ')}). Enter the right date in "Change delivery date".`)
  else add('blocking', 'no-delivery-date', 'Could not read the delivery date on the PO lines.')

  if (!out.poNumber) add('blocking', 'no-po', 'Could not find the PO number.')
  if (!out.poDate) add('warning', 'no-po-date', 'Could not read the PO date.')
  if (!out.location) add('blocking', 'no-location', 'Could not find the Ship To location.')
  if (!out.lines.length) { add('blocking', 'no-lines', 'No item lines found on the PO.'); return out }
  if (out.statedTotal === null) add('blocking', 'no-total', 'Could not find "Total Amount" under the item table.')

  // ── Reconciliation (exact, in cents) ──
  out.lines.forEach(l => {
    if (cents(l.cases * l.casePrice) !== cents(l.amount)) {
      add('blocking', 'line-total', `Line ${l.code}: ${l.cases} cs x ${l.casePrice.toFixed(2)} = ${(cents(l.cases * l.casePrice) / 100).toFixed(2)}, but the PO says ${l.amount.toFixed(2)}.`)
    }
    if (!Number.isInteger(l.cases) || l.cases < 1) add('blocking', 'qty-invalid', `Line ${l.code}: ${l.cases} cases is not a whole number of 1 or more.`)
  })
  const sum = out.lines.reduce((s, l) => s + cents(l.amount), 0)
  if (out.statedTotal !== null && sum !== cents(out.statedTotal)) {
    add('blocking', 'sum-mismatch', `Lines add up to ${(sum / 100).toFixed(2)} but the PO "Total Amount" is ${out.statedTotal.toFixed(2)}.`)
  }
  if (out.statedCases !== null) {
    const cs = out.lines.reduce((s, l) => s + l.cases, 0)
    if (cs !== out.statedCases) add('blocking', 'cases-mismatch', `Lines add up to ${cs} cases but the PO says ${out.statedCases} CS.`)
  }
  if (out.statedTotal !== null && out.grandTotal !== null && cents(out.statedTotal) + cents(out.freight || 0) !== cents(out.grandTotal)) {
    add('blocking', 'grand-mismatch', `Total ${out.statedTotal.toFixed(2)} + freight ${(out.freight || 0).toFixed(2)} does not equal the Grand Total ${out.grandTotal.toFixed(2)}.`)
  }
  if (out.freight) add('info', 'freight', `The PO shows $${out.freight.toFixed(2)} "Freight & Oth". It is not part of the order; the OMS adds its own fuel surcharge if the customer has one.`)
  return out
}
