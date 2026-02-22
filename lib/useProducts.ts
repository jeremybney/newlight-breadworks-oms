'use client'
import { useState, useEffect } from 'react'
import { Product, DOUGH_CATEGORIES } from '@/types'
import { ProductCategory, productsService, categoriesService, seedProductsToFirestore } from './products-dynamic'
import { PRODUCTS as STATIC_PRODUCTS } from './products'

// Singleton cache so all pages share the same loaded data
let cachedProducts: Product[] | null = null
let cachedCategories: ProductCategory[] | null = null

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(cachedProducts || STATIC_PRODUCTS)
  const [categories, setCategories] = useState<ProductCategory[]>(
    cachedCategories || DOUGH_CATEGORIES.map((c, i) => ({
      id: c.id, label: c.label, color: c.color, sortOrder: i * 10, active: true
    }))
  )
  const [loading, setLoading] = useState(!cachedProducts)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    // Subscribe to live Firestore products
    const unsub1 = productsService.subscribeAll(async (firestoreProducts) => {
      if (firestoreProducts.length === 0 && !seeded) {
        // First time — auto-seed from static list
        setSeeded(true)
        try {
          await seedProductsToFirestore(STATIC_PRODUCTS)
        } catch (e) {
          // If seeding fails, fall back to static
          cachedProducts = STATIC_PRODUCTS
          setProducts(STATIC_PRODUCTS)
        }
      } else if (firestoreProducts.length > 0) {
        cachedProducts = firestoreProducts
        setProducts(firestoreProducts)
      }
      setLoading(false)
    })

    const unsub2 = categoriesService.subscribeAll((firestoreCategories) => {
      if (firestoreCategories.length > 0) {
        cachedCategories = firestoreCategories
        setCategories(firestoreCategories)
      }
    })

    return () => { unsub1(); unsub2() }
  }, [])

  const activeProducts = products.filter(p => p.active !== false)

  const productsByCategory = activeProducts.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, Product[]>)

  const getProductById = (id: string) => products.find(p => p.id === id)

  return { products: activeProducts, allProducts: products, categories, productsByCategory, getProductById, loading }
}
