// Scheduled function: emails the daily pretzel order (PDF) to the Schripps production team.
// Runs on Netlify's cron (see netlify.toml). The cron fires at two UTC hours to cover
// EDT/EST, and this code only sends when the current Eastern-time hour equals
// SEND_HOUR_ET, so the "wrong" run each day does nothing and daylight-saving changes
// are handled automatically.
//
// Covers the NEXT day's deliveries; on Saturday it covers Sunday + Monday combined.
// Only Schripps-flagged pretzel products are included.

// ── Settings you may want to change ──────────────────────────────────────────
const SEND_HOUR_ET = 14 // 0-23, Eastern time. Must match the cron hours in netlify.toml.
const SEND_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] // days the email goes out
const RECIPIENTS: string[] = ['crook.ren@gmail.com'] // TESTING: swap for the Schripps team later
const CC: string[] = []
const SHOW_ZERO_ROWS = true // list pretzel products even when today's quantity is 0
const SKIP_IF_ALL_ZERO = false // true = send nothing when every quantity is 0

// ── Time helpers (Eastern time, no extra deps) ───────────────────────────────
function getETParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  let hour = parseInt(get('hour'), 10)
  if (hour === 24) hour = 0
  return { year: get('year'), month: get('month'), day: get('day'), hour, weekday: get('weekday') }
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().split('T')[0]
}

// ── Firestore (Admin SDK) ────────────────────────────────────────────────────
function getAdminDb() {
  const admin = require('firebase-admin')
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  }
  return admin.firestore()
}

async function getOrdersByDate(db: any, dateStr: string) {
  const snap = await db.collection('orders').where('deliveryDate', '==', dateStr).get()
  return snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((o: any) => o.status !== 'cancelled')
}

// ── Pretzel quantities ───────────────────────────────────────────────────────
async function buildPretzelRows(db: any, orders: any[]) {
  const productSnap = await db.collection('products').get()
  const pretzels: { id: string; name: string; sortOrder: number }[] = []
  productSnap.docs.forEach((d: any) => {
    const p = d.data()
    const isPretzel = p.category === 'PRETZEL' || /pretzel/i.test(p.name || '')
    if (p.isSchripps === true && isPretzel && p.active !== false) {
      pretzels.push({ id: d.id, name: p.name, sortOrder: p.sortOrder ?? 9999 })
    }
  })

  const qty: Record<string, number> = {}
  for (const order of orders) {
    for (const item of order.items || []) {
      qty[item.productId] = (qty[item.productId] || 0) + item.quantity
    }
  }

  return pretzels
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(p => ({ name: p.name, qty: qty[p.id] || 0 }))
    .filter(r => SHOW_ZERO_ROWS || r.qty > 0)
}

// ── PDF (mirrors the Google Sheets pretzel order: dated header, "Units", PRETZEL DOUGH) ──
async function buildPdf(dateLabel: string, rows: { name: string; qty: number }[]) {
  const { jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const tableW = 360
  const margin = (pageW - tableW) / 2

  ;(doc as any).autoTable({
    startY: 60,
    margin: { left: margin, right: margin },
    tableWidth: tableW,
    theme: 'grid',
    styles: { lineColor: [0, 0, 0], lineWidth: 0.75, fontSize: 11, cellPadding: 4, textColor: [20, 20, 20] },
    columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 100, halign: 'center' } },
    head: [[
      { content: dateLabel, styles: { fillColor: [43, 107, 166], textColor: 255, fontSize: 20, fontStyle: 'bold', halign: 'left', cellPadding: 6 } },
      { content: 'Units', styles: { fillColor: [217, 217, 217], textColor: [40, 40, 40], fontSize: 9, fontStyle: 'italic', halign: 'center' } },
    ]],
    body: [
      [{ content: 'PRETZEL DOUGH', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [242, 242, 242] } }],
      ...rows.map(r => [r.name, String(r.qty)]),
    ],
  })

  return Buffer.from(doc.output('arraybuffer'))
}

// ── Email (Resend) ───────────────────────────────────────────────────────────
async function sendEmail(dateLabel: string, fileDate: string, pdf: Buffer) {
  const { Resend } = require('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.SCHRIPPS_FROM_EMAIL || 'Newlight Breadworks <onboarding@resend.dev>',
    to: RECIPIENTS,
    cc: CC,
    subject: `Newlight Breadworks Pretzel Order ${dateLabel}`,
    html: `<p>Hello,</p><p>Please see our pretzel order for ${dateLabel} attached.</p><p>Best,<br>Newlight Breadworks Team</p>`,
    attachments: [{ filename: `Pretzel_Order_${fileDate}.pdf`, content: pdf.toString('base64') }],
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async () => {
  const et = getETParts()

  if (et.hour !== SEND_HOUR_ET || !SEND_DAYS.includes(et.weekday)) {
    console.log(`Skipping — ET ${et.weekday} ${et.hour}:00 is not the send time.`)
    return { statusCode: 200 }
  }

  try {
    const db = getAdminDb()
    const today = `${et.year}-${et.month}-${et.day}`
    const isSaturday = et.weekday === 'Sat'

    const orders = isSaturday
      ? [
          ...(await getOrdersByDate(db, addDaysToDateStr(today, 1))),
          ...(await getOrdersByDate(db, addDaysToDateStr(today, 2))),
        ]
      : await getOrdersByDate(db, addDaysToDateStr(today, 1))

    const rows = await buildPretzelRows(db, orders)
    if (rows.length === 0 || (SKIP_IF_ALL_ZERO && rows.every(r => r.qty === 0))) {
      console.log('No pretzel quantities — nothing sent.')
      return { statusCode: 200 }
    }

    const dateLabel = `${et.month}/${et.day}/${et.year}` // today's date, like the current sheet
    const pdf = await buildPdf(dateLabel, rows)
    await sendEmail(dateLabel, `${et.year}-${et.month}-${et.day}`, pdf)
    console.log(`Pretzel order emailed for ${dateLabel} (${rows.length} rows).`)
    return { statusCode: 200 }
  } catch (err: any) {
    console.error('Pretzel order email failed:', err.message, err.stack)
    return { statusCode: 500 }
  }
}
