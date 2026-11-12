// Tests for the inbox recorder (src/lib/inbox/process.ts) using fake Gmail and a fake database.
// Run with: npx tsx tests/poimport/inbox.ts
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { processMessages, kindFromSubject, InboxRecord, InboxStore } from '../../src/lib/inbox/process'
import * as F from './fixtures'

let pass = 0, fail = 0
const ok = (c: boolean, name: string, extra = '') => { if (c) pass++; else { fail++; console.log('  FAIL:', name, extra) } }

const pdfjs = createRequire(path.resolve(__dirname, '..', '..', 'package.json'))('pdfjs-dist/legacy/build/pdf.js')
const AUTH = (d: string) => `mx.google.com; dkim=pass header.i=@${d}; dmarc=pass (p=NONE) header.from=${d}`
const b64 = (t: string) => Buffer.from(t, 'utf8').toString('base64')
function eml(o: { from: string; subject: string; date: string; auth?: string; html: string; file?: string; type?: string; b64?: string }): Uint8Array {
  const lines = [`From: ${o.from}`, 'To: orders@example.test', `Subject: ${o.subject}`, `Date: ${o.date}`, 'MIME-Version: 1.0',
    ...(o.auth ? [`Authentication-Results: ${o.auth}`] : []), 'Content-Type: multipart/mixed; boundary="BND"', '',
    '--BND', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(o.html), '']
  if (o.file) lines.push('--BND', `Content-Type: ${o.type}; name="${o.file}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${o.file}"`, '', o.b64!, '')
  lines.push('--BND--', '')
  return new TextEncoder().encode(lines.join('\r\n'))
}
const csv = '"Account Number","Order Date","Item Code","Description","Packaging","Quantity"\n"12 West 48th Street, NY,NY 10036","2026-11-09","SD302","Large Sourdough Batard","EA","5"\n'
const mHtml = (po: string) => `<html><body><!-- When the commissary tenant ships the order --><table><tr><td><strong>Purchase Order #:</strong></td><td><div><span>${po}</span></div></td></tr></table></body></html>`

const emails: Record<string, { subject: string; from: string; receivedAt: string; raw: Uint8Array }> = {
  m1: { subject: 'Order for Maman - Rockefeller', from: 'no-reply@marginedge.com', receivedAt: '2026-11-09T21:42:16.000Z',
        raw: eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Rockefeller', date: 'Mon, 09 Nov 2026 21:42:16 +0000', auth: AUTH('marginedge.com'), html: mHtml('1115551'), file: 'o.csv', type: 'text/csv', b64: b64(csv) }) },
  m1dup: { subject: 'Order for Maman - Rockefeller', from: 'no-reply@marginedge.com', receivedAt: '2026-11-09T22:00:00.000Z',
        raw: eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Rockefeller', date: 'Mon, 09 Nov 2026 22:00:00 +0000', auth: AUTH('marginedge.com'), html: mHtml('1115551'), file: 'o.csv', type: 'text/csv', b64: b64(csv) }) },
  m1rev: { subject: 'Order for Maman - Rockefeller', from: 'no-reply@marginedge.com', receivedAt: '2026-11-09T23:00:00.000Z',
        raw: eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Rockefeller', date: 'Mon, 09 Nov 2026 23:00:00 +0000', auth: AUTH('marginedge.com'), html: mHtml('1115551'), file: 'o.csv', type: 'text/csv', b64: b64(csv.replace('"5"', '"9"')) }) },
  w1: { subject: 'Purchase Order From Westville LIC', from: 'noreply@restaurant365.com', receivedAt: '2026-11-07T12:18:02.000Z',
        raw: eml({ from: 'noreply@restaurant365.com', subject: 'Purchase Order From Westville LIC', date: 'Sat, 07 Nov 2026 12:18:02 +0000', auth: AUTH('restaurant365.com'), html: '<p>PO</p>', file: 'PO - 196114.pdf', type: 'application/pdf', b64: F.PDF_196114_B64 }) },
  stmt: { subject: 'Requesting statement for Maman - 18th Street', from: 'no-reply@marginedge.com', receivedAt: '2026-11-10T20:00:00.000Z',
        raw: eml({ from: 'no-reply@marginedge.com', subject: 'Requesting statement for Maman - 18th Street', date: 'Tue, 10 Nov 2026 20:00:00 +0000', auth: AUTH('marginedge.com'), html: 'hello' }) },
  nocsv: { subject: 'Order for Maman - Hudson', from: 'no-reply@marginedge.com', receivedAt: '2026-11-10T21:00:00.000Z',
        raw: eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Hudson', date: 'Tue, 10 Nov 2026 21:00:00 +0000', auth: AUTH('marginedge.com'), html: 'cancelled' }) },
  spoof: { subject: 'Order for Maman - Rockefeller', from: 'orders@marginedge.com.evil.test', receivedAt: '2026-11-10T21:00:00.000Z',
        raw: eml({ from: 'orders@marginedge.com.evil.test', subject: 'Order for Maman - Rockefeller', date: 'Tue, 10 Nov 2026 21:00:00 +0000', auth: AUTH('marginedge.com.evil.test'), html: mHtml('9995551'), file: 'o.csv', type: 'text/csv', b64: b64(csv) }) },
}

function fakeStore() {
  const docs = new Map<string, InboxRecord>()
  const store: InboxStore = {
    async existing(ids) { return new Set(ids.filter(i => docs.has(i))) },
    async findByPo(kind, po) { for (const [id, r] of docs) if (r.kind === kind && r.poNumber === po) return { id, signature: r.signature }; return null },
    async create(id, rec) { if (docs.has(id)) return 'exists'; docs.set(id, rec); return 'created' },
  }
  return { docs, store }
}
let rawFetches = 0
const deps = (store: InboxStore) => ({
  store, pdfjs: () => pdfjs, now: () => new Date('2026-11-11T19:00:00Z'),
  getMeta: async (id: string) => { const e = emails[id]; return { id, subject: e.subject, from: e.from, receivedAt: e.receivedAt } },
  getRaw: async (id: string) => { rawFetches++; return emails[id].raw },
})

;(async () => {
  console.log('Inbox recorder tests')
  ok(kindFromSubject('Order for Maman - Soho') === 'maman', 'Maman subject')
  ok(kindFromSubject('Purchase Order From Westville UES') === 'westville', 'Westville subject')
  ok(kindFromSubject('Requesting statement for Maman - 18th Street') === null, 'statement request is not an order')

  const { docs, store } = fakeStore()
  const ids = ['m1dup', 'spoof', 'nocsv', 'stmt', 'w1', 'm1rev', 'm1']   // newest-first, as Gmail lists them
  const r1 = await processMessages(ids, deps(store))
  ok(r1.created === 7 && r1.errors.length === 0, 'first run records all six', JSON.stringify(r1))
  ok(docs.get('m1')!.status === 'new' && docs.get('m1')!.poNumber === '1115551' && !!docs.get('m1')!.raw, 'Maman order recorded as new, with PO and original email')
  ok(docs.get('w1')!.status === 'new' && docs.get('w1')!.poNumber === '196114' && docs.get('w1')!.kind === 'westville', 'Westville order recorded as new')
  ok(docs.get('stmt')!.status === 'ignored' && docs.get('stmt')!.raw === null, 'statement request ignored, nothing stored')
  ok(docs.get('nocsv')!.status === 'needs_attention' && docs.get('nocsv')!.notes.join(' ').includes('no CSV'), 'order email without CSV needs attention')
  ok(docs.get('m1')!.status === 'new' && docs.get('m1')!.duplicateOf === null, 'the oldest email is kept as the original even though Gmail lists it last')
  ok(docs.get('m1dup')!.status === 'duplicate' && docs.get('m1dup')!.duplicateOf === 'm1', 'an identical re-send is labelled Duplicate of the original')
  ok(docs.get('m1rev')!.status === 'needs_attention' && /differ/.test(docs.get('m1rev')!.notes.join(' ')), 'same PO with different contents needs attention (possible revision)')
  const noPo = fakeStore()
  emails.nopo = { subject: 'Order for Maman - Soho', from: 'no-reply@marginedge.com', receivedAt: '2026-11-10T21:00:00.000Z', raw: eml({ from: 'no-reply@marginedge.com', subject: 'Order for Maman - Soho', date: 'Tue, 10 Nov 2026 21:00:00 +0000', auth: AUTH('marginedge.com'), html: '<p>no po here</p>', file: 'o.csv', type: 'text/csv', b64: b64(csv) }) }
  await processMessages(['nopo'], deps(noPo.store))
  ok(noPo.docs.get('nopo')!.status === 'needs_attention', 'Maman email with no PO number needs attention')
  ok(docs.get('spoof')!.status !== 'new', 'look-alike sender is never recorded as new', docs.get('spoof')!.status)
  ok(docs.get('m1')!.receivedLocal!.includes('4:42 PM'), 'received time in New York time')

  const fetchesBefore = rawFetches
  const r2 = await processMessages(ids, deps(store))
  ok(r2.created === 0 && r2.skipped === 7 && docs.size === 7, 'second run records nothing new', JSON.stringify(r2))
  ok(rawFetches === fetchesBefore, 'second run does not even download the emails again')

  // an edit made by an admin survives the next run
  docs.get('m1')!.status = 'ignored'
  await processMessages(ids, deps(store))
  ok(docs.get('m1')!.status === 'ignored', 'admin status change is not overwritten')

  // a failure on one email does not stop the others
  const r3 = await processMessages(['bad', 'stmt'], { ...deps(store), getMeta: async (id: string) => { if (id === 'bad') throw new Error('boom'); return deps(store).getMeta(id) } })
  ok(r3.errors.length === 1 && r3.skipped === 1, 'one failing email does not stop the run', JSON.stringify(r3))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
