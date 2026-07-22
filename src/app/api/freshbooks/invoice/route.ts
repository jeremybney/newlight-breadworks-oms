import { NextRequest, NextResponse } from 'next/server'
import { getClientById, createInvoice } from '@/lib/freshbooks'
import { getValidAccessToken } from '@/lib/freshbooks-tokens'
import { ordersService } from '@/lib/db'
import { lookupClient } from '@/lib/client-master'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, deliveryDate, customerName, items, ccSurchargePercent } = body

    console.log('FreshBooks invoice request:', { orderId, customerName, itemCount: items?.length })

    if (!orderId || !customerName || !items?.length) {
      return NextResponse.json({
        error: `Missing fields: orderId=${orderId}, customerName=${customerName}, items=${items?.length}`
      }, { status: 400 })
    }

    // Look up client in master list by name
    const clientData = lookupClient(customerName)

    if (!clientData?.freshbooksId) {
      return NextResponse.json({
        error: `No FreshBooks Client ID found for "${customerName}". Please add this client to the client master sheet.`
      }, { status: 400 })
    }

    const accessToken = await getValidAccessToken()
    console.log(`Using FreshBooks Client ID ${clientData.freshbooksId} for ${customerName}`)

    // Verify client exists in FreshBooks using their Client ID directly
    const clientId = await getClientById(accessToken, clientData.freshbooksId)
    console.log('Verified Client ID:', clientId)

    const { invoiceId, invoiceNumber } = await createInvoice(accessToken, {
      clientId,
      orderId,
      deliveryDate,
      customerName,
      invoiceEmail: clientData.invoiceEmail || undefined,
      ccSurchargePercent,
      items: items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        unit_cost: item.unitPrice,
        slicing: item.slicing,
      })),
    })

    console.log(`Invoice ${invoiceNumber} created for ${customerName} (ID: ${clientId}), order ${orderId}`)

    await ordersService.update(orderId, {
      freshbooksInvoiceId: invoiceId,
      freshbooksInvoiceNumber: invoiceNumber,
    } as any)

    return NextResponse.json({ success: true, invoiceId, invoiceNumber })
  } catch (err: any) {
    console.error('FreshBooks invoice error:', err.message, err.stack)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
