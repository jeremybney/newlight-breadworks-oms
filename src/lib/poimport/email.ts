// Reads an order email (.eml file): who sent it, when it arrived (New York time), the PO number in
// the body (Maman), and the CSV/PDF attachment, which is then parsed by the Maman/Westville parsers.
// Read-only: parsing only. Nothing here sends, stores or changes anything.
import PostalMime from 'postal-mime'
import { Issue, EmailMeta, ParsedPo } from './types'
import { parseMamanCsv } from './maman'
import { looksLikeWestvillePo, parseWestvillePo } from './westville'
import { extractPdfItemsFromBytes } from './pdfText'
import { normText } from './mappings'

export type EmailKind = 'maman' | 'westville'

// The platform each customer's orders are sent through. The mail must come from this domain
// AND pass the receiving server's DMARC check for it, otherwise the order is blocked.
const SENDER_DOMAIN: Record<EmailKind, string> = {
  maman: 'marginedge.com',
  westville: 'restaurant365.com',
}

export type ParsedEmailResult =
  | { ok: true; kind: EmailKind; parsed: ParsedPo }
  | { ok: false; error: string }

const issue = (severity: Issue['severity'], code: string, message: string): Issue => ({ severity, code, message })

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim()
}

// New York calendar date and a readable time for an ISO timestamp.
export function newYorkParts(iso: string): { date: string; local: string } | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(d)
  return { date, local }
}

function senderDomain(addr: string): string {
  return (addr.split('@')[1] || '').toLowerCase()
}
const domainMatches = (domain: string, expected: string) => domain === expected || domain.endsWith('.' + expected)

export async function parseOrderEmail(
  raw: ArrayBuffer | Uint8Array,
  fileName: string,
  opts: { pdfjs?: any } = {},
): Promise<ParsedEmailResult> {
  let email
  try {
    email = await PostalMime.parse(raw)
  } catch (e: any) {
    return { ok: false, error: `Could not read this email file: ${e?.message || e}` }
  }

  const fromAddr = (email.from?.address || '').toLowerCase()
  const domain = senderDomain(fromAddr)
  const kind = (Object.keys(SENDER_DOMAIN) as EmailKind[]).find(k => domainMatches(domain, SENDER_DOMAIN[k]))
  if (!kind) {
    return { ok: false, error: `This email is from "${fromAddr || 'an unknown sender'}", which is not a recognized Maman (MarginEdge) or Westville (Restaurant365) order sender.` }
  }

  // ── Sender authenticity: DMARC must pass for the expected domain ──
  const authHeaders = email.headers.filter(h => h.key === 'authentication-results').map(h => h.value)
  const dmarcPass = authHeaders.some(v => {
    if (!/dmarc=pass/i.test(v)) return false
    const m = v.match(/header\.from=([^\s;]+)/i)
    return !!m && domainMatches(m[1].toLowerCase(), SENDER_DOMAIN[kind])
  })

  const when = email.date ? newYorkParts(email.date) : null
  const subject = (email.subject || '').trim()
  const problems: Issue[] = []

  if (!dmarcPass) {
    problems.push(issue('blocking', 'sender-unauthenticated', `This email claims to be from ${SENDER_DOMAIN[kind]}, but its headers do not show a passing DMARC check. Do not use it until you have confirmed it is genuine.`))
  }
  if (!when) problems.push(issue('blocking', 'email-date', 'Could not read when the email was sent.'))

  const atts = email.attachments.filter(a => a.disposition !== 'inline' || a.filename)
  const bytesOf = (a: { content: ArrayBuffer | Uint8Array | string }) =>
    typeof a.content === 'string' ? new TextEncoder().encode(a.content) : new Uint8Array(a.content as ArrayBuffer)

  const meta: EmailMeta = {
    fileName,
    from: fromAddr,
    subject,
    messageId: email.messageId || null,
    receivedAt: email.date || null,
    receivedDate: when?.date || null,
    receivedLocal: when?.local || '',
    senderVerified: dmarcPass,
    senderNote: dmarcPass ? `DMARC pass for ${SENDER_DOMAIN[kind]}` : 'DMARC not verified',
    poNumber: null,
    subjectLocation: null,
    attachmentName: '',
  }

  // ───────────────────────── MAMAN (MarginEdge) ─────────────────────────
  if (kind === 'maman') {
    const csvs = atts.filter(a => /csv/i.test(a.mimeType) || /\.csv$/i.test(a.filename || ''))
    if (!csvs.length) return { ok: false, error: 'This Maman email has no CSV attachment.' }
    const csv = csvs[0]
    meta.attachmentName = csv.filename || 'order.csv'
    const parsed = parseMamanCsv(new TextDecoder().decode(bytesOf(csv)), csv.filename || fileName)

    const bodyText = [email.text || '', email.html ? htmlToText(email.html) : ''].join(' \n ')
    const po = bodyText.match(/Purchase Order\s*(?:#|No\.?|Number)\s*:?\s*([A-Za-z0-9-]{4,})/i)
    meta.poNumber = po ? po[1] : null
    const sub = subject.match(/^\s*(?:(?:re|fwd?):\s*)*Order for\s+(Maman\s*-\s*.+?)\s*$/i)
    meta.subjectLocation = sub ? sub[1].replace(/\s*-\s*/, ' - ') : null

    if (csvs.length > 1) problems.push(issue('warning', 'multi-attachment', `The email has ${csvs.length} CSV attachments; only the first (${meta.attachmentName}) was read.`))
    if (!meta.poNumber) problems.push(issue('warning', 'po-missing', 'Could not find a "Purchase Order #" in the email body.'))
    if (!meta.subjectLocation) problems.push(issue('warning', 'subject-location', `The subject "${subject}" is not in the form "Order for Maman - <location>", so the location comes from the CSV address only.`))

    parsed.email = meta
    parsed.problems.push(...problems)
    return { ok: true, kind, parsed }
  }

  // ───────────────────────── WESTVILLE (Restaurant365) ─────────────────────────
  const pdfs = atts.filter(a => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.filename || ''))
  if (!pdfs.length) return { ok: false, error: 'This Westville email has no PDF attachment.' }
  const pdf = pdfs[0]
  meta.attachmentName = pdf.filename || 'po.pdf'
  let items
  try {
    items = await extractPdfItemsFromBytes(bytesOf(pdf), opts.pdfjs)
  } catch (e: any) {
    return { ok: false, error: `Could not read the PDF attachment: ${e?.message || e}` }
  }
  if (!looksLikeWestvillePo(items)) return { ok: false, error: 'The PDF attachment is not in the Westville purchase-order format, or has no readable text.' }
  const parsed = parseWestvillePo(items, meta.attachmentName)

  const sub = subject.match(/^\s*(?:(?:re|fwd?):\s*)*Purchase Order From\s+(.+?)\s*$/i)
  meta.subjectLocation = sub ? sub[1] : null
  if (meta.subjectLocation && parsed.location && normText(meta.subjectLocation) !== normText(parsed.location)) {
    problems.push(issue('warning', 'subject-location-differs', `The subject says "${meta.subjectLocation}" but the PDF says "${parsed.location}".`))
  }
  const fileNo = (pdf.filename || '').match(/PO\s*-?\s*(\d+)/i)
  if (fileNo && parsed.poNumber && fileNo[1] !== parsed.poNumber) {
    problems.push(issue('warning', 'po-filename-differs', `The attachment is named "${pdf.filename}" but the PO inside says ${parsed.poNumber}.`))
  }
  if (pdfs.length > 1) problems.push(issue('warning', 'multi-attachment', `The email has ${pdfs.length} PDF attachments; only the first (${meta.attachmentName}) was read.`))

  parsed.email = meta
  parsed.problems.push(...problems)
  return { ok: true, kind, parsed }
}
