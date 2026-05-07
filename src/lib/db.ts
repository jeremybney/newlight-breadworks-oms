import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, setDoc
} from 'firebase/firestore'
import { db } from './firebase'
import { Customer, Order, RecurringSchedule, MixSheetEntry, AppUser, OrderItem } from '@/types'
import { addDays, format, parseISO } from 'date-fns'

const CUSTOMERS_COL = 'customers'
const ORDERS_COL    = 'orders'
const RECURRING_COL = 'recurringSchedules'
const MIX_SHEET_COL = 'mixSheets'
const USERS_COL     = 'users'
const PRODUCTS_COL  = 'products'

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
export const customersService = {
  async getAll(): Promise<Customer[]> {
    const snap = await getDocs(query(collection(db, CUSTOMERS_COL), orderBy('name')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))
  },
  async getById(id: string): Promise<Customer | null> {
    const snap = await getDoc(doc(db, CUSTOMERS_COL, id))
    return snap.exists() ? { id: snap.id, ...snap.data() } as Customer : null
  },
  async create(data: Omit<Customer, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(collection(db, CUSTOMERS_COL), { ...data, createdAt: new Date().toISOString() })
    return ref.id
  },
  async update(id: string, data: Partial<Customer>): Promise<void> {
    await updateDoc(doc(db, CUSTOMERS_COL, id), data)
  },
  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, CUSTOMERS_COL, id))
  },
  subscribeAll(callback: (customers: Customer[]) => void) {
    return onSnapshot(
      query(collection(db, CUSTOMERS_COL), orderBy('name')),
      snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)))
    )
  },
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
export const ordersService = {
  async getByDate(date: string): Promise<Order[]> {
    const snap = await getDocs(query(collection(db, ORDERS_COL), where('deliveryDate', '==', date)))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
  },
  async getByCustomer(customerId: string): Promise<Order[]> {
    const snap = await getDocs(query(collection(db, ORDERS_COL), where('customerId', '==', customerId), orderBy('deliveryDate', 'desc')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
  },
  async create(data: Omit<Order, 'id' | 'createdAt' | 'zapierSent'>): Promise<string> {
    const ref = await addDoc(collection(db, ORDERS_COL), { ...data, createdAt: new Date().toISOString(), zapierSent: false })
    return ref.id
  },
  async update(id: string, data: Partial<Order>): Promise<void> {
    await updateDoc(doc(db, ORDERS_COL, id), data)
  },
  async cancel(id: string): Promise<void> {
    await updateDoc(doc(db, ORDERS_COL, id), { status: 'cancelled' })
  },
  subscribeByDate(date: string, callback: (orders: Order[]) => void) {
    return onSnapshot(
      query(collection(db, ORDERS_COL), where('deliveryDate', '==', date)),
      snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)))
    )
  },
}

// ─── RECURRING ────────────────────────────────────────────────────────────────
export const recurringService = {
  async getAll(): Promise<RecurringSchedule[]> {
    const snap = await getDocs(query(collection(db, RECURRING_COL), where('active', '==', true)))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringSchedule))
  },
  async create(data: Omit<RecurringSchedule, 'id' | 'createdAt' | 'cancelledDates'>): Promise<string> {
    const ref = await addDoc(collection(db, RECURRING_COL), { ...data, createdAt: new Date().toISOString(), cancelledDates: [] })
    return ref.id
  },
  async cancelDate(scheduleId: string, date: string): Promise<void> {
    const snap = await getDoc(doc(db, RECURRING_COL, scheduleId))
    if (!snap.exists()) return
    const data = snap.data() as RecurringSchedule
    await updateDoc(doc(db, RECURRING_COL, scheduleId), { cancelledDates: [...(data.cancelledDates || []), date] })
  },
  async deactivate(scheduleId: string): Promise<void> {
    await updateDoc(doc(db, RECURRING_COL, scheduleId), { active: false })
  },
}

// ─── MIX SHEET ────────────────────────────────────────────────────────────────
export const mixSheetService = {
  async getByDate(date: string): Promise<MixSheetEntry | null> {
    const snap = await getDocs(query(collection(db, MIX_SHEET_COL), where('date', '==', date)))
    if (snap.empty) return null
    const d = snap.docs[0]
    return { id: d.id, ...d.data() } as MixSheetEntry
  },
  async save(data: Omit<MixSheetEntry, 'id' | 'createdAt'>): Promise<string> {
    const existing = await this.getByDate(data.date)
    if (existing) {
      await updateDoc(doc(db, MIX_SHEET_COL, existing.id), data)
      return existing.id
    }
    const ref = await addDoc(collection(db, MIX_SHEET_COL), { ...data, createdAt: new Date().toISOString() })
    return ref.id
  },
}
// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export const productsService = {
  async getAll(): Promise<Record<string, number>> {
    const snap = await getDocs(collection(db, PRODUCTS_COL))
    const weights: Record<string, number> = {}
    snap.docs.forEach(d => {
      const data = d.data()
      if (data.unitWeight) weights[d.id] = data.unitWeight
    })
    return weights
  },
}

// ─── USERS ────────────────────────────────────────────────────────────────────
export const usersService = {
  async getById(id: string): Promise<AppUser | null> {
    const snap = await getDoc(doc(db, USERS_COL, id))
    return snap.exists() ? { id: snap.id, ...snap.data() } as AppUser : null
  },
  async getAll(): Promise<AppUser[]> {
    const snap = await getDocs(collection(db, USERS_COL))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser))
  },
}

// ─── ZAPIER / FRESHBOOKS ──────────────────────────────────────────────────────
export const sendToZapier = async (
  orderId: string,
  orderData: Omit<Order, 'id' | 'createdAt' | 'zapierSent'>,
  customer: Customer
): Promise<boolean> => {
  const payload = {
    orderId,
    orderDate: orderData.deliveryDate,
    customerName: customer.name,
    customerEmail: customer.email || '',
    items: orderData.items.map(item => ({
      name: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
      slicing: item.slicing || '',
    })),
    totalAmount: orderData.totalAmount,
    notes: orderData.notes || '',
  }

  console.log('Sending to Zapier via API route:', payload)

  try {
    // Call our own Next.js API route (avoids CORS issues with Zapier)
    const res = await fetch('/api/zapier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    console.log('Zapier proxy response status:', res.status)
    if (res.ok) {
      await ordersService.update(orderId, { zapierSent: true })
      return true
    }
    console.error('Zapier proxy returned error:', res.status, await res.text())
    return false
  } catch (err) {
    console.error('Zapier webhook failed:', err)
    return false
  }
}

// ─── PRODUCTION SUMMARY ───────────────────────────────────────────────────────
export const computeProductionSummary = (orders: Order[]) => {
  const byProduct: Record<string, {
    total: number
    byCustomer: Record<string, { qty: number; slicing: string; customerName: string }>
  }> = {}

  for (const order of orders.filter(o => o.status !== 'cancelled')) {
    for (const item of order.items) {
      if (!byProduct[item.productId]) byProduct[item.productId] = { total: 0, byCustomer: {} }
      byProduct[item.productId].total += item.quantity
      if (!byProduct[item.productId].byCustomer[order.customerId]) {
        byProduct[item.productId].byCustomer[order.customerId] = { qty: 0, slicing: item.slicing || '', customerName: order.customerName }
      }
      byProduct[item.productId].byCustomer[order.customerId].qty += item.quantity
    }
  }
  return byProduct
}
