// Dynamic product + category management via Firestore
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, orderBy, query, setDoc
} from 'firebase/firestore'
import { db } from './firebase'
import { Product, DoughCategory, DOUGH_CATEGORIES } from '@/types'

const PRODUCTS_COL   = 'products'
const CATEGORIES_COL = 'productCategories'

export interface ProductCategory {
  id: string
  label: string
  color: string
  sortOrder: number
  active: boolean
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
export const categoriesService = {
  async getAll(): Promise<ProductCategory[]> {
    const snap = await getDocs(query(collection(db, CATEGORIES_COL), orderBy('sortOrder')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductCategory))
  },

  async create(data: Omit<ProductCategory, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, CATEGORIES_COL), data)
    return ref.id
  },

  async update(id: string, data: Partial<ProductCategory>): Promise<void> {
    await updateDoc(doc(db, CATEGORIES_COL, id), data)
  },

 async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, CATEGORIES_COL, id))
  },
  subscribeAll(callback: (cats: ProductCategory[]) => void) {
    return onSnapshot(
      query(collection(db, CATEGORIES_COL), orderBy('sortOrder')),
      snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductCategory)))
    )
  },
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export const productsService = {
  async getAll(): Promise<Product[]> {
    const snap = await getDocs(query(collection(db, PRODUCTS_COL), orderBy('sortOrder')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))
  },

  async create(data: Omit<Product, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, PRODUCTS_COL), data)
    return ref.id
  },

 async update(id: string, data: Partial<Product> & Record<string, any>): Promise<void> {
    await updateDoc(doc(db, PRODUCTS_COL, id), data)
  },
  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, PRODUCTS_COL, id))
  },

  async deactivate(id: string): Promise<void> {
    await updateDoc(doc(db, PRODUCTS_COL, id), { active: false })
  },

  subscribeAll(callback: (products: Product[]) => void) {
    return onSnapshot(
      query(collection(db, PRODUCTS_COL), orderBy('sortOrder')),
      snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)))
    )
  },
}

// Seed Firestore with the static products list (run once from admin panel)
export const seedProductsToFirestore = async (staticProducts: Product[]) => {
  const batch: Promise<void>[] = []
  for (const p of staticProducts) {
    batch.push(setDoc(doc(db, PRODUCTS_COL, p.id), p))
  }
  // Seed built-in categories
  for (const cat of DOUGH_CATEGORIES) {
    batch.push(setDoc(doc(db, CATEGORIES_COL, cat.id), {
      label: cat.label,
      color: cat.color,
      sortOrder: DOUGH_CATEGORIES.indexOf(cat) * 10,
      active: true,
    }))
  }
  await Promise.all(batch)
}
