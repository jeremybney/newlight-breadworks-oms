import { NextRequest, NextResponse } from 'next/server'
import { getClientById, createInvoice } from '@/lib/freshbooks'
import { getValidAccessToken } from '@/lib/freshbooks-tokens'

// Lazily initialise the Admin SDK so it only runs server-side.
// Same approach as freshbooks-tokens.ts — the regular client SDK is unreliable
// when called from a server route with no logged-in browser session attached,
// and can throw "Failed to get document because the client is offline."
function getAdminDb() {
  const admin = require('firebase-admin')

  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!)
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }

  return admin.firestore()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, deliveryDate, customerId, customerName, items, ccSurchargePercent } = body

    console.log('FreshBooks invoice request:', { orderId, customerId, customerName, itemCount: items?.length })

    if (!orderId || !customerName || !items?.length) {
      return NextResponse.json({
        error: `Missing fields: orderId=${orderId}, customerName=${customerName}, items=${items?.length}`
      }, { status: 400 })
    }

    if (!customerId) {
      return NextResponse.json({
        error: `No customerId provided for "${customerName}" — cannot look up their FreshBooks record.`
      }, { status: 400 })
    }

    const db = getAdminDb()

    // Look up the customer directly from Firestore via the Admin SDK — the live record edited on the Customers page
    const customerSnap = await db.collection('customers').doc(customerId).get()
    const customer = customerSnap.exists ? customerSnap.data() : null

    if (!customer?.freshbooksId) {
      return NextResponse.json({
        error: `No FreshBooks ID set for "${customerName}". Add it on their Customer page under FreshBooks ID.`
      }, { status: 400 })
    }

    const accessToken = await getValidAccessToken()
    console.log(`Using FreshBooks Client ID ${customer.freshbooksId} for ${customerName}`)

    // Verify client exists in FreshBooks using their Client ID directly
    const clientId = await getClientById(accessToken, customer.freshbooksId)
    console.log('Verified Client ID:', clientId)

    const { invoiceId, invoiceNumber } = await createInvoice(accessToken, {
      clientId,
      orderId,
      deliveryDate,
      customerName,
      invoiceEmail: customer.invoiceEmail || undefined,
      ccSurchargePercent,
      items: items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        unit_cost: item.unitPrice,
        slicing: item.slicing,
      })),
    })

    console.log(`Invoice ${invoiceNumber} created for ${customerName} (ID: ${clientId}), order ${orderId}`)

    await db.collection('orders').doc(orderId).update({
      freshbooksInvoiceId: invoiceId,
      freshbooksInvoiceNumber: invoiceNumber,
    })

    return NextResponse.json({ success: true, invoiceId, invoiceNumber })
  } catch (err: any) {
    console.error('FreshBooks invoice error:', err.message, err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
