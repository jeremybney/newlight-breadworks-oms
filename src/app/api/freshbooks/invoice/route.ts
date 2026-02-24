import { NextRequest, NextResponse } from 'next/server'
import { findOrCreateClient, createInvoice } from '@/lib/freshbooks'
import { getValidAccessToken } from '@/lib/freshbooks-tokens'
import { ordersService } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, deliveryDate, customerName, customerEmail, items } = body

    console.log('FreshBooks invoice request:', { orderId, customerName, itemCount: items?.length })

    if (!orderId || !customerName || !items?.length) {
      return NextResponse.json({ error: `Missing fields: orderId=${orderId}, customerName=${customerName}, items=${items?.length}` }, { status: 400 })
    }

    const accessToken = await getValidAccessToken()
    console.log('Got access token, finding/creating client...')

    const clientId = await findOrCreateClient(accessToken, customerName, customerEmail)
    console.log('Client ID:', clientId)

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

    console.log(`Invoice ${invoiceNumber} created for ${customerName}, order ${orderId}`)

    await ordersService.update(orderId, {
      freshbooksInvoiceId: invoiceId,
      freshbooksInvoiceNumber: invoiceNumber,
    } as any)

    return NextResponse.json({ success: true, invoiceId, invoiceNumber })
  } catch (err: any) {
    console.error('FreshBooks invoice error:', err.message, err.stack)
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 })
  }
}
