import { NextRequest, NextResponse } from 'next/server'
import { findOrCreateClient, createInvoice } from '@/lib/freshbooks'
import { getValidAccessToken } from '@/lib/freshbooks-tokens'
import { ordersService } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      orderId,
      deliveryDate,
      customerName,
      customerEmail,
      items,
    } = body

    if (!orderId || !customerName || !items?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const accessToken = await getValidAccessToken()

    // Find or create the client in FreshBooks
    const clientId = await findOrCreateClient(accessToken, customerName, customerEmail)

    // Create the invoice
    const { invoiceId, invoiceNumber } = await createInvoice(accessToken, {
      clientId,
      orderId,
      deliveryDate,
      customerName,
      items: items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        unit_cost: item.unitPrice,
        slicing: item.slicing,
      })),
    })

    // Mark order as invoiced in Firestore
    await ordersService.update(orderId, {
      freshbooksInvoiceId: invoiceId,
      freshbooksInvoiceNumber: invoiceNumber,
    } as any)

    console.log(`Invoice ${invoiceNumber} created for ${customerName}, order ${orderId}`)

    return NextResponse.json({ success: true, invoiceId, invoiceNumber })
  } catch (err: any) {
    console.error('FreshBooks invoice error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
