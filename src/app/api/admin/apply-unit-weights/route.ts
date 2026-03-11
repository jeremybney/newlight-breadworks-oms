import { NextResponse } from 'next/server'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Direct product ID → unit weight (grams) — IDs match src/lib/products.ts exactly
const WEIGHTS_BY_ID: Record<string, number> = {
  // RYE
  'rye-large': 1600, 'rye-retail': 600, 'rye-dinner-roll': 50,
  'mini-deli-rye-roll': 25, 'rye-hoagie': 170, 'light-rye-sandwich': 600,
  // MULTIGRAIN
  'mg-large': 1600, 'mg-retail': 600, 'mg-boule': 900, 'mg-batard': 1400,
  'mg-baguette': 350, 'mg-hoagie': 170, 'mg-burger-bun': 120,
  'mg-dinner-roll': 50, 'mg-mini-roll': 25, 'whole-wheat-hoagie': 240,
  // MILK BREAD
  'mb-5in-burger-bun': 100, 'mb-5in-burger-seeded': 100, 'mb-4in-burger-bun': 90,
  'mb-bread-slider-seeded': 30, 'mb-bread-slider': 30,
  'mb-large': 1200, 'mb-retail': 500, 'mb-large-fit-sliced': 1200,
  'mb-large-sliced': 1200, 'mb-mini-loaf-roll': 25,
  // BRIOCHE
  'brioche-pullman-retail': 500, 'brioche-pullman-large': 1100,
  'bun-sesame-seeded': 85, 'bun-everything': 85, 'bun-plain': 85,
  'bun-mini-hamburger': 60, 'bun-large-hamburger': 100, 'bun-large-seeded': 100,
  'parker-house-roll': 40, 'parker-house-roll-oeuf': 40,
  'hotdog-bun': 65, 'hotdog-bun-8in': 80, 'hotdog-bun-mini': 40,
  'parker-house-dinner': 55, 'mini-hotdog-bun': 40,
  'croissant': 80, 'plain-croissant': 80, 'chocolate-croissant': 80,
  'portmanteau-sandwich': 120,
  // CHALLAH
  'challah-roll': 45, 'challah-parker-house': 40,
  'challah-burger-bun': 100, 'challah-burger-bun-2': 100,
  // POOLISH
  'italian-baguette': 230, 'demi-italian-baguette': 150, 'mini-baguette': 75,
  'italian-baguette-24in': 500, 'ciabatta-large': 600, 'ciabatta-small': 75,
  'ciabatta-4in': 135, 'ciabatta-6in': 200, 'ciabatta-medium': 600,
  'ciabatta-large-loaf': 600, 'italian-hoagie-p': 170, 'italian-hoagie-s': 200,
  'italian-slider': 45, 'italian-dinner-roll': 50,
  'italian-burger-bun-reg': 100, 'italian-burger-bun': 120,
  'italian-batard': 1500, 'italian-batard-large': 1500, 'olive-italian-batard': 1500,
  'kaiser-roll': 120, 'kaiser-roll-slider': 60, 'mini-kaiser': 40,
  // BAGUETTE / FOCACCIA
  'sd-baguette-24in': 500, 'sd-focaccia-wholesale': 1800,
  'sd-focaccia-retail': 325, 'sd-focaccia-half': 900,
  'sd-baguette': 235, 'demi-sd-baguette': 150, 'fougasse': 350,
  'sd-pullman-large': 1800, 'sd-dinner-roll': 65,
  'sd-burger-bun': 100, 'mini-sd-roll': 25, 'french-baguette': 230,
  // BOULE
  'boule-4in': 150, 'boule-8in': 250,
  'sd-boule-large-orig': 900, 'sd-boule-large-seeded': 900,
  'sd-batard': 900, 'sd-batard-seeded': 900, 'sd-batard-tri-sliced': 900,
  'large-batard': 1500, 'large-batard-sliced': 1500,
  // SEMOLINA
  'semolina': 900, 'semolina-hoagie': 170, 'semolina-baguette-24in': 450,
  'semolina-burger-bun': 100, 'mini-semolina-roll': 25,
  'semolina-hoagie-lg': 170, 'semolina-hoagie-seeded': 170,
  'semolina-twist': 120, 'semolina-mini-baguette': 75,
  // PRETZEL
  'pretzel-loop-lg-sliced': 250, 'pretzel-loop-lg-soft': 250,
  'jumbo-pretzel-sliced': 455, 'pretzel-hero-nosalt': 180,
  'pretzel-burger-bun': 140, 'pretzel-parker-house': 45,
  // POTATO MILK
  'white-bread-large': 1200,
  // WHITE / SICILIAN
  'sicilian-pizza': 1000, 'scilian-roll': 300, 'sicilian': 1000, 'white-sandwich': 600,
  // WHOLE WHEAT
  'ww-sandwich': 600, 'whole-wheat-sandwich': 600,
}

export async function POST() {
  try {
    const entries = Object.entries(WEIGHTS_BY_ID)
    let updated = 0
    const BATCH_SIZE = 400

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const chunk = entries.slice(i, i + BATCH_SIZE)
      for (const [productId, unitWeight] of chunk) {
        // set with merge:true works whether the doc exists or not
        batch.set(doc(db, 'products', productId), { unitWeight }, { merge: true })
        updated++
      }
      await batch.commit()
    }

    return NextResponse.json({ success: true, updated, total: entries.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
