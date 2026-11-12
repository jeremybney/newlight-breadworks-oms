// Scheduled function: records new Maman / Westville emails from the admin@ inbox, once each.
//
// STAGE 3b. It reads Gmail (read-only permission) and saves one record per email in the Firestore
// collection "poEmails". It does NOT create orders and does NOT change the mailbox. An admin
// reviews each record on the PO Importer page. Emails already recorded are skipped, so nothing is
// ever recorded twice, even if the same email stays in the search window.
import { listMessageIds, getRawMessage, getMessageMeta } from '../../src/lib/inbox/gmail'
import { processMessages, InboxStore, InboxRecord } from '../../src/lib/inbox/process'

const QUERY = '(from:marginedge.com OR from:restaurant365.com) newer_than:3d'
const MAX_MESSAGES = 100

function getAdminDb() {
  const admin = require('firebase-admin')
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  }
  return admin.firestore()
}

function firestoreStore(db: any): InboxStore {
  const col = db.collection('poEmails')
  return {
    async existing(ids) {
      const found = new Set<string>()
      if (!ids.length) return found
      const snaps = await db.getAll(...ids.map(id => col.doc(id)), { fieldMask: ['status'] })
      snaps.forEach((s: any) => { if (s.exists) found.add(s.id) })
      return found
    },
    async findByPo(kind, po) {
      const snap = await col.where('poNumber', '==', po).get()
      // the oldest record with this PO is the original
      const hits = snap.docs.filter((d: any) => d.data().kind === kind)
        .sort((a: any, b: any) => String(a.data().receivedAt || '').localeCompare(String(b.data().receivedAt || '')))
      return hits.length ? { id: hits[0].id, signature: hits[0].data().signature || null } : null
    },
    async create(id, rec: InboxRecord) {
      try { await col.doc(id).create(rec); return 'created' } catch (e: any) {
        if (e?.code === 6 || /already exists/i.test(String(e?.message))) return 'exists'
        throw e
      }
    },
  }
}

export const handler = async () => {
  const started = Date.now()
  try {
    const ids = await listMessageIds(QUERY, MAX_MESSAGES)
    let pdfjs: any = null
    const summary = await processMessages(ids, {
      store: firestoreStore(getAdminDb()),
      getMeta: getMessageMeta,
      getRaw: getRawMessage,
      pdfjs: () => (pdfjs ||= require('pdfjs-dist/legacy/build/pdf.js')),
    })
    console.log(
      `[inbox-check] ${summary.seen} in window, ${summary.skipped} already recorded, ${summary.created} new record(s) ` +
      `${JSON.stringify(summary.byStatus)} in ${Date.now() - started} ms`
    )
    summary.errors.forEach(e => console.log(`[inbox-check] error ${e}`))
    return { statusCode: 200, body: `Checked ${summary.seen}, recorded ${summary.created}` }
  } catch (err: any) {
    console.log(`[inbox-check] FAILED: ${err?.message || err}`)
    return { statusCode: 500, body: 'Inbox check failed, see function log' }
  }
}
