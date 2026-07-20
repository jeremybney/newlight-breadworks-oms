// ─── DOUGH CATEGORIES ────────────────────────────────────────────────────────
export type DoughCategory =
  | 'RYE'
  | 'MULTIGRAIN'
  | 'MILK_BREAD'
  | 'BRIOCHE'
  | 'POOLISH'
  | 'BAGUETTE_FOCACCIA'
  | 'BOULE'
  | 'SEMOLINA'
  | 'PRETZEL'
  | 'CHALLAH'
  | 'WHITE'
  | 'WHOLE_WHEAT'
  | 'SCHRIPPS'

export const DOUGH_CATEGORIES: { id: DoughCategory; label: string; color: string }[] = [
  { id: 'RYE',               label: 'Rye',               color: '#8B6355' },
  { id: 'MULTIGRAIN',        label: 'Multigrain',        color: '#7A8B55' },
  { id: 'MILK_BREAD',        label: 'Milk Bread',        color: '#D4A574' },
  { id: 'BRIOCHE',           label: 'Brioche',           color: '#E8C547' },
  { id: 'POOLISH',           label: 'Poolish',           color: '#A8C5A0' },
  { id: 'BAGUETTE_FOCACCIA', label: 'Baguette / Focaccia', color: '#C4A882' },
  { id: 'BOULE',             label: 'Boule',             color: '#9B8EA8' },
  { id: 'SEMOLINA',          label: 'Semolina',          color: '#E8D5A3' },
  { id: 'PRETZEL',           label: 'Pretzel',           color: '#A0522D' },
  { id: 'CHALLAH',           label: 'Challah',           color: '#F4C842' },
  { id: 'WHITE',             label: 'White',             color: '#F5F0E8' },
  { id: 'WHOLE_WHEAT',       label: 'Whole Wheat',       color: '#8B7355' },
  { id: 'SCHRIPPS',          label: 'Schripps',          color: '#2563EB' },
]

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
export interface Product {
  id: string
  name: string
  category: DoughCategory
  canBeSliced: boolean
  active: boolean
  sortOrder: number
  unitWeight?: number  // grams per unit, used for mix sheet dough calculations
  isSchripps?: boolean // sourced from Schripps bakery, excluded from production
  schrippsCode?: string // Schripps product code e.g. "SNL41001"
}

// ─── CUSTOMER ────────────────────────────────────────────────────────────────
export type CustomerType = 'Wholesale' | 'Retail' | 'Farmers Market'

export interface Customer {
  id: string
  name: string
  type: CustomerType
  route: string
  code: string
  address: string           // delivery address notes
  deliveryInfo: string      // e.g. "B2", "ND1"
  callNumber: string
  packagingType: string     // e.g. "Wholesale", "Plastic Retail"
  distributor: string       // e.g. "FS", "ALLNP"
  email: string
  phone: string
  notes: string
  active: boolean
  createdAt: string
  // Per-product pricing: productId -> price
  pricing: Record<string, number>
  // Per-product slicing preferences: productId -> slicing instruction
  slicing: Record<string, string>  // e.g. "TH Sliced", "Sliced", ""
  fuelSurchargeDefault?: boolean  // auto-apply fuel surcharge on new orders for this customer
  freshbooksClientId?: string
  freshbooksId?: string
  invoiceEmail?: string
}

// ─── ORDER ITEM ───────────────────────────────────────────────────────────────
export interface OrderItem {
  productId: string
  productName: string
  category: DoughCategory
  quantity: number
  unitPrice: number
  slicing: string   // "" | "TH Sliced" | "Sliced" | etc.
}

// ─── ORDER ───────────────────────────────────────────────────────────────────
export type OrderStatus = 'pending' | 'confirmed' | 'fulfilled' | 'cancelled'

export interface Order {
  id: string
  customerId: string
  customerName: string
  deliveryDate: string        // ISO date string YYYY-MM-DD
  items: OrderItem[]
  status: OrderStatus
  isRecurring: boolean
  recurringScheduleId?: string
  notes: string
  createdAt: string
  createdBy: string           // staff user id
  zapierSent: boolean
  totalAmount: number
}

// ─── RECURRING SCHEDULE ──────────────────────────────────────────────────────
export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'
export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export interface RecurringSchedule {
  id: string
  customerId: string
  customerName: string
  frequency: RecurringFrequency
  daysOfWeek: DayOfWeek[]     // for weekly/biweekly
  items: OrderItem[]
  startDate: string
  endDate?: string
  active: boolean
  createdAt: string
  createdBy: string
  // Dates where this schedule was cancelled (exceptions)
  cancelledDates: string[]
}

// ─── MIX SHEET ENTRY ─────────────────────────────────────────────────────────
export interface MixSheetEntry {
  id: string
  date: string
  doughWeights: Record<DoughCategory, number>   // grams entered by baker
  notes: string
  createdBy: string
  createdAt: string
}

// ─── USER / AUTH ─────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'staff' | 'baker'

export interface AppUser {
  id: string
  email: string
  name: string
  role: UserRole
  active: boolean
  createdAt: string
}

// ─── PRODUCTION SUMMARY (computed, not stored) ────────────────────────────────
export interface ProductionSummary {
  date: string
  // productId -> { total, byCustomer: { customerId -> { qty, slicing } } }
  byProduct: Record<string, {
    total: number
    byCustomer: Record<string, { qty: number; slicing: string }>
  }>
  // DoughCategory -> total units
  byCategory: Record<string, number>
}
