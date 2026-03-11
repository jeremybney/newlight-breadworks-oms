import { NextResponse } from 'next/server'
import { collection, getDocs, doc, updateDoc, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Unit weights from CSV — product name → grams
// Exact names from Newlight_Bread_Orders_Starter_-_Unit_Weight.csv
const UNIT_WEIGHTS: Record<string, number> = {
  // RYE
  'Rye Hoagie': 170,
  'Deli Rye (Retail)': 600,
  'Deli Rye (Large)': 1600,
  'Deli Rye Dinner Roll': 50,
  'Mini Deli Rye Roll': 25,
  // MULTIGRAIN
  'Multigrain Boule': 900,
  'Mini Multigrain Boule': 450,
  'Multigrain Batard': 1400,
  'Multigrain (Retail)': 600,
  'Multigrain (Large)': 1600,
  '17" Multigrain Baguette': 350,
  'Multigrain Hoagie': 170,
  'Multigrain Burger Bun': 120,
  'Multigrain Dinner Roll': 50,
  'Mini Multigrain Roll': 25,
  // WHOLE WHEAT
  'Whole Wheat Hoagie': 240,
  // MILK BREAD
  '5" Milk Burger Buns': 100,
  '5" Milk Burger Buns (Seeded)': 100,
  '4" Milk Burger Bun': 90,
  '3" Milk Bread Slider': 35,
  '2.5" Milk Bread Slider (Seeded)': 30,
  '2.5" Milk Bread Slider': 30,
  'Milk Bun Twist (Seeded)': 80,
  'Milk Bread (Retail)': 500,
  'Milk Bread (Large)': 1200,
  'Mini Milk Bread Roll': 25,
  'Milk Bread Cones': 100,
  // BRIOCHE
  'Brioche Pullman (Retail)': 500,
  'Brioche Pullman (Large)': 1100,
  'Hamburger Bun': 85,
  'Hamburger Bun (Sesame Seeded)': 85,
  'Large Hamburger Bun': 100,
  'Hamburger Bun (Everything)': 85,
  'Parker House Roll': 40,
  'Large Hamburger Bun (Seeded)': 100,
  'Hot Dog Bun': 65,
  '8" Hot Dog Bun': 80,
  '3" Dinner Roll': 55,
  'Mini Hot Dog Bun': 40,
  '3" Hot Dog Bun': 45,
  // CHALLAH (uses Brioche dough)
  'Challah Rolls': 45,
  'Challah Parker House Rolls': 40,
  'Challah Burger Bun': 100,
  // POOLISH
  'Italian Baguette': 230,
  'Demi Italian Baguette': 150,
  'Mini Baguette': 75,
  '24" Italian Baguette': 500,
  'Ciabatta': 135,
  'Ciabatta (Small)': 75,
  '6" Ciabatta': 200,
  '9" Ciabatta': 500,
  'Medium Ciabatta': 600,
  'Large Ciabatta': 600,
  'Italian Hoagie': 170,
  'Italian Hoagie 9"': 200,
  "6' Italian Hoagie": 1500,
  'Italian Dinner Roll': 50,
  'Italian Burger Bun (120g)': 120,
  'Italian Burger Bun (100g)': 100,
  'Italian Slider 3"': 45,
  'Italian Batard': 1500,
  '24" Italian Baguette (Deck)': 500,
  // SEMOLINA (uses Poolish dough)
  'Semolina': 900,
  'Semolina Hoagie (Seeded)': 170,
  'Semolina Twist': 120,
  '24" Semolina Baguette': 450,
  'Mini Semolina Roll': 25,
  'Semolina Burger Bun': 100,
  'Semolina Hoagie (No Seeds)': 170,
  // BAGUETTE / FOCACCIA
  'Sourdough Focaccia (Wholesale)': 1800,
  'Sourdough Focaccia (Retail)': 325,
  'Sourdough Focaccia (Half Sheet)': 900,
  'Sourdough Baguette': 235,
  '24" Sourdough Baguette': 500,
  'Demi Sourdough Baguette': 150,
  'Ficelle': 350,
  'Sourdough Pullman (Large)': 1800,
  'Dinner Roll': 65,
  'Mini Sourdough Roll': 25,
  'Sourdough Burger Bun': 100,
  // BOULE
  '4" Boule': 150,
  '5" Boule': 250,
  'Large Sourdough Boule (Original)': 900,
  'Large Sourdough Boule (Seeded)': 900,
  'Sourdough Batard': 900,
  'Sourdough Batard (Seeded)': 900,
  'Large Batard': 1500,
  'Sour Display': 2000,
  // PRETZEL
  'Large Pretzel Loop (Salted)': 250,
  'Large Pretzel Loop (Unsalted)': 250,
  'Jumbo Pretzel Loop (Salted)': 455,
  'Pretzel Hero (No Salt)': 180,
  'Pretzel Burger Bun': 140,
  'Pretzel Parker House Roll': 45,
  // WHITE BREAD
  'White Bread (Large)': 1200,
  // POTATO MILK / SICILIAN
  'Sicilian': 1000,
  // COCO BREAD
  'Coco Bread': 100,
}

export async function POST() {
  try {
    const snap = await getDocs(query(collection(db, 'products')))
    const products = snap.docs.map(d => ({ id: d.id, name: d.data().name as string }))

    let updated = 0
    const skipped: string[] = []

    for (const product of products) {
      // Try exact match first
      let weight = UNIT_WEIGHTS[product.name]

      // Try case-insensitive match
      if (weight === undefined) {
        const key = Object.keys(UNIT_WEIGHTS).find(
          k => k.toLowerCase() === product.name.toLowerCase()
        )
        if (key) weight = UNIT_WEIGHTS[key]
      }

      // Try partial match (product name contains CSV name or vice versa)
      if (weight === undefined) {
        const key = Object.keys(UNIT_WEIGHTS).find(k =>
          product.name.toLowerCase().includes(k.toLowerCase()) ||
          k.toLowerCase().includes(product.name.toLowerCase())
        )
        if (key) weight = UNIT_WEIGHTS[key]
      }

      if (weight !== undefined) {
        await updateDoc(doc(db, 'products', product.id), { unitWeight: weight })
        updated++
      } else {
        skipped.push(product.name)
      }
    }

    return NextResponse.json({ success: true, updated, skipped, total: products.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
