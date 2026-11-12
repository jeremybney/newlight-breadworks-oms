'use client'
// The Approve step for an order that came from the email inbox. This is the ONLY place on the
// PO Importer page that writes anything. It can do nothing unless the setting
// poImportSettings/main.approvalEnabled is true (it is off until the owner turns it on in Firebase).
// Safety order: re-check the order is ready, look for duplicates, show a summary, ask for
// confirmation, claim the email so two people cannot approve it at once, create the order, then
// mark the email "Order created". If invoice creation is also switched on (poImportSettings/main.invoicesEnabled),
// the FreshBooks invoice is then created through the same route the New Order page uses, and the result is
// shown and recorded; a failed invoice never undoes the order and can be retried.
import { useState } from 'react'
import { collection, doc, getDoc, getDocs, query, runTransaction, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ordersService } from '@/lib/db'
import { Customer, Product } from '@/types'
import { PreviewOrder } from '@/lib/poimport/types'
import { blockingCount } from '@/lib/poimport/build'
import { buildOrderDraft, buildInvoicePayload, findOrderDuplicates, ExistingOrder, InvoicePayload, OrderDraft, DraftSummary, DuplicateResult } from '@/lib/poimport/approve'
import { CheckCircle, Lock } from 'lucide-react'

type Phase = 'idle' | 'checking' | 'confirm' | 'creating' | 'done' | 'error'
const money = (n: number) => `$${n.toFixed(2)}`

export default function ApproveBox({ pv, customers, products, inboxId, enabled, invoices, userId, userEmail, onCreated }: {
  pv: PreviewOrder; customers: Customer[]; products: Product[]; inboxId: string
  enabled: boolean | null; invoices: boolean; userId: string; userEmail: string; onCreated: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [errors, setErrors] = useState<string[]>([])
  const [draft, setDraft] = useState<OrderDraft | null>(null)
  const [summary, setSummary] = useState<DraftSummary | null>(null)
  const [dup, setDup] = useState<DuplicateResult | null>(null)
  const [ack, setAck] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [payload, setPayload] = useState<InvoicePayload | null>(null)
  const [invBusy, setInvBusy] = useState(false)
  const [invNumber, setInvNumber] = useState('')
  const [invError, setInvError] = useState('')

  const nBlock = blockingCount(pv)

  const sendInvoice = async (oid: string, body: InvoicePayload) => {
    setInvBusy(true); setInvError('')
    const ref = doc(db, 'poEmails', inboxId)
    try {
      // Never create a second invoice: if the order already carries one, show it instead.
      const o = await getDoc(doc(db, 'orders', oid))
      const existing = o.exists() ? (o.data() as any) : null
      if (existing?.freshbooksInvoiceId) {
        setInvNumber(existing.freshbooksInvoiceNumber || String(existing.freshbooksInvoiceId))
        await updateDoc(ref, { invoiceId: String(existing.freshbooksInvoiceId), invoiceNumber: existing.freshbooksInvoiceNumber || null, invoiceError: null })
        return
      }
      const res = await fetch('/api/freshbooks/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d: any = await res.json().catch(() => ({}))
      if (res.ok && d.invoiceNumber) {
        setInvNumber(d.invoiceNumber)
        await updateDoc(ref, { invoiceId: String(d.invoiceId || ''), invoiceNumber: d.invoiceNumber, invoiceError: null })
      } else {
        throw new Error(d.error || `FreshBooks returned status ${res.status}`)
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      setInvError(msg)
      try { await updateDoc(ref, { invoiceError: msg }) } catch {}
    } finally {
      setInvBusy(false)
    }
  }

  if (phase === 'done') {
    return (
      <div className="mt-5 p-4 rounded border border-green-400 bg-green-50 text-sm text-green-900">
        <div className="font-semibold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Order created</div>
        <div className="mt-1">Order {orderId} was created for {draft?.customerName} for delivery {draft?.deliveryDate}. Find it on the Orders pages like any other order.</div>
        {!payload && <div className="mt-1">No invoice was created (invoice creation is switched off).</div>}
        {payload && invBusy && <div className="mt-1">Creating the FreshBooks invoice…</div>}
        {payload && !invBusy && invNumber && <div className="mt-1">FreshBooks invoice <b>{invNumber}</b> was created.</div>}
        {payload && !invBusy && !invNumber && invError && (
          <div className="mt-2 p-3 rounded border border-red-300 bg-red-50 text-red-800">
            <div className="font-semibold">The order exists, but the FreshBooks invoice was not created.</div>
            <div className="mt-1">{invError}</div>
            <div className="mt-1 text-xs">If this was a timeout or a network error, check FreshBooks first. Retry never makes a second invoice if the order already has one recorded.</div>
            <button className="btn-secondary mt-2" onClick={() => sendInvoice(orderId, payload)}>Retry invoice</button>
          </div>
        )}
      </div>
    )
  }

  if (enabled !== true) {
    return (
      <div className="mt-5 p-3 rounded border border-wheat-300 bg-wheat-100 text-sm text-bark-800/80 flex gap-2 items-start">
        <Lock className="w-4 h-4 mt-0.5 shrink-0" />
        <div><b>Order creation is switched off.</b> This is a preview only. Nothing here can create an order yet.</div>
      </div>
    )
  }

  const check = async () => {
    setErrors([])
    const customer = customers.find(c => c.id === pv.customer?.id)
    const built = buildOrderDraft(pv, customer, products, { createdBy: userId, sourceEmailId: inboxId })
    if (!built.ok) { setErrors(built.errors); setPhase('error'); return }
    if (invoices && !customer?.freshbooksId) {
      setErrors([`No FreshBooks ID is set for ${customer?.name}. Add it on the customer page first, so the order and its invoice can be created together.`]); setPhase('error'); return
    }
    setPhase('checking')
    try {
      const rec = await getDoc(doc(db, 'poEmails', inboxId))
      const st = rec.exists() ? (rec.data() as any).status : null
      if (!rec.exists()) throw new Error('This email is no longer in the inbox list.')
      if (st === 'order_created') throw new Error(`An order was already created from this email (${(rec.data() as any).orderId || 'id unknown'}).`)
      if (st === 'ignored') throw new Error('This email was marked ignored, so it cannot be approved.')

      const byDate = await ordersService.getByDate(built.draft.deliveryDate)
      const poSnap = built.draft.poNumber
        ? await getDocs(query(collection(db, 'orders'), where('poNumber', '==', built.draft.poNumber)))
        : null
      const all = new Map<string, ExistingOrder>()
      byDate.forEach(o => all.set(o.id, o as any))
      poSnap?.docs.forEach(d => all.set(d.id, { id: d.id, ...(d.data() as any) }))
      const found = findOrderDuplicates(Array.from(all.values()), {
        customerId: built.draft.customerId, deliveryDate: built.draft.deliveryDate, poNumber: built.draft.poNumber,
      })
      if (found.samePo) {
        throw new Error(`PO ${built.draft.poNumber} already became an order for ${found.samePo.customerName || 'this customer'} (delivery ${found.samePo.deliveryDate}). Nothing was created.`)
      }
      setDraft(built.draft); setSummary(built.summary); setDup(found); setAck(false); setPhase('confirm')
    } catch (e: any) {
      setErrors([e?.message || String(e)]); setPhase('error')
    }
  }

  const create = async () => {
    if (!draft) return
    setPhase('creating')
    const ref = doc(db, 'poEmails', inboxId)
    let claimedFrom: string | null = null
    let createdId = ''
    try {
      await runTransaction(db, async tx => {
        const s = await tx.get(ref)
        if (!s.exists()) throw new Error('This email is no longer in the inbox list.')
        const d: any = s.data()
        if (d.status === 'order_created') throw new Error('An order was already created from this email.')
        if (d.status === 'creating' && Date.now() - Date.parse(d.claimedAt || '') < 5 * 60_000) {
          throw new Error(`${d.claimedBy || 'Someone'} is creating this order right now. Wait a minute and refresh.`)
        }
        claimedFrom = d.status
        tx.update(ref, { status: 'creating', claimedBy: userEmail, claimedAt: new Date().toISOString() })
      })
      createdId = await ordersService.create(draft as any)
      await updateDoc(ref, { status: 'order_created', orderId: createdId, handledBy: userEmail, handledAt: new Date().toISOString() })
      setOrderId(createdId)
      const customer = customers.find(c => c.id === draft.customerId)
      const body = invoices && customer && summary ? buildInvoicePayload(createdId, draft, customer, summary) : null
      setPayload(body); setPhase('done'); onCreated()
      if (body) await sendInvoice(createdId, body)
    } catch (e: any) {
      if (createdId) {
        setErrors([`The order WAS created (id ${createdId}), but the inbox record could not be updated: ${e?.message || e}. Do not approve this email again; tell Ren.`])
      } else {
        if (claimedFrom) { try { await updateDoc(ref, { status: claimedFrom, claimedBy: null, claimedAt: null }) } catch {} }
        setErrors([e?.message || String(e)])
      }
      setPhase('error')
    }
  }

  return (
    <div className="mt-5 p-4 rounded border border-bark-800/20 bg-white">
      <div className="font-semibold text-bark-900 text-sm mb-2">Approve this order</div>

      {phase === 'error' && (
        <div className="mb-3 p-3 rounded border border-red-300 bg-red-50 text-sm text-red-800">
          <ul className="list-disc ml-5 space-y-0.5">{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {(phase === 'idle' || phase === 'error' || phase === 'checking') && (
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-primary" disabled={nBlock > 0 || phase === 'checking'} onClick={check}>
            {phase === 'checking' ? 'Checking…' : 'Approve and create order'}
          </button>
          <span className="text-xs text-bark-800/60">
            {nBlock > 0 ? `Resolve the ${nBlock} blocking issue(s) above first.` : 'You will see a summary and be asked to confirm before anything is created.'}
          </span>
        </div>
      )}

      {(phase === 'confirm' || phase === 'creating') && draft && summary && dup && (
        <div className="text-sm text-bark-900 space-y-3">
          <div className="p-3 rounded bg-cream-100 border border-wheat-300">
            <div><b>{draft.customerName}</b>, delivery <b>{draft.deliveryDate}</b>{draft.poNumber ? <>, PO <b>{draft.poNumber}</b></> : null}</div>
            <div className="mt-1">{summary.itemCount} product line(s) · subtotal {money(summary.subtotal)}
              {summary.fuel > 0 && <> · fuel surcharge {money(summary.fuel)}</>}
              {summary.cc > 0 && <> · card surcharge {money(summary.cc)}</>}
              {' '}· <b>total {money(summary.total)}</b></div>
            <div className="mt-1 text-xs text-bark-800/60">Created as a confirmed order, the same as one typed on the New Order page.{' '}
              {invoices ? <b>A FreshBooks invoice will be created right after.</b> : 'No FreshBooks invoice is created (invoice creation is switched off).'}</div>
          </div>

          {dup.sameDay.length > 0 && (
            <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900">
              <div className="font-semibold">{draft.customerName} already has {dup.sameDay.length} order(s) for {draft.deliveryDate}:</div>
              <ul className="list-disc ml-5">{dup.sameDay.map(o => <li key={o.id}>Order {o.id}{o.poNumber ? ` (PO ${o.poNumber})` : ' (no PO number, probably typed in by hand)'}{typeof o.totalAmount === 'number' ? `, ${money(o.totalAmount)}` : ''}</li>)}</ul>
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
                I checked: this is a separate order, not one that was already entered.
              </label>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={phase === 'creating' || (dup.sameDay.length > 0 && !ack)} onClick={create}>
              {phase === 'creating' ? 'Creating…' : 'Yes, create the order'}
            </button>
            <button className="btn-ghost" disabled={phase === 'creating'} onClick={() => setPhase('idle')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
