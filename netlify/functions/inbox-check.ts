// Scheduled function: looks in the admin@ inbox for new Maman / Westville order emails.
//
// STAGE 3a, TEST MODE: read-only. It lists matching emails from the last few days, runs the
// same parser the PO Importer uses, and writes a short summary to the function log. It does NOT
// create orders, save anything to the database, or change the mailbox.
// View the result in Netlify: Logs and metrics > Functions > inbox-check.
import { listMessageIds, getRawMessage } from '../../src/lib/inbox/gmail'
import { parseOrderEmail } from '../../src/lib/poimport/email'

const QUERY = '(from:marginedge.com OR from:restaurant365.com) newer_than:3d'
const MAX_MESSAGES = 20

export const handler = async () => {
  const started = Date.now()
  try {
    const ids = await listMessageIds(QUERY, MAX_MESSAGES)
    console.log(`[inbox-check] ${ids.length} matching email(s) in the last 3 days`)
    if (ids.length === 0) return { statusCode: 200, body: 'No matching emails' }

    // pdf.js (reads the Westville PDF) is loaded only if needed
    let pdfjs: any = null
    const loadPdf = () => (pdfjs ||= require('pdfjs-dist/legacy/build/pdf.js'))

    let ok = 0
    for (const id of ids) {
      try {
        const raw = await getRawMessage(id)
        const res = await parseOrderEmail(raw, `${id}.eml`, { pdfjs: loadPdf() })
        if (!res.ok) {
          console.log(`[inbox-check] ${id}: not an order email I can read (${res.error})`)
          continue
        }
        const p: any = res.parsed
        const e = p.email || {}
        const size = res.kind === 'maman' ? `${p.rows.length} rows` : `${p.lines.length} lines`
        const blocking = (p.problems || []).filter((x: any) => x.severity === 'blocking').length
        console.log(
          `[inbox-check] ${res.kind} | "${e.subject}" | received ${e.receivedLocal} | PO ${e.poNumber || p.poNumber || '-'} | ` +
          `sender verified: ${e.senderVerified} | ${size} | ${blocking} blocking at parse`
        )
        ok++
      } catch (err: any) {
        console.log(`[inbox-check] ${id}: error ${err?.message || err}`)
      }
    }
    console.log(`[inbox-check] done: ${ok}/${ids.length} read OK in ${Date.now() - started} ms (nothing saved)`)
    return { statusCode: 200, body: `Checked ${ids.length}` }
  } catch (err: any) {
    console.log(`[inbox-check] FAILED: ${err?.message || err}`)
    return { statusCode: 500, body: 'Inbox check failed, see function log' }
  }
}
