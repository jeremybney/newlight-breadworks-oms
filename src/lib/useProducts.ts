'use client'
import { useState, useEffect } from 'react'
import { Product, DOUGH_CATEGORIES } from '@/types'
import { ProductCategory, productsService, categoriesService, seedProductsToFirestore } from './products-dynamic'
import { PRODUCTS as STATIC_PRODUCTS } from './products'

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(STATIC_PRODUCTS)
  const [categories, setCategories] = useState<ProductCategory[]>(
    DOUGH_CATEGORIES.map((c, i) => ({
      id: c.id, label: c.label, color: c.color, sortOrder: i * 10, active: true
    }))
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub1 = productsService.subscribeAll((firestoreProducts) => {
      if (firestoreProducts.length >= STATIC_PRODUCTS.length) {
        // Firestore has all products — use it as source of truth
        setProducts(firestoreProducts.filter(p => p.active !== false))
      } else {
        // Firestore is incomplete — merge: static products + any extras added in Firestore
        const firestoreIds = new Set(firestoreProducts.map(p => p.id))
        const staticNotInFirestore = STATIC_PRODUCTS.filter(p => !firestoreIds.has(p.id))
        const merged = [...firestoreProducts.filter(p => p.active !== false), ...staticNotInFirestore]
        setProducts(merged)
      }
      setLoading(false)
    })

    const unsub2 = categoriesService.subscribeAll((firestoreCategories) => {
      if (firestoreCategories.length > 0) {
        setCategories(firestoreCategories)
      }
    })

    return () => { unsub1(); unsub2() }
  }, [])

  const productsByCategory = products.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, Product[]>)

  const getProductById = (id: string) => products.find(p => p.id === id)

  return { products, categories, productsByCategory, getProductById, loading }
}
