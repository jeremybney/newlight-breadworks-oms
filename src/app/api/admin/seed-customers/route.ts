import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, addDoc } from 'firebase/firestore'

// One-time endpoint to seed customers — DELETE THIS FILE after running
export async function POST(request: NextRequest) {
  try {
    const { customers } = await request.json()
    if (!Array.isArray(customers)) {
      return NextResponse.json({ error: 'Expected { customers: [] }' }, { status: 400 })
    }
    const results = []
    for (const customer of customers) {
      const ref = await addDoc(collection(db, 'customers'), {
        ...customer,
        createdAt: new Date().toISOString(),
      })
      results.push({ id: ref.id, name: customer.name })
    }
    return NextResponse.json({ success: true, count: results.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
