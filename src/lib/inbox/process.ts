// Turns new emails from the inbox into saved "inbox records" (one per email), each exactly once.
// It only RECORDS what arrived; it never creates orders. An admin reviews each record in the
// PO Importer. Pure logic: Gmail and the database are passed in, so it can be tested without either.
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
  createdAt: string
  handledBy: string | null
  handledAt: string | null
}

export interface InboxStore {
  existing(ids: string[]): Promise<Set<string>>
  findByPo(kind: EmailKind, po: string): Promise<string | null>
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

export interface RunSummary { seen: number; skipped: number; created: number; byStatus: Record<string, number>; errors: string[] }

export async function processMessages(ids: string[], deps: Deps): Promise<RunSummary> {
  const now = deps.now || (() => new Date())
  const known = await deps.store.existing(ids)
  const out: RunSummary = { seen: ids.length, skipped: 0, created: 0, byStatus: {}, errors: [] }

  for (const id of ids) {
    if (known.has(id)) { out.skipped++; continue }
    try {
      const meta = await deps.getMeta(id)
      const base: InboxRecord = {
        gmailId: id, status: 'ignored', kind: 'other', subject: meta.subject, from: meta.from,
        receivedAt: meta.receivedAt, receivedLocal: null, poNumber: null, location: null, itemCount: null,
        blockingAtParse: null, senderVerified: null, notes: [], fileName: null, raw: null, duplicateOf: null,
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
          let duplicateOf: string | null = null
          if (!e.senderVerified) { status = 'needs_attention'; notes.unshift('Sender could not be verified.') }
          if (rawB64 === null) { status = 'needs_attention'; notes.unshift('Email is too large to store; open it in Gmail.') }
          if (!po) { status = 'needs_attention'; notes.unshift('No PO number found, so duplicates cannot be checked.') }
          if (po) {
            duplicateOf = await deps.store.findByPo(res.kind, po)
            if (duplicateOf) { status = 'needs_attention'; notes.unshift(`Same PO number as an earlier email (${duplicateOf}). Possible re-send or revision.`) }
          }
          rec = {
            ...base, status, kind: res.kind, receivedLocal: e.receivedLocal || null, receivedAt: e.receivedAt || base.receivedAt,
            poNumber: po, location: e.subjectLocation || p.location || null,
            itemCount: res.kind === 'maman' ? p.rows.length : p.lines.length,
            blockingAtParse: problems.filter(x => x.severity === 'blocking').length,
            senderVerified: !!e.senderVerified, notes, fileName: e.attachmentName || null, raw: rawB64, duplicateOf,
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
