import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, Timestamp, writeBatch,
  QuerySnapshot, DocumentData
} from 'firebase/firestore'
import { db } from './firebase'
import { Customer, Order, RecurringSchedule, MixSheetEntry, AppUser, OrderItem } from '@/types'
import { addDays, addWeeks, addMonths, format, parseISO } from 'date-fns'

// ─── COLLECTIONS ─────────────────────────────────────────────────────────────
const CUSTOMERS_COL    = 'customers'
const ORDERS_COL       = 'orders'
const RECURRING_COL    = 'recurringSchedules'
const MIX_SHEET_COL    = 'mixSheets'
const USERS_COL        = 'users'

// ─── CUSTOMER OPERATIONS ─────────────────────────────────────────────────────
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
    const ref = await addDoc(collection(db, CUSTOMERS_COL), {
      ...data,
      createdAt: new Date().toISOString(),
    })
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

// ─── ORDER OPERATIONS ─────────────────────────────────────────────────────────
export const ordersService = {
  async getByDate(date: string): Promise<Order[]> {
    const snap = await getDocs(
      query(collection(db, ORDERS_COL), where('deliveryDate', '==', date))
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
  },

  async getByCustomer(customerId: string): Promise<Order[]> {
    const snap = await getDocs(
      query(collection(db, ORDERS_COL),
        where('customerId', '==', customerId),
        orderBy('deliveryDate', 'desc'))
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
  },

  async create(data: Omit<Order, 'id' | 'createdAt' | 'zapierSent'>): Promise<string> {
    const orderData = {
      ...data,
      createdAt: new Date().toISOString(),
      zapierSent: false,
    }
    const ref = await addDoc(collection(db, ORDERS_COL), orderData)
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

// ─── RECURRING SCHEDULE OPERATIONS ───────────────────────────────────────────
export const recurringService = {
  async getAll(): Promise<RecurringSchedule[]> {
    const snap = await getDocs(
      query(collection(db, RECURRING_COL), where('active', '==', true))
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringSchedule))
  },

  async getByCustomer(customerId: string): Promise<RecurringSchedule[]> {
    const snap = await getDocs(
      query(collection(db, RECURRING_COL), where('customerId', '==', customerId))
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RecurringSchedule))
  },

  async create(data: Omit<RecurringSchedule, 'id' | 'createdAt' | 'cancelledDates'>): Promise<string> {
    const ref = await addDoc(collection(db, RECURRING_COL), {
      ...data,
      createdAt: new Date().toISOString(),
      cancelledDates: [],
    })
    return ref.id
  },

  async cancelDate(scheduleId: string, date: string): Promise<void> {
    const snap = await getDoc(doc(db, RECURRING_COL, scheduleId))
    if (!snap.exists()) return
    const data = snap.data() as RecurringSchedule
    const cancelledDates = [...(data.cancelledDates || []), date]
    await updateDoc(doc(db, RECURRING_COL, scheduleId), { cancelledDates })
  },

  async deactivate(scheduleId: string): Promise<void> {
    await updateDoc(doc(db, RECURRING_COL, scheduleId), { active: false })
  },

  // Generate order instances for a date range from all active schedules
  async generateOrdersForDate(targetDate: string): Promise<Omit<Order, 'id' | 'createdAt' | 'zapierSent'>[]> {
    const schedules = await this.getAll()
    const date = parseISO(targetDate)
    const dayName = format(date, 'EEE') as any
    const orders: Omit<Order, 'id' | 'createdAt' | 'zapierSent'>[] = []

    for (const schedule of schedules) {
      if (schedule.cancelledDates.includes(targetDate)) continue
      if (schedule.endDate && targetDate > schedule.endDate) continue
      if (targetDate < schedule.startDate) continue

      let shouldInclude = false
      if (schedule.frequency === 'daily') {
        shouldInclude = true
      } else if (schedule.frequency === 'weekly' || schedule.frequency === 'biweekly') {
        shouldInclude = schedule.daysOfWeek.includes(dayName)
      } else if (schedule.frequency === 'monthly') {
        const startDay = parseISO(schedule.startDate).getDate()
        shouldInclude = date.getDate() === startDay
      }

      if (shouldInclude) {
        const total = schedule.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
        orders.push({
          customerId: schedule.customerId,
          customerName: schedule.customerName,
          deliveryDate: targetDate,
          items: schedule.items,
          status: 'confirmed',
          isRecurring: true,
          recurringScheduleId: schedule.id,
          notes: '',
          createdBy: 'system',
          totalAmount: total,
        })
      }
    }
    return orders
  },
}

// ─── MIX SHEET OPERATIONS ─────────────────────────────────────────────────────
export const mixSheetService = {
  async getByDate(date: string): Promise<MixSheetEntry | null> {
    const snap = await getDocs(
      query(collection(db, MIX_SHEET_COL), where('date', '==', date))
    )
    if (snap.empty) return null
    const d = snap.docs[0]
    return { id: d.id, ...d.data() } as MixSheetEntry
  },

  async save(data: Omit<MixSheetEntry, 'id' | 'createdAt'>): Promise<string> {
    // Check if entry exists for this date
    const existing = await this.getByDate(data.date)
    if (existing) {
      await updateDoc(doc(db, MIX_SHEET_COL, existing.id), data)
      return existing.id
    }
    const ref = await addDoc(collection(db, MIX_SHEET_COL), {
      ...data,
      createdAt: new Date().toISOString(),
    })
    return ref.id
  },
}

// ─── USER OPERATIONS ──────────────────────────────────────────────────────────
export const usersService = {
  async getById(id: string): Promise<AppUser | null> {
    const snap = await getDoc(doc(db, USERS_COL, id))
    return snap.exists() ? { id: snap.id, ...snap.data() } as AppUser : null
  },

  async create(id: string, data: Omit<AppUser, 'id' | 'createdAt'>): Promise<void> {
    await updateDoc(doc(db, USERS_COL, id), {
      ...data,
      createdAt: new Date().toISOString(),
    })
  },

  async getAll(): Promise<AppUser[]> {
    const snap = await getDocs(collection(db, USERS_COL))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser))
  },
}

// ─── ZAPIER / FRESHBOOKS WEBHOOK ──────────────────────────────────────────────
export const sendToZapier = async (order: Order, customer: Customer): Promise<boolean> => {
  const webhookUrl = process.env.NEXT_PUBLIC_ZAPIER_WEBHOOK_URL
  if (!webhookUrl) return false

  try {
    const payload = {
      orderId: order.id,
      orderDate: order.deliveryDate,
      customerName: customer.name,
      customerEmail: customer.email,
      items: order.items.map(item => ({
        name: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
        slicing: item.slicing || '',
      })),
      totalAmount: order.totalAmount,
      notes: order.notes,
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      await ordersService.update(order.id, { zapierSent: true })
      return true
    }
    return false
  } catch (err) {
    console.error('Zapier webhook failed:', err)
    return false
  }
}

// ─── PRODUCTION SUMMARY CALCULATOR ───────────────────────────────────────────
export const computeProductionSummary = (orders: Order[]) => {
  const byProduct: Record<string, {
    total: number
    byCustomer: Record<string, { qty: number; slicing: string; customerName: string }>
  }> = {}

  const activeOrders = orders.filter(o => o.status !== 'cancelled')

  for (const order of activeOrders) {
    for (const item of order.items) {
      if (!byProduct[item.productId]) {
        byProduct[item.productId] = { total: 0, byCustomer: {} }
      }
      byProduct[item.productId].total += item.quantity
      if (!byProduct[item.productId].byCustomer[order.customerId]) {
        byProduct[item.productId].byCustomer[order.customerId] = {
          qty: 0,
          slicing: item.slicing || '',
          customerName: order.customerName,
        }
      }
      byProduct[item.productId].byCustomer[order.customerId].qty += item.quantity
    }
  }

  return byProduct
}
