// PO Importer tests. Run with:  npm run test:poimport
// Uses the six sample files (embedded in fixtures.ts). Customer and price data below are TEST data.
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { PRODUCTS } from '@/lib/products'
import { Customer } from '@/types'
import { parseMamanCsv, mamanDeliveryDate, weekdayName } from '@/lib/poimport/maman'
import { parseWestvillePo } from '@/lib/poimport/westville'
import { buildPreview, allIssues, blockingCount } from '@/lib/poimport/build'
import { parseOrderEmail, newYorkParts } from '@/lib/poimport/email'
import * as F from './fixtures'

let pass = 0, fail = 0
function ok(cond: boolean, name: string, extra = '') { if (cond) { pass++; console.log('  PASS', name) } else { fail++; console.log('  FAIL', name, extra) } }
// Synthetic live data: customer defaults copied from apply-slicing; prices are TEST values.
const mk = (id: string, name: string, slicing: Record<string, string>, pricing: Record<string, number>, extra: Partial<Customer> = {}): Customer =>
  ({ id, name, active: true, address: '', slicing, pricing, ...extra } as any)
const mamanSlice = { 'mb-large': 'TH Sliced', 'large-batard': 'TH Sliced', 'mg-batard': 'TH Sliced' }
const wvSlice = { 'mg-batard': 'TH Sliced', 'large-batard': 'TH Sliced', 'italian-batard': 'TH Sliced', 'mb-large': 'TH Sliced' }
const mamanPrice = { 'mb-large': 7.5, 'large-batard': 6.25, 'mb-5in-burger-bun': 1.1, 'mb-5in-burger-seeded': 1.2 }
const wvPrice = { 'mg-batard': 10.7, 'mb-large': 8.0, 'sd-baguette-24in': 1.55 }
const customers: Customer[] = [
  mk('c-trib', 'Maman - Tribeca', mamanSlice, mamanPrice),
  mk('c-king', 'Maman - King', mamanSlice, mamanPrice),
  mk('c-soho', 'Maman - Soho', mamanSlice, mamanPrice),
  mk('c-wall', 'Westville - Wall St', wvSlice, wvPrice),
  mk('c-prep', 'Westville - Prep Kitchen (Wall St)', wvSlice, wvPrice),
  mk('c-hud', 'Westville - Hudson', wvSlice, wvPrice),
  mk('c-hk', 'Westville - Hells Kitchen', wvSlice, { ...wvPrice, 'mb-large': 8.25 }),
]
const ctx = { customers, products: PRODUCTS as any }

const fixtureCsv = (k: string): string => (F as any)['CSV_' + k]
const pdfItems = (k: string) => (F as any)['PDF_' + k] as import('@/lib/poimport/westville').PdfTextItem[]

async function main() {
  console.log('Delivery rule')
  const cases: [string, string][] = [['2026-11-02', 'Wednesday'], ['2026-11-03', 'Thursday'], ['2026-11-04', 'Friday'], ['2026-11-05', 'Saturday'], ['2026-11-06', 'Sunday'], ['2026-11-07', 'Tuesday'], ['2026-11-08', 'Tuesday']]
  for (const [rec, want] of cases) { const d = mamanDeliveryDate(rec); ok(weekdayName(d) === want, `${weekdayName(rec)} ${rec} -> ${want}`, `${d}`) }
  ok(mamanDeliveryDate('2026-11-04') === '2026-11-06', 'Wed 11/4 -> 2026-11-06')

  console.log('Maman CSVs')
  const maman: [string, string, string, [string, number, string][]][] = [
    ['TRIBECA', 'Maman - Tribeca', 'c-trib', [['mb-5in-burger-bun', 10, ''], ['large-batard', 11, 'TH Sliced'], ['mb-large', 5, 'TH Sliced']]],
    ['KING', 'Maman - King', 'c-king', [['mb-large', 10, 'TH Sliced']]],
    ['SOHO', 'Maman - Soho', 'c-soho', [['mb-5in-burger-bun', 30, ''], ['large-batard', 12, 'TH Sliced'], ['mb-large', 12, 'TH Sliced']]],
  ]
  for (const [f, name, cid, want] of maman) {
    console.log(' ', name)
    const parsed = parseMamanCsv(fixtureCsv(f), f)
    ok(parsed.rows.length === 5, '5 source rows retained (incl. zeros)', String(parsed.rows.length))
    const pv = buildPreview(parsed, ctx, { receivedDate: '2026-11-04', dateConfirmed: true, today: '2026-11-05' })
    ok(pv.customer?.id === cid, `customer -> ${cid}`, JSON.stringify(pv.customer))
    ok(pv.deliveryDate === '2026-11-06', 'delivery 2026-11-06')
    ok(pv.lines.length === want.length, `${want.length} nonzero lines`, String(pv.lines.length))
    want.forEach(([pid, q, s], i) => {
      const l = pv.lines[i]
      ok(l?.productId === pid && l.quantity === q && l.slicing === s, `line ${i}: ${pid} x${q} "${s}"`, JSON.stringify(l && [l.productId, l.quantity, l.slicing]))
    })
    ok(pv.zeroRows.length === 5 - want.length, 'zero rows kept separately')
    ok(pv.poNumber === null, 'no PO number from CSV')
    ok(blockingCount(pv) === 0, 'no blocking issues', JSON.stringify(allIssues(pv).filter(i => i.severity === 'blocking')))
    ok(!allIssues(pv).some(i => /Brioche/i.test(i.message) && i.severity === 'blocking'), 'Brioche Bun no longer flagged')
    // required received date + confirmation
    const no = buildPreview(parsed, ctx, { today: '2026-11-05' })
    ok(no.issues.some(i => i.code === 'received-missing'), 'blocks without received date')
    const unc = buildPreview(parsed, ctx, { receivedDate: '2026-11-04', today: '2026-11-05' })
    ok(unc.issues.some(i => i.code === 'date-unconfirmed'), 'blocks until date confirmed')
    const ovr = buildPreview(parsed, ctx, { receivedDate: '2026-11-04', overrideDate: '2026-11-09', dateConfirmed: true, today: '2026-11-05' })
    ok(ovr.deliveryDate === '2026-11-09', 'override date wins')
  }
  // preserved original descriptions
  const t = buildPreview(parseMamanCsv(fixtureCsv(maman[0][0]), 'x'), ctx, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(t.lines[0].sourceDescription === 'Brioche Bun' && t.lines[0].sourceCode === 'ML501', 'original description/code preserved')

  console.log('Westville PDFs')
  const wv: [string, string, string, string, string, string, number, [string, number, number][]][] = [
    ['PO195202', '195202', 'Westville Wall Street', 'c-wall', '2026-11-05', '', 74.8, [['mg-batard', 4, 10.7], ['mb-large', 4, 8]]],
    ['PO194915', '194915', 'Westville West', 'c-hud', '2026-11-06', '', 158.7, [['mg-batard', 6, 10.7], ['mb-large', 6, 8], ['sd-baguette-24in', 30, 1.55]]],
    ['PO195304', '195304', 'Westville HK', 'c-hk', '2026-11-06', '', 189.6, [['mg-batard', 12, 10.7], ['mb-large', 3, 8], ['sd-baguette-24in', 24, 1.55]]],
  ]
  for (const [f, po, loc, cid, dd, , total, lines] of wv) {
    console.log(' ', 'PO', po)
    const parsed = parseWestvillePo(pdfItems(f), f)
    ok(parsed.poNumber === po, `PO number ${po}`, String(parsed.poNumber))
    ok(parsed.location === loc, `location ${loc}`, String(parsed.location))
    ok(parsed.deliveryDate === dd && parsed.orderDate === '2026-11-04', `dates order 2026-11-04 / delivery ${dd}`, `${parsed.orderDate} ${parsed.deliveryDate}`)
    ok(parsed.lines.length === lines.length, `${lines.length} lines`, String(parsed.lines.length))
    ok(parsed.statedTotal === total && parsed.headerAmount === total, `total ${total} (header and table)`, `${parsed.statedTotal} ${parsed.headerAmount}`)
    ok(parsed.problems.length === 0, 'parser reports no problems/mismatches', JSON.stringify(parsed.problems))
    ok(parsed.accountNumber === '534004', 'account number 534004 read (not a location)')
    const pv = buildPreview(parsed, ctx, { today: '2026-11-05' })
    ok(pv.customer?.id === cid, `customer -> ${cid}`, JSON.stringify(pv.customer))
    lines.forEach(([pid, q, price], i) => {
      const l = pv.lines[i]
      ok(l?.productId === pid && l.quantity === q && l.sourceUnitPrice === price, `line ${i}: ${pid} x${q} @${price}`, JSON.stringify(l && [l.productId, l.quantity, l.sourceUnitPrice]))
    })
    const exp = (id: string) => id === 'sd-baguette-24in' ? '' : 'TH Sliced'
    ok(pv.lines.every(l => l.slicing === exp(l.productId!)), 'slicing = customer default (TH Sliced for batard/milk bread, none for baguette)', JSON.stringify(pv.lines.map(l => l.slicing)))
    ok(pv.lines.every(l => l.sourceDescription.includes('→')), 'original item + vendor description preserved')
    console.log('     blocking:', blockingCount(pv), '| warnings:', allIssues(pv).filter(i => i.severity === 'warning').map(i => i.code).join(','))
  }
  // price difference (HK has OMS milk bread 8.25 vs PO 8.00)
  const hk = buildPreview(parseWestvillePo(pdfItems(wv[2][0]), 'hk'), ctx, { today: '2026-11-05' })
  ok(allIssues(hk).some(i => i.code === 'price-differs'), 'price difference warned (HK milk bread 8.25 vs 8.00)')
  ok(hk.lines[1].oneUnitPrice === 8.25 && Math.abs(hk.proposedTotal - 190.35) < 0.001, 'OMS price kept, not replaced by PO price', String(hk.proposedTotal))

  console.log('Negative / safety tests')
  // tampered total
  const items = pdfItems(wv[0][0])
  const bad = items.map(i => (i.str === '74.80' && i.y < 450 ? { ...i, str: '75.80' } : i))
  const badP = parseWestvillePo(bad, 'bad')
  ok(badP.problems.some(p => p.code === 'sum-mismatch') && badP.problems.some(p => p.code === 'header-mismatch'), 'tampered PO total is caught')
  // tampered line
  const bad2 = parseWestvillePo(items.map(i => (i.str === '42.80' ? { ...i, str: '43.80' } : i)), 'bad2')
  ok(bad2.problems.some(p => p.code === 'line-total'), 'tampered line total is caught')
  // ambiguous customer
  const dup = { customers: [...customers, mk('c-dup', 'Maman - Soho', {}, {})], products: PRODUCTS as any }
  const dp = buildPreview(parseMamanCsv(fixtureCsv(maman[2][0]), 'x'), dup, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(dp.customer === null && dp.issues.some(i => i.code === 'customer-ambiguous'), 'ambiguous customer is blocked, not guessed')
  // missing customer
  const miss = buildPreview(parseMamanCsv(fixtureCsv(maman[2][0]), 'x'), { customers: customers.filter(c => c.id !== 'c-soho'), products: PRODUCTS as any }, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(miss.issues.some(i => i.code === 'customer-missing'), 'missing customer is blocked')
  // inactive / missing product
  const prods = (PRODUCTS as any[]).map(p => p.id === 'mb-5in-burger-bun' ? { ...p, active: false } : p)
  const ip = buildPreview(parseMamanCsv(fixtureCsv(maman[0][0]), 'x'), { customers, products: prods }, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(ip.lines[0].issues.some(i => i.code === 'product-inactive'), 'inactive product flagged')
  const mp = buildPreview(parseMamanCsv(fixtureCsv(maman[0][0]), 'x'), { customers, products: (PRODUCTS as any[]).filter(p => p.id !== 'mb-5in-burger-bun') }, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(mp.lines[0].issues.some(i => i.code === 'product-missing'), 'missing product flagged')
  // unknown product + invalid qty
  const csv = '"Account Number","Order Date","Item Code","Description","Packaging","Quantity"\n"239 centre st ny, ny 10013","2026-11-04","XX1","Mystery Loaf","EA","3"\n"239 centre st ny, ny 10013","2026-11-04","","Large Batard (TH Sliced)","EA","2"\n"239 centre st ny, ny 10013","2026-11-04","SD302","Large Sourdough Batard","EA","2.5"'
  const up = buildPreview(parseMamanCsv(csv, 'x'), ctx, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(up.lines[0].issues.some(i => i.code === 'product-unmapped'), 'unknown product flagged')
  ok(up.lines[1].productId === 'large-batard' && !up.lines[1].issues.some(i => i.severity === 'blocking'), 'Large Batard (TH Sliced) line is accepted now that it is confirmed')
  ok(up.lines[2].issues.some(i => i.code === 'qty-invalid'), 'invalid quantity flagged')
  // missing price
  const np = buildPreview(parseMamanCsv(fixtureCsv(maman[2][0]), 'x'), { customers: customers.map(c => c.id === 'c-soho' ? { ...c, pricing: {} } as any : c), products: PRODUCTS as any }, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(np.lines.every(l => l.issues.some(i => i.code === 'price-missing')), 'missing prices flagged')
  // unmapped location
  const ul = buildPreview(parseMamanCsv(csv.replace(/239 centre st/g, '1 unknown rd'), 'x'), ctx, { receivedDate: '2026-11-04', dateConfirmed: true })
  ok(ul.issues.some(i => i.code === 'location-unknown'), 'unknown location flagged')
  // manual correction stays local
  const mo = buildPreview(parseMamanCsv(csv, 'x'), ctx, { receivedDate: '2026-11-04', dateConfirmed: true, lineOverrides: { 0: { productId: 'mb-large', slicing: 'Sliced' } } })
  ok(mo.lines[0].productId === 'mb-large' && mo.lines[0].mappingStatus === 'manual', 'manual correction applies in preview')

  console.log('Westville delivery date override')
  const wo = buildPreview(parseWestvillePo(pdfItems(wv[0][0]), 'wo'), ctx, { today: '2026-11-06' })
  ok(wo.deliveryDate === '2026-11-05' && wo.issues.some(i => i.code === 'date-past'), 'past PO date is warned')
  const wo2 = buildPreview(parseWestvillePo(pdfItems(wv[0][0]), 'wo'), ctx, { today: '2026-11-06', overrideDate: '2026-11-09' })
  ok(wo2.deliveryDate === '2026-11-09' && !wo2.issues.some(i => i.code === 'date-past'), 'override date replaces the PO date and clears the past-date warning')
  ok(wo2.poNumber === '195202' && wo2.sourceTotal === 74.8, 'override does not change the PO number or totals')
  
  console.log('Order emails (.eml)')
  const pdfjsNode = createRequire(path.resolve(__dirname, '..', '..', 'package.json'))('pdfjs-dist/legacy/build/pdf.js')
  const b64 = (t: string) => Buffer.from(t, 'utf8').toString('base64')
  const AUTH_OK = (d: string) => `mx.google.com; dkim=pass header.i=@${d}; dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=${d}`
  function eml(o: { from: string; subject: string; date: string; auth?: string; html: string; file: string; type: string; b64: string }): Uint8Array {
    const lines = [
      `From: ${o.from}`, 'To: orders@example.test', 'Cc: someone@example.test',
      `Subject: ${o.subject}`, `Date: ${o.date}`, 'Message-ID: <test-1@example.test>', 'MIME-Version: 1.0',
      ...(o.auth ? [`Authentication-Results: ${o.auth}`] : []),
      'Content-Type: multipart/mixed; boundary="BND"', '',
      '--BND', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(o.html, 'utf8').toString('base64'), '',
      '--BND', `Content-Type: ${o.type}; name="${o.file}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${o.file}"`, '', o.b64, '', '--BND--', '',
    ]
    return new TextEncoder().encode(lines.join('\r\n'))
  }
  const mamanHtml = (po: string) => `<html><body><!-- When the commissary tenant ships the order --><table><tr><td><strong>Purchase Order #:</strong></td><td><div><span>${po}</span></div></td></tr></table></body></html>`
  const rockAddrCsv = '"Account Number","Order Date","Item Code","Description","Packaging","Quantity"\n' +
    '"12 West 48th Street, NY,NY 10036","2026-11-09","ML501","Brioche Bun","","0"\n' +
    '"12 West 48th Street, NY,NY 10036","2026-11-09","SD302","Large Sourdough Batard","EA","5"\n' +
    '"12 West 48th Street, NY,NY 10036","2026-11-09","","Milk Bread (Large) (TH Sliced)","EA","5"\n'
  const mk2 = (id: string, name: string, address: string, sl: Record<string, string>, pr: Record<string, number>) => mk(id, name, sl, pr, { address } as any)
  const ctxE = { customers: [...customers, mk2('c-rock', 'Maman - Rockefeller', '12 W. 48th St, New York, NY 10036', mamanSlice, mamanPrice), mk2('c-lic', 'Westville - LIC', '43-12 Hunter St, Queens, NY 11101', wvSlice, wvPrice)], products: PRODUCTS as any }

  // Maman
  const mRaw = eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Rockefeller', date: 'Mon, 09 Nov 2026 21:42:16 +0000', auth: AUTH_OK('marginedge.com'), html: mamanHtml('17615686'), file: '2026-11-09 Order For Maman - Rockefeller.csv', type: 'text/csv', b64: b64(rockAddrCsv) })
  const mRes = await parseOrderEmail(mRaw, 'maman.eml')
  ok(mRes.ok && mRes.kind === 'maman', 'Maman email recognized')
  if (mRes.ok) {
    const e = mRes.parsed.email!
    ok(e.poNumber === '17615686', 'PO number read from the email body', String(e.poNumber))
    ok(e.receivedDate === '2026-11-09' && /Mon/.test(e.receivedLocal) && /4:42/.test(e.receivedLocal), 'received time converted to New York (Mon 4:42 PM)', e.receivedLocal)
    ok(e.subjectLocation === 'Maman - Rockefeller' && e.senderVerified, 'location from subject; sender verified')
    const pv = buildPreview(mRes.parsed, ctxE, { receivedDate: e.receivedDate!, dateConfirmed: true, today: '2026-11-10' })
    ok(pv.customer?.id === 'c-rock' && pv.poNumber === '17615686', 'customer Maman - Rockefeller matched, PO shown')
    ok(pv.deliveryDate === '2026-11-11', 'Monday email -> Wednesday 2026-11-11', String(pv.deliveryDate))
    ok(pv.lines.length === 2 && pv.lines[0].productId === 'large-batard' && pv.lines[1].productId === 'mb-large' && pv.lines.every(l => l.quantity === 5 && l.slicing === 'TH Sliced'), 'two lines x5, TH Sliced')
    ok(blockingCount(pv) === 0, 'no blocking issues', JSON.stringify(allIssues(pv).filter(i => i.severity === 'blocking')))
    ok(!allIssues(pv).some(i => i.code === 'address-mismatch'), 'address agrees with customer record')
  }
  // Westville
  const wRaw = eml({ from: 'Restaurant365 System Notification <noreply@restaurant365.com>', subject: 'Purchase Order From Westville LIC', date: 'Sat, 07 Nov 2026 12:18:02 +0000', auth: AUTH_OK('restaurant365.com'), html: '<p>Submitted Purchase Order from Westville LIC</p>', file: 'PO - 196114.pdf', type: 'application/pdf', b64: F.PDF_196114_B64 })
  const wRes = await parseOrderEmail(wRaw, 'westville.eml', { pdfjs: pdfjsNode })
  ok(wRes.ok && wRes.kind === 'westville', 'Westville email recognized')
  if (wRes.ok) {
    const pv = buildPreview(wRes.parsed, ctxE, { today: '2026-11-07' })
    ok(pv.customer?.id === 'c-lic' && pv.poNumber === '196114', 'Westville LIC matched by name rule; PO 196114')
    ok(pv.deliveryDate === '2026-11-08', 'delivery date from the PDF')
    ok(pv.lines[0].productId === 'mg-batard' && pv.lines[0].sourceDescription.includes('Mutligrain'), 'typo "Mutligrain Batard" still maps to mg-batard')
    ok(pv.proposedTotal === 74.8 && pv.sourceTotal === 74.8, 'total reconciles ($74.80)')
    ok(blockingCount(pv) === 0, 'no blocking issues', JSON.stringify(allIssues(pv).filter(i => i.severity === 'blocking')))
    ok(!allIssues(pv).some(i => i.code === 'address-mismatch'), 'address agrees with customer record')
  }
  // Safety checks
  const noAuth = await parseOrderEmail(eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Rockefeller', date: 'Mon, 09 Nov 2026 21:42:16 +0000', html: mamanHtml('1'), file: 'a.csv', type: 'text/csv', b64: b64(rockAddrCsv) }), 'x.eml')
  ok(noAuth.ok && noAuth.parsed.problems.some(p => p.code === 'sender-unauthenticated' && p.severity === 'blocking'), 'email without a passing DMARC check is blocked')
  const spoof = await parseOrderEmail(eml({ from: 'orders@marginedge.com.evil.test', subject: 'Order for Maman - Rockefeller', date: 'Mon, 09 Nov 2026 21:42:16 +0000', auth: AUTH_OK('marginedge.com.evil.test'), html: mamanHtml('1'), file: 'a.csv', type: 'text/csv', b64: b64(rockAddrCsv) }), 'x.eml')
  ok(!spoof.ok, 'look-alike sender domain is rejected')
  const other = await parseOrderEmail(eml({ from: 'someone@example.test', subject: 'hello', date: 'Mon, 09 Nov 2026 21:42:16 +0000', html: 'x', file: 'a.csv', type: 'text/csv', b64: b64(rockAddrCsv) }), 'x.eml')
  ok(!other.ok, 'unrecognized sender is rejected')
  // Subject says Soho, but the CSV address is Tribeca's (a mapped address): must be blocked, not guessed
  const conflict = await parseOrderEmail(eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Soho', date: 'Mon, 09 Nov 2026 21:42:16 +0000', auth: AUTH_OK('marginedge.com'), html: mamanHtml('2'), file: 'a.csv', type: 'text/csv', b64: b64(fixtureCsv('TRIBECA')) }), 'x.eml')
  ok(conflict.ok && buildPreview(conflict.parsed, ctxE, { receivedDate: '2026-11-09', dateConfirmed: true }).issues.some(i => i.code === 'location-conflict' && i.severity === 'blocking'), 'subject vs CSV address conflict is blocked')
  // Subject says Soho, address is somewhere else entirely (not a mapped address): warn that it does not match the customer record
  const soho = mk2('c-soho-a', 'Maman - Soho', '239 Centre St, New York, NY 10013', mamanSlice, mamanPrice)
  const mism = await parseOrderEmail(eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Soho', date: 'Mon, 09 Nov 2026 21:42:16 +0000', auth: AUTH_OK('marginedge.com'), html: mamanHtml('3'), file: 'a.csv', type: 'text/csv', b64: b64(rockAddrCsv) }), 'x.eml')
  ok(mism.ok && buildPreview(mism.parsed, { customers: [soho], products: PRODUCTS as any }, { receivedDate: '2026-11-09', dateConfirmed: true }).issues.some(i => i.code === 'address-mismatch'), 'address that does not match the customer record raises a warning')
  const noPo = await parseOrderEmail(eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Rockefeller', date: 'Mon, 09 Nov 2026 21:42:16 +0000', auth: AUTH_OK('marginedge.com'), html: '<p>no number here</p>', file: 'a.csv', type: 'text/csv', b64: b64(rockAddrCsv) }), 'x.eml')
  ok(noPo.ok && noPo.parsed.problems.some(p => p.code === 'po-missing' && p.severity === 'warning'), 'missing PO number is a warning, not a guess')
  // Time zones: UTC evening/night maps to the New York calendar day; summer uses EDT
  ok(newYorkParts('2026-11-10T02:30:00Z')?.date === '2026-11-09', 'Tue 02:30 UTC is still Monday evening in New York')
  ok(newYorkParts('2026-07-01T03:00:00Z')?.date === '2026-06-30', 'summer (EDT) date conversion')

  console.log('Large Batard (TH Sliced) = base product + TH Sliced')
  const lb = '"Account Number","Order Date","Item Code","Description","Packaging","Quantity"\n"239 centre st ny, ny 10013","2026-11-04","","Large Batard (TH Sliced)","EA","4"'
  const lbp = buildPreview(parseMamanCsv(lb, 'x'), ctx, { receivedDate: '2026-11-04', dateConfirmed: true, today: '2026-11-05' })
  ok(lbp.lines[0].productId === 'large-batard' && lbp.lines[0].slicing === 'TH Sliced' && lbp.lines[0].mappingStatus === 'confirmed', 'maps to large-batard / TH Sliced, confirmed')
  ok(blockingCount(lbp) === 0, 'no blocking issues', JSON.stringify(allIssues(lbp).filter(i => i.severity === 'blocking')))

  console.log('Read-only guard (source scan)')
  const root = path.resolve(__dirname, '..', '..')
  const files = fs.readdirSync(path.join(root, 'src/lib/poimport')).map(f => path.join(root, 'src/lib/poimport', f))
  files.push(path.join(root, 'src/app/orders/import/page.tsx'))
  const forbidden = [/\bsetDoc\b/, /\baddDoc\b/, /\bupdateDoc\b/, /\bdeleteDoc\b/, /\bwriteBatch\b/, /\brunTransaction\b/, /ordersService/, /recurringService/, /\.(create|update|delete|cancel|save)\(/, /fetch\(/, /api\/freshbooks/, /\bsendToZapier\b/]
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    const hit = forbidden.find(re => re.test(text))
    ok(!hit, `${path.basename(f)} has no write/network calls`, hit ? String(hit) : '')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
main()
