// Turns new emails from the inbox into saved "inbox records" (one per email), each exactly once.
// It only RECORDS what arrived; it never creates orders. An admin reviews each record in the
// PO Importer. Pure logic: Gmail and the database are passed in, so it can be tested without either.
import { createHash } from 'crypto'
import { parseOrderEmail, EmailKind } from '../poimport/email'
import { MessageMeta } from './gmail'

export type InboxStatus = 'new' | 'needs_attention' | 'ignored' | 'order_created' | 'duplicate'

export interface InboxRecord {
  gmailId: string
  status: InboxStatus
  kind: EmailKind | 'other'
  subject: string
  from: string
  receivedAt: string | null
  receivedLocal: string | null
  poNumber: string | null
  location: string | null
  itemCount: number | null
  blockingAtParse: number | null
  senderVerified: boolean | null
  notes: string[]
  fileName: string | null
  raw: string | null            // the original email, base64, so the PO Importer can open it
  duplicateOf: string | null
  signature: string | null      // fingerprint of the order contents, used to tell a re-send from a revision
  orderId: string | null        // set when an admin approves the email and an order is created
  createdAt: string
  handledBy: string | null
  handledAt: string | null
}

export interface InboxStore {
  existing(ids: string[]): Promise<Set<string>>
  findByPo(kind: EmailKind, po: string): Promise<{ id: string; signature: string | null } | null>
  create(id: string, rec: InboxRecord): Promise<'created' | 'exists'>
}

export interface Deps {
  store: InboxStore
  getMeta(id: string): Promise<MessageMeta>
  getRaw(id: string): Promise<Uint8Array>
  pdfjs?: () => any
  now?: () => Date
}

const MAX_RAW_BYTES = 600_000   // Firestore documents are limited to 1 MB

// Order emails are recognised by their subject; everything else from these senders is not an order.
export function kindFromSubject(subject: string): EmailKind | null {
  const s = subject.trim()
  if (/^order for maman\b/i.test(s)) return 'maman'
  if (/^purchase order from\b/i.test(s)) return 'westville'
  return null
}

// A fingerprint of what the order says (PO number, products and quantities), so an identical
// re-send can be told apart from a revised order. Whitespace and row order do not matter.
export function orderSignature(kind: EmailKind, parsed: any, po: string | null): string {
  const rows: string[] = kind === 'maman'
    ? (parsed.rows || []).filter((r: any) => r.quantity).map((r: any) => `${r.code}|${r.description}|${r.quantity}`)
    : (parsed.lines || []).map((l: any) => `${l.item}|${l.vendorDescription}|${l.quantity}|${l.unitPrice}`)
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim()
  const text = [kind, (po || '').trim(), ...rows.map(norm).sort(), parsed.deliveryDate || ''].join('\n')
  return createHash('sha1').update(text).digest('hex')
}

export interface RunSummary { seen: number; skipped: number; created: number; byStatus: Record<string, number>; errors: string[] }

export async function processMessages(ids: string[], deps: Deps): Promise<RunSummary> {
  const now = deps.now || (() => new Date())
  const known = await deps.store.existing(ids)
  const out: RunSummary = { seen: ids.length, skipped: 0, created: 0, byStatus: {}, errors: [] }

  // Oldest first, so the first email received is the one kept as the original.
  const metas: MessageMeta[] = []
  for (const id of ids) {
    if (known.has(id)) { out.skipped++; continue }
    try { metas.push(await deps.getMeta(id)) } catch (err: any) { out.errors.push(`${id}: ${err?.message || err}`) }
  }
  metas.sort((a, b) => (a.receivedAt || '9999').localeCompare(b.receivedAt || '9999'))

  for (const meta of metas) {
    const id = meta.id
    try {
      const base: InboxRecord = {
        gmailId: id, status: 'ignored', kind: 'other', subject: meta.subject, from: meta.from,
        receivedAt: meta.receivedAt, receivedLocal: null, poNumber: null, location: null, itemCount: null,
        blockingAtParse: null, senderVerified: null, notes: [], fileName: null, raw: null, duplicateOf: null,
        signature: null, orderId: null,
        createdAt: now().toISOString(), handledBy: null, handledAt: null,
      }
      const kind = kindFromSubject(meta.subject)
      let rec: InboxRecord = base
      if (!kind) {
        rec = { ...base, notes: ['Not an order (subject does not start with "Order for Maman" or "Purchase Order From").'] }
      } else {
        const raw = await deps.getRaw(id)
        const res = await parseOrderEmail(raw, `${id}.eml`, { pdfjs: deps.pdfjs ? deps.pdfjs() : undefined })
        const rawB64 = raw.length <= MAX_RAW_BYTES ? Buffer.from(raw).toString('base64') : null
        if (!res.ok) {
          rec = { ...base, status: 'needs_attention', kind, raw: rawB64, notes: [res.error, 'It could be a revised or cancelled order. Check the email in the inbox.'] }
        } else {
          const p: any = res.parsed
          const e = p.email || {}
          const problems: any[] = p.problems || []
          const notes: string[] = problems.filter(x => x.severity !== 'info').slice(0, 5).map(x => x.message)
          let status: InboxStatus = 'new'
          const po: string | null = e.poNumber || p.poNumber || null
          const signature = orderSignature(res.kind, p, po)
          let duplicateOf: string | null = null
          if (!e.senderVerified) { status = 'needs_attention'; notes.unshift('Sender could not be verified.') }
          if (rawB64 === null) { status = 'needs_attention'; notes.unshift('Email is too large to store; open it in Gmail.') }
          if (!po) { status = 'needs_attention'; notes.unshift('No PO number found, so duplicates cannot be checked.') }
          if (po) {
            const earlier = await deps.store.findByPo(res.kind, po)
            if (earlier) {
              duplicateOf = earlier.id
              if (earlier.signature && earlier.signature === signature) {
                status = 'duplicate'
                notes.unshift(`Identical re-send of an email already recorded (${earlier.id}). Nothing to do.`)
              } else {
                status = 'needs_attention'
                notes.unshift(`Same PO number as an earlier email (${earlier.id}) but the contents differ. Possible revision.`)
              }
            }
          }
          rec = {
            ...base, status, kind: res.kind, receivedLocal: e.receivedLocal || null, receivedAt: e.receivedAt || base.receivedAt,
            poNumber: po, location: e.subjectLocation || p.location || null,
            itemCount: res.kind === 'maman' ? p.rows.length : p.lines.length,
            blockingAtParse: problems.filter(x => x.severity === 'blocking').length,
            senderVerified: !!e.senderVerified, notes, fileName: e.attachmentName || null, raw: rawB64, duplicateOf, signature,
          }
        }
      }
      const r = await deps.store.create(id, rec)
      if (r === 'created') { out.created++; out.byStatus[rec.status] = (out.byStatus[rec.status] || 0) + 1 } else out.skipped++
    } catch (err: any) {
      out.errors.push(`${id}: ${err?.message || err}`)
    }
  }
  return out
}
