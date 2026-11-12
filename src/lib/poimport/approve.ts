// Turns an approved PO preview into the order record the OMS stores, and finds duplicates.
// Pure logic with no database access: the page does the reading and writing. The order produced is
// shaped exactly like one entered on the New Order page (same fields, same status, same total rule).
import { Customer, Product } from '@/types'
import { PreviewOrder } from './types'
import { blockingCount } from './build'

// The New Order page hard-codes these two surcharge values; they are mirrored here so an imported
// order is priced the same as a hand-entered one. If you change them there, change them here.
export const FUEL_SURCHARGE_AMOUNT = 4.0
export const CC_SURCHARGE_PERCENT = 3.0

export interface DraftItem {
  productId: string
  productName: string
  category: any
  quantity: number
  unitPrice: number
  slicing: string
}

export interface OrderDraft {
  customerId: string
  customerName: string
  deliveryDate: string
  items: DraftItem[]
  status: 'confirmed'
  isRecurring: false
  notes: string
  createdBy: string
  totalAmount: number
  poNumber: string | null
  sourceEmailId: string | null
  source: 'email'
}

export interface DraftSummary {
  itemCount: number
  subtotal: number
  fuel: number
  cc: number
  total: number
}

export type DraftResult =
  | { ok: true; draft: OrderDraft; summary: DraftSummary }
  | { ok: false; errors: string[] }

export function buildOrderDraft(
  pv: PreviewOrder,
  customer: Customer | undefined,
  products: Product[],
  opts: { createdBy: string; sourceEmailId: string | null },
): DraftResult {
  const errors: string[] = []
  const nBlock = blockingCount(pv)
  if (nBlock) errors.push(`${nBlock} blocking issue(s) must be resolved first.`)
  if (!pv.customer || !customer || customer.id !== pv.customer.id) errors.push('No customer is selected.')
  if (!pv.deliveryDate) errors.push('There is no delivery date.')
  if (!pv.lines.length) errors.push('There are no lines to order.')

  // One entry per product, as the New Order page stores them. Lines for the same product and
  // slicing are added together; the same product with two different slicings cannot be stored.
  const merged = new Map<string, DraftItem>()
  for (const l of pv.lines) {
    if (!l.productId) { errors.push(`"${l.sourceDescription}" is not matched to a product.`); continue }
    if (!l.quantity || l.quantity < 1 || !Number.isInteger(l.quantity)) { errors.push(`"${l.sourceDescription}" has an invalid quantity.`); continue }
    if (l.oneUnitPrice === null || l.oneUnitPrice === undefined) { errors.push(`"${l.productName}" has no OMS price for this customer.`); continue }
    const product = products.find(p => p.id === l.productId)
    if (!product) { errors.push(`Product ${l.productId} is not in the catalog.`); continue }
    const prev = merged.get(l.productId)
    if (prev) {
      if (prev.slicing !== l.slicing) { errors.push(`"${l.productName}" appears twice with different slicing; the OMS cannot store that. Fix it in the preview.`); continue }
      prev.quantity += l.quantity
    } else {
      merged.set(l.productId, {
        productId: l.productId, productName: product.name || l.productName, category: (product as any).category,
        quantity: l.quantity, unitPrice: l.oneUnitPrice, slicing: l.slicing || '',
      })
    }
  }
  if (errors.length || !customer || !pv.deliveryDate) return { ok: false, errors }

  const items = Array.from(merged.values())
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const fuel = customer.fuelSurchargeDefault ? FUEL_SURCHARGE_AMOUNT : 0
  const cc = customer.ccSurchargeDefault ? subtotal * (CC_SURCHARGE_PERCENT / 100) : 0
  const total = subtotal + fuel + cc
  return {
    ok: true,
    summary: { itemCount: items.length, subtotal, fuel, cc, total },
    draft: {
      customerId: customer.id, customerName: customer.name, deliveryDate: pv.deliveryDate, items,
      status: 'confirmed', isRecurring: false,
      notes: pv.poNumber ? `PO ${pv.poNumber}` : '',
      createdBy: opts.createdBy, totalAmount: total,
      poNumber: pv.poNumber || null, sourceEmailId: opts.sourceEmailId, source: 'email',
    },
  }
}

export interface ExistingOrder {
  id: string
  customerId: string
  customerName?: string
  deliveryDate: string
  status?: string
  poNumber?: string | null
  totalAmount?: number
}

export interface DuplicateResult {
  samePo: ExistingOrder | null      // hard stop: this PO already became an order for this customer
  sameDay: ExistingOrder[]          // soft stop: the customer already has an order that day
}

// `orders` should hold the orders on the delivery date plus any orders carrying the same PO number.
export function findOrderDuplicates(
  orders: ExistingOrder[],
  q: { customerId: string; deliveryDate: string; poNumber: string | null },
): DuplicateResult {
  const live = orders.filter(o => o.status !== 'cancelled')
  const po = (q.poNumber || '').trim()
  const samePo = po ? live.find(o => o.customerId === q.customerId && (o.poNumber || '').trim() === po) || null : null
  const sameDay = live.filter(o => o.customerId === q.customerId && o.deliveryDate === q.deliveryDate && o.id !== samePo?.id)
  return { samePo, sameDay }
}

// What the FreshBooks invoice route needs. Built exactly as the New Order page builds it: one line per
// product (name with slicing is added by the route), plus a Fuel Surcharge line when the customer has one,
// and the card surcharge as a percentage.
export interface InvoicePayload {
  orderId: string
  deliveryDate: string
  customerId: string
  customerName: string
  customerEmail: string
  ccSurchargePercent?: number
  items: { name: string; quantity: number; unitPrice: number; slicing: string }[]
}

export function buildInvoicePayload(orderId: string, draft: OrderDraft, customer: Customer, summary: DraftSummary): InvoicePayload {
  const items = draft.items.map(i => ({ name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, slicing: i.slicing }))
  if (summary.fuel > 0) items.push({ name: 'Fuel Surcharge', quantity: 1, unitPrice: summary.fuel, slicing: '' })
  return {
    orderId, deliveryDate: draft.deliveryDate, customerId: draft.customerId, customerName: draft.customerName,
    customerEmail: customer.email || '',
    ccSurchargePercent: summary.cc > 0 ? CC_SURCHARGE_PERCENT : undefined,
    items,
  }
}
